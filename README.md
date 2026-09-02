# Bot WhatsApp Broadcast (Pairing Code)

Bot ini jalan pakai nomor WhatsApp lo sendiri (self-bot). Perintah cuma bisa dikirim
dari akun bot itu sendiri (misal dari chat "Pesan Saya" / grup mana pun selama yang ngirim akun lo).

## 1. Install

Butuh Node.js versi 18 ke atas. Di folder ini jalankan:

```bash
npm install
```

## 2. Setting nomor (opsional)

Buka `config.json`, isi `ownerNumber` dengan nomor WA yang mau dipakai jadi bot,
format: `628xxxxxxxxxx` (kode negara, tanpa + dan tanpa spasi/strip).
Kalau dikosongin/dibiarkan default, nanti bot bakal tanya di terminal saat pertama jalan.

## 3. Jalanin bot

```bash
npm start
```

Nanti muncul **pairing code** di terminal (contoh: `ABCD-1234`). Cara masukin di HP:
1. Buka WhatsApp di HP → **Setelan** → **Perangkat Tertaut**
2. Tap **Tautkan perangkat**
3. Tap **Tautkan dengan nomor telepon** (bukan scan QR)
4. Masukkan nomor yang sama, lalu masukkan kode yang muncul di terminal

Kalau berhasil, terminal akan nampilin "✅ Bot tersambung ke WhatsApp!". Session
tersimpan di folder `session/` — jadi lain kali jalanin `npm start` lagi ga perlu
pairing ulang selama foldernya ga dihapus & belum logout.

## 4. Cara pakai (kirim command dari chat mana aja, dari akun bot sendiri)

| Command | Fungsi |
|---|---|
| `.menu` | lihat semua command |
| `.listgrup` | ambil & simpan semua grup yang bot/nomor lo ikuti, sekalian nampilin ID-nya |
| `.setgrup all` | target broadcast = semua grup (default) |
| `.setgrup id1,id2` | target broadcast = grup tertentu aja (ID dari `.listgrup`) |
| `.bc` (reply teks/foto) | broadcast SEKALI ke semua target grup |
| `.setbc 1` (reply teks/foto) | aktifin auto-broadcast tiap 1 menit (angka bisa diganti, boleh desimal misal `.setbc 0.5` = tiap 30 detik) ke semua target grup |
| `.stopbc` | matiin auto-broadcast |

### Alur pemakaian tipikal
1. `npm start`, pairing pakai kode
2. `.listgrup` → simpen daftar grup
3. (opsional) `.setgrup id1,id2` kalau ga mau ke semua grup
4. Reply foto/teks yang mau disebar, ketik `.bc` (sekali kirim) atau `.setbc 5` (auto tiap 5 menit)
5. `.stopbc` kapan aja buat berhentiin yang otomatis

## Deploy ke Railway

1. Push folder ini ke repo GitHub (session/, node_modules, dll udah di-ignore lewat `.gitignore`).
2. Di Railway: **New Project > Deploy from GitHub repo**, pilih repo ini.
3. Buka tab **Variables**, tambahin:
   - `OWNER_NUMBER` = nomor WA bot, format `628xxxxxxxxxx` (wajib, karena Railway ga bisa nerima input ketikan manual di terminal)
4. **Wajib** tambahin **Volume** (tab Settings > Volumes) dan mount ke path `/app/session` (atau sesuai root project). Ini penting supaya session login WA ga hilang tiap kali Railway redeploy — kalau ga pakai volume, bot bakal minta pairing code ulang terus tiap deploy baru.
5. Deploy. Buka tab **Logs**, nanti pairing code-nya muncul di situ (bukan QR). Masukkan ke HP seperti biasa: **Setelan > Perangkat Tertaut > Tautkan dengan nomor telepon**.
6. Setelah berhasil connect, biarin service tetap jalan (jangan pilih "Sleep"/jangan pakai plan yang auto-sleep) supaya auto-broadcast intervalnya tetap jalan terus-terusan.

Catatan Railway lainnya:
- Project ini pakai `Procfile` dengan tipe `worker` (bukan `web`) karena bot ga buka port HTTP — pastikan Railway generate service sebagai worker/background process.
- Command/pengaturan bot (`.listgrup`, `.setbc`, dll) tetap dikirim dari HP lo lewat chat WA seperti biasa, bukan dari Railway.

## Catatan penting

- **Rawan kena banned/limit** kalau interval kekencengan atau grupnya banyak banget —
  WhatsApp bisa anggap ini spam. Kasih jeda minimal beberapa menit dan jangan broadcast
  ke ratusan grup sekaligus dari 1 nomor. Ada delay 1.5 detik antar grup di dalam kode
  buat ngurangin risiko, tapi tetap pakai secukupnya.
- Auto-broadcast (`.setbc`) tetap nyala walau bot restart (disimpan di `bcstate.json`),
  tapi kalau mau bener-bener berhenti pastikan jalankan `.stopbc`.
- Jangan share folder `session/` ke siapa pun — itu setara akses penuh ke WA lo.
- Bot ini pakai nomor WA lo sendiri, bukan API resmi WhatsApp Business, jadi tetap ada
  risiko pemblokiran dari pihak WhatsApp untuk penggunaan otomatis/broadcast massal.
