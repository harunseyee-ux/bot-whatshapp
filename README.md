# Bot WhatsApp Broadcast (QR Code / Pairing Code)

Bot ini jalan pakai nomor WhatsApp lo sendiri (self-bot). Perintah cuma bisa dikirim
dari akun bot itu sendiri (misal dari chat "Pesan Saya" / grup mana pun selama yang ngirim akun lo).

Ada 2 cara login, diatur lewat env `LOGIN_METHOD` (atau `loginMethod` di `config.json`):
- **`qr`** (default) — scan pakai kamera HP, kayak WhatsApp Web biasa.
- **`pairing`** — masukin kode 8 digit manual, butuh `OWNER_NUMBER`.

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

### Login via QR code (default)

QR code bakal muncul di 2 tempat sekaligus:
1. Langsung di terminal dalam bentuk ASCII (kadang kepotong/gepeng tergantung ukuran terminal).
2. **Lebih disarankan:** buka `http://localhost:3000` di browser — ada halaman yang nampilin
   QR-nya sebagai gambar biasa, jauh lebih gampang di-scan dan auto-refresh tiap 5 detik
   selama belum login.

Cara scan di HP:
1. Buka WhatsApp di HP → **Setelan** → **Perangkat Tertaut**
2. Tap **Tautkan perangkat**
3. Arahkan kamera ke QR yang muncul di browser/terminal

### Login via pairing code (opsional)

Set `LOGIN_METHOD=pairing` (env) dan isi `OWNER_NUMBER`, nanti muncul **pairing code**
di terminal (contoh: `ABCD-1234`). Masukin lewat **Setelan → Perangkat Tertaut →
Tautkan dengan nomor telepon** (bukan scan QR), pakai nomor yang sama.

Kalau berhasil, terminal akan nampilin "✅ Bot tersambung ke WhatsApp!". Session
tersimpan di folder `session/` — jadi lain kali jalanin `npm start` lagi ga perlu
login ulang selama foldernya ga dihapus & belum logout.

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
1. `npm start`, login pakai QR (atau pairing code kalau `LOGIN_METHOD=pairing`)
2. `.listgrup` → simpen daftar grup
3. (opsional) `.setgrup id1,id2` kalau ga mau ke semua grup
4. Reply foto/teks yang mau disebar, ketik `.bc` (sekali kirim) atau `.setbc 5` (auto tiap 5 menit)
5. `.stopbc` kapan aja buat berhentiin yang otomatis

## Deploy ke Railway

1. Push folder ini ke repo GitHub (session/, node_modules, dll udah di-ignore lewat `.gitignore`).
2. Di Railway: **New Project > Deploy from GitHub repo**, pilih repo ini.
3. (Opsional) Buka tab **Variables**, tambahin:
   - `LOGIN_METHOD` = `qr` (default, ga wajib diisi) atau `pairing`
   - `OWNER_NUMBER` = nomor WA bot, format `628xxxxxxxxxx` (cuma wajib kalau `LOGIN_METHOD=pairing`)
4. **Wajib** tambahin **Volume** (tab Settings > Volumes) dan mount ke path `/app/session` (atau sesuai root project). Ini penting supaya session login WA ga hilang tiap kali Railway redeploy — kalau ga pakai volume, bot bakal minta login ulang terus tiap deploy baru.
5. **Kalau pakai QR (default):** buka tab **Settings > Networking**, klik **Generate Domain**. Bot bakal jalanin server kecil yang nampilin halaman QR — buka domain publik itu di browser HP/laptop buat scan. Ini jauh lebih reliable dibanding baca QR ASCII dari **Logs** (yang gampang gepeng/kepotong dan bikin scan gagal terus).
6. Deploy, tunggu bot start, lalu buka domain publiknya dan scan QR-nya lewat **WhatsApp > Setelan > Perangkat Tertaut > Tautkan perangkat**. Halaman auto-refresh tiap 5 detik sampai berhasil connect.
7. Setelah berhasil connect, biarin service tetap jalan (jangan pilih "Sleep"/jangan pakai plan yang auto-sleep) supaya auto-broadcast intervalnya tetap jalan terus-terusan.

Catatan Railway lainnya:
- Bot sekarang buka port HTTP kecil (`process.env.PORT` atau `3000`) khusus buat nampilin halaman QR — port ini otomatis dipakai Railway pas lo generate domain, jadi ga perlu ubah `Procfile`.
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
