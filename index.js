const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const fs = require("fs");
const path = require("path");
const DEFAULT_CONFIG = { ownerNumber: "", prefix: ".", defaultIntervalMinutes: 1 };
let config = DEFAULT_CONFIG;
try {
  config = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync("./config.json", "utf-8")) };
} catch {
  console.log("ℹ️ config.json tidak ditemukan, pakai default (prefix '.', interval 1 menit). Nomor tetap wajib lewat env OWNER_NUMBER.");
}
// Nomor bisa diisi lewat ENV (dianjurkan di Railway) atau langsung di config.json
const OWNER_NUMBER = (process.env.OWNER_NUMBER || config.ownerNumber || "").replace(/[^0-9]/g, "");
const GROUPS_FILE = "./groups.json";
const TARGET_FILE = "./target.json";
const BC_STATE_FILE = "./bcstate.json";

// ---------- helper penyimpanan sederhana pakai file JSON ----------
function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return fallback;
  }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let groups = readJSON(GROUPS_FILE, {}); // { id: subject }
let target = readJSON(TARGET_FILE, { mode: "all", ids: [] }); // mode: "all" | "custom"
let bcState = readJSON(BC_STATE_FILE, null); // { intervalMinutes, content } saat aktif

let intervalHandle = null;

function getTargetGroupIds() {
  if (target.mode === "all") return Object.keys(groups);
  return target.ids.filter((id) => groups[id]);
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./session");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
  });

  // ---------- Pairing code login ----------
  if (!sock.authState.creds.registered) {
    if (!OWNER_NUMBER) {
      console.error(
        "\n❌ Nomor WA belum diset. Isi environment variable OWNER_NUMBER (contoh: 628123456789) " +
          "di Railway (Settings > Variables), atau isi 'ownerNumber' di config.json kalau jalan lokal.\n"
      );
      return;
    }
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(OWNER_NUMBER);
        console.log("\n=== PAIRING CODE ===");
        console.log(code?.match(/.{1,4}/g)?.join("-") || code);
        console.log("Buka WhatsApp > Perangkat Tertaut > Tautkan dengan nomor telepon, masukkan kode di atas.");
        console.log("(Cek di sini / Logs Railway kalau jalan di Railway)\n");
      } catch (e) {
        console.error("Gagal minta pairing code:", e);
      }
    }, 2000);
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const shouldReconnect =
        new Boom(lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("Koneksi terputus, reconnect:", shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === "open") {
      console.log("✅ Bot tersambung ke WhatsApp!");
      // Kalau ada broadcast interval yang tadinya aktif sebelum bot restart, nyalain lagi
      if (bcState) {
        startBroadcastInterval(sock, bcState.intervalMinutes, bcState.content, false);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message) return;
    if (msg.key.fromMe !== true) return; // self-bot: hanya proses perintah dari akun bot sendiri (nomor lo)

    const jid = msg.key.remoteJid;
    const body =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      "";

    if (!body.startsWith(config.prefix)) return;

    const [rawCmd, ...args] = body.slice(config.prefix.length).trim().split(/\s+/);
    const cmd = rawCmd.toLowerCase();
    const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;

    try {
      if (cmd === "listgrup" || cmd === "listgroup") {
        await handleListGroup(sock, jid);
      } else if (cmd === "bc" || cmd === "broadcast") {
        await handleBroadcastOnce(sock, jid, msg, quoted);
      } else if (cmd === "setbc") {
        await handleSetBc(sock, jid, msg, quoted, args);
      } else if (cmd === "stopbc") {
        await handleStopBc(sock, jid);
      } else if (cmd === "setgrup" || cmd === "settarget") {
        await handleSetTarget(sock, jid, args);
      } else if (cmd === "menu" || cmd === "help") {
        await sendMenu(sock, jid);
      }
    } catch (err) {
      console.error(err);
      await sock.sendMessage(jid, { text: "❌ Error: " + err.message });
    }
  });

  return sock;
}

// ---------- fitur: list semua grup yg bot join ----------
async function handleListGroup(sock, jid) {
  const all = await sock.groupFetchAllParticipating();
  groups = {};
  let text = "*Daftar Grup:*\n\n";
  Object.values(all).forEach((g) => {
    groups[g.id] = g.subject;
    text += `• ${g.subject}\n  ID: ${g.id}\n\n`;
  });
  writeJSON(GROUPS_FILE, groups);
  text += `\nTotal: ${Object.keys(groups).length} grup tersimpan.\nSecara default broadcast akan dikirim ke SEMUA grup ini. Pakai .setgrup untuk pilih sebagian.`;
  await sock.sendMessage(jid, { text });
}

// ---------- ambil konten (teks/foto) dari pesan yang di-reply ----------
async function extractContent(sock, quoted, msg) {
  if (!quoted) return null;

  const quotedMsgKey = {
    remoteJid: msg.key.remoteJid,
    id: msg.message.extendedTextMessage.contextInfo.stanzaId,
    participant: msg.message.extendedTextMessage.contextInfo.participant,
    fromMe: false,
  };

  const imageMsg = quoted.imageMessage;
  if (imageMsg) {
    const buffer = await downloadMediaMessage(
      { key: quotedMsgKey, message: quoted },
      "buffer",
      {}
    );
    return { type: "image", buffer, caption: imageMsg.caption || "" };
  }

  const text = quoted.conversation || quoted.extendedTextMessage?.text || "";
  if (text) return { type: "text", text };

  return null;
}

async function sendContentToGroup(sock, groupId, content) {
  if (content.type === "image") {
    await sock.sendMessage(groupId, { image: content.buffer, caption: content.caption });
  } else {
    await sock.sendMessage(groupId, { text: content.text });
  }
}

// ---------- broadcast sekali kirim (reply pesan lalu .bc) ----------
async function handleBroadcastOnce(sock, jid, msg, quoted) {
  const content = await extractContent(sock, quoted, msg);
  if (!content) {
    await sock.sendMessage(jid, {
      text: "Reply pesan teks atau foto yang mau dibroadcast, lalu ketik .bc",
    });
    return;
  }
  const ids = getTargetGroupIds();
  if (ids.length === 0) {
    await sock.sendMessage(jid, { text: "Belum ada grup tersimpan. Ketik .listgrup dulu." });
    return;
  }
  let sukses = 0;
  for (const gid of ids) {
    try {
      await sendContentToGroup(sock, gid, content);
      sukses++;
      await delay(1500); // jeda biar ga keblok/spam
    } catch (e) {
      console.error("gagal kirim ke", gid, e.message);
    }
  }
  await sock.sendMessage(jid, { text: `✅ Broadcast terkirim ke ${sukses}/${ids.length} grup.` });
}

// ---------- broadcast otomatis tiap interval ----------
async function handleSetBc(sock, jid, msg, quoted, args) {
  const content = await extractContent(sock, quoted, msg);
  if (!content) {
    await sock.sendMessage(jid, {
      text: "Reply pesan teks atau foto yang mau dijadiin broadcast otomatis, lalu ketik .setbc <menit>\nContoh: .setbc 1",
    });
    return;
  }
  const minutes = parseFloat(args[0]) || config.defaultIntervalMinutes || 1;

  // simpan konten ke file (kalau image, simpan sbg base64)
  const savedContent =
    content.type === "image"
      ? { type: "image", bufferBase64: content.buffer.toString("base64"), caption: content.caption }
      : content;

  bcState = { intervalMinutes: minutes, content: savedContent };
  writeJSON(BC_STATE_FILE, bcState);

  startBroadcastInterval(sock, minutes, savedContent, true, jid);
}

function startBroadcastInterval(sock, minutes, savedContent, notify, jid) {
  if (intervalHandle) clearInterval(intervalHandle);

  const content =
    savedContent.type === "image"
      ? { type: "image", buffer: Buffer.from(savedContent.bufferBase64, "base64"), caption: savedContent.caption }
      : savedContent;

  const ms = Math.max(minutes, 0.1) * 60 * 1000;

  intervalHandle = setInterval(async () => {
    const ids = getTargetGroupIds();
    for (const gid of ids) {
      try {
        await sendContentToGroup(sock, gid, content);
        await delay(1500);
      } catch (e) {
        console.error("gagal auto-broadcast ke", gid, e.message);
      }
    }
    console.log(`[auto-bc] terkirim ke ${ids.length} grup`);
  }, ms);

  if (notify && jid) {
    sock.sendMessage(jid, {
      text: `✅ Auto-broadcast AKTIF, tiap ${minutes} menit ke ${getTargetGroupIds().length} grup.\nKetik .stopbc untuk hentikan.`,
    });
  }
}

async function handleStopBc(sock, jid) {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  bcState = null;
  if (fs.existsSync(BC_STATE_FILE)) fs.unlinkSync(BC_STATE_FILE);
  await sock.sendMessage(jid, { text: "🛑 Auto-broadcast dihentikan." });
}

// ---------- pilih target grup ----------
async function handleSetTarget(sock, jid, args) {
  if (args[0] === "all") {
    target = { mode: "all", ids: [] };
    writeJSON(TARGET_FILE, target);
    await sock.sendMessage(jid, { text: "✅ Target diset ke SEMUA grup." });
    return;
  }
  // args berupa nomor urut dari .listgrup, atau langsung id dipisah koma
  const ids = args.join(" ").split(",").map((s) => s.trim()).filter(Boolean);
  const valid = ids.filter((id) => groups[id]);
  if (valid.length === 0) {
    await sock.sendMessage(jid, {
      text: "Format: .setgrup all  ATAU  .setgrup <id_grup1>,<id_grup2>\nID grup bisa dilihat lewat .listgrup",
    });
    return;
  }
  target = { mode: "custom", ids: valid };
  writeJSON(TARGET_FILE, target);
  await sock.sendMessage(jid, {
    text: `✅ Target diset ke ${valid.length} grup:\n` + valid.map((id) => "- " + groups[id]).join("\n"),
  });
}

async function sendMenu(sock, jid) {
  const p = config.prefix;
  const text = `*BOT BROADCAST WA*

${p}listgrup - list & simpan semua grup yang diikuti bot
${p}setgrup all - target broadcast = semua grup
${p}setgrup id1,id2 - target broadcast = grup tertentu
${p}bc - (reply pesan teks/foto) kirim sekali ke semua target grup
${p}setbc <menit> - (reply pesan teks/foto) aktifkan auto-broadcast tiap sekian menit
${p}stopbc - matikan auto-broadcast`;
  await sock.sendMessage(jid, { text });
}

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

startBot();
