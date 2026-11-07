# Takseer v0.2.2

**AI Agent Penaksir Harga Gadai** — aplikasi PWA mobile-first untuk mempercepat penaksiran agunan gadai, dengan data harga pasar **real-time hasil scraping langsung** dan keputusan akhir tetap di tangan penaksir.

| | |
|---|---|
| **Versi dokumen** | v0.2.2 |
| **Build aplikasi** | 0.2.2 |
| **Domain produksi** | `https://app.takseer.my.id` (aplikasi) · `https://takseer.my.id` (landing) |
| **Stack** | HTML + CSS + vanilla JS (tanpa build step) · Node.js 20 · Playwright Chromium |
| **Lisensi** | Private |

---

## Daftar Isi

1. [Ringkasan](#ringkasan)
2. [Fitur](#fitur)
3. [Arsitektur](#arsitektur)
4. [Struktur Proyek](#struktur-proyek)
5. [Konfigurasi (Settings)](#konfigurasi-settings)
6. [Model Valuasi](#model-valuasi)
7. [API Backend](#api-backend)
8. [Development Lokal](#development-lokal)
9. [Deployment Produksi](#deployment-produksi)
10. [Operasional Harian](#operasional-harian)
11. [Troubleshooting](#troubleshooting)
12. [Keamanan](#keamanan)
13. [Changelog](#changelog)

---

## Ringkasan

Takseer membantu petugas gadai menilai agunan dalam hitungan detik:

1. **Foto agunan** diambil lewat kamera HP (1–6 foto)
2. **Inspeksi visual** mengekstrak produk, merek, spesifikasi, dan grade A–D
3. **Harga pasar** ditarik **real-time** dari Tokopedia, OLX, dan Logam Mulia (emas) melalui headless browser
4. **Rekomendasi plafon** dihitung dari median pasar × LTV yang bisa dikonfigurasi
5. **Penaksir memutuskan** — VALID / ADJUST / REJECT / ESKALASI

Tidak ada agen yang mengambil keputusan sendiri. Sistem berhenti sebelum keputusan dan menyerahkannya ke manusia.

---

## Fitur

### Navigasi utama (5 tab)

| Tab | Fungsi |
|-----|--------|
| **Mulai** | Kanvas bersih untuk memulai penaksiran baru |
| **Penaksiran** | Alur utama: foto → analisis → plafon → keputusan |
| **Riwayat** | Daftar transaksi + audit trail, ekspor CSV/JSON |
| **Data RAG** | Seluruh referensi pasar hasil scraping, dengan filter sumber & urutan |
| **Akun** | Profil, limit otorisasi, akses pengaturan model AI & LTV |

### Pengaturan (ikon ⚙️ kanan atas)

- **AI Model Vision** — base URL, API key, nama model (untuk analisis foto)
- **AI Model Penalaran** — base URL, API key, nama model (untuk penalaran teks)
- **Default LTV** — slider 0%–100%, default **80%**
- **Tes Koneksi AI** — menguji nilai yang **sedang diketik** (tanpa perlu menyimpan lebih dulu), mencakup Vision dan Penalaran sekaligus, dengan validasi lokal sebelum request dikirim

### Indikator status AI (pojok kanan atas)

Pil status kecil di samping ikon ⚙️ menunjukkan konfigurasi AI yang aktif. Klik untuk langsung membuka Pengaturan.

| Tampilan | Warna | Arti |
|----------|-------|------|
| `AI: off` | abu-abu | Vision & Penalaran belum dikonfigurasi |
| `AI: Vision` | kuning | hanya Vision aktif |
| `AI: Reason` | kuning | hanya Penalaran aktif |
| `AI: Vision + Reason` | hijau | keduanya aktif |

Indikator membaca `TK.settings.hasVision()` / `hasReason()` — cukup `Base URL` + `Model Name` terisi (API key opsional). Nilai diperbarui setiap render dan segera setelah Pengaturan disimpan.

### Inspeksi Kondisi Agunan (AI Vision + Reasoning)

Tombol opsional di kartu **Inspeksi Visual**, muncul setelah ada minimal 1 foto. Saat ditekan:

1. Tombol berubah menjadi **"Menginspeksi…"** dan dinonaktifkan selama proses
2. Foto dikirim ke endpoint AI Vision (`/api/ai/vision`, maks 3 gambar)
3. Hasil Vision mengisi **nama & tipe produk**, **merk**, **kelengkapan**, **grade**, dan **catatan kondisi**
4. Bila AI Penalaran aktif, `/api/ai/reason` dipanggil untuk menulis catatan kondisi fisik, lalu digabung ke kolom catatan
5. Halaman menggulir ke kartu deteksi dan menampilkan toast berisi daftar kolom yang terisi

Bila AI belum dikonfigurasi, tombol **tidak diam saja** — muncul sheet penjelasan dengan tombol **Buka Pengaturan**. Bila model gagal merespons, muncul sheet error berisi pesan penyebab dan jalan pintas ke Pengaturan.

> Tanpa AI, kolom tetap bisa diisi manual dan valuasi berjalan normal. Inspeksi lokal (ketajaman & pencahayaan) selalu dihitung di perangkat.

### Harga pasar real-time

- Scraping langsung via **Playwright headless Chromium** — bukan simulasi
- Sumber: **Tokopedia**, **OLX Indonesia**, **Logam Mulia Antam** (khusus kategori emas)
- Streaming via **SSE** — hasil muncul per sumber begitu tersedia
- Setiap baris harga memuat: **judul situs sumber**, **nama produk**, **harga**, **link langsung ke halaman produk**
- **Filter urutan**: Terbaru · Terlama · Harga Tertinggi · Harga Terendah
- Cache 3 menit; parameter `fresh` melewati cache

### Kualitas foto

- Analisis ketajaman (**varians Laplacian**) dan pencahayaan dihitung **di perangkat**, tanpa upload
- Foto buram/gelap menurunkan confidence dan memicu peringatan — sistem menolak menebak

---

## Arsitektur

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (PWA, mobile-first)                                 │
│  index.html · css/app.css · js/*.js                          │
└───────────────┬──────────────────────────────────────────────┘
                │  HTTPS
                ▼
┌──────────────────────────────────────────────────────────────┐
│  Nginx (port 80/443) — reverse proxy                         │
│  takseer.my.id      → /var/www/takseer      (landing, static)│
│  app.takseer.my.id  → 127.0.0.1:8787        (aplikasi)       │
└───────────────┬──────────────────────────────────────────────┘
                ▼
┌──────────────────────────────────────────────────────────────┐
│  Node.js (port 8787, dikelola PM2)                           │
│  ├── Static file host                                        │
│  ├── /api/market + /api/market/stream (SSE)                  │
│  ├── /api/rag                                                │
│  └── /api/ai/{test,vision,reason} — proxy ke LLM provider    │
└───────────────┬──────────────────────────────────────────────┘
                ▼
┌──────────────────────────────────────────────────────────────┐
│  Playwright headless Chromium                                │
│  Tokopedia · OLX · Logam Mulia                               │
└──────────────────────────────────────────────────────────────┘
```

### Alur penaksiran

```
Foto agunan (1–6)
      │
      ▼
[1] Inspeksi Visual     → produk, merek, spesifikasi, grade A–D, confidence
      │                   + quality gate (ketajaman & cahaya, di perangkat)
      ▼
[2] Harga Pasar         → referensi real-time + median & rentang
      │
      ▼
[3] Rekomendasi Plafon  → nilai agunan tertimbang, LTV, plafon, safety margin
      │
      ▼
Keputusan manusia: VALID / ADJUST / REJECT / ESKALASI
```

---

## Struktur Proyek

### Di repository

```
takseer/
├── index.html                 # shell aplikasi + sprite ikon SVG
├── manifest.webmanifest       # konfigurasi PWA
├── sw.js                      # service worker (app shell cache)
├── package.json
├── ecosystem.config.cjs       # konfigurasi PM2
├── .env.example               # template environment variable
├── README.md                  # dokumen ini
├── deploy.md                  # panduan deployment VPS lengkap
├── assets/
│   ├── icon.svg
│   └── icon-maskable.svg
├── css/
│   └── app.css                # design token + seluruh komponen
├── js/
│   ├── utils.js               # helper (format, clamp, roundCeiling)
│   ├── catalog.js             # kategori, grade, kelengkapan, katalog produk
│   ├── vision.js              # intake foto, analisis ketajaman & exposure
│   ├── settings.js            # model AI + LTV, persistensi localStorage
│   ├── store.js               # state, riwayat, audit log
│   ├── api.js                 # klien API + auto-discover backend
│   ├── agents.js              # pipeline, scraping, mesin valuasi
│   ├── engine.js              # mesin pendukung
│   ├── screens.js             # seluruh layar & komponen view
│   └── app.js                 # router, event delegation, orkestrasi
└── server/
    ├── server.js              # HTTP server + static host + API
    ├── browser.js             # pool Chromium (warm-up, anti-detection)
    ├── market.js              # orkestrasi crawl, scoring relevansi, cache
    └── scrapers.js            # ekstraktor Tokopedia / OLX / Logam Mulia
```

### Di server produksi

```
/opt/takseer/                  # aplikasi (Node.js, port 8787)
├── server/ · js/ · css/ · index.html
├── .env                       # PORT, HOST
├── ecosystem.config.cjs
└── node_modules/

/var/www/takseer/              # landing page (static, disajikan Nginx)
└── index.html

/etc/nginx/sites-available/
├── takseer-landing            # takseer.my.id + www
└── takseer-app                # app.takseer.my.id

/etc/letsencrypt/live/takseer.my.id/   # sertifikat SSL (3 domain)
/var/log/takseer/                      # log aplikasi (PM2)
```

---

## Konfigurasi (Settings)

Diakses lewat **ikon ⚙️ di kanan atas**. Semua nilai disimpan di `localStorage` browser dengan key `takseer.settings.v1` — **tidak dikirim ke server**.

### 1. AI Model Vision

Dipakai untuk menganalisis foto agunan.

| Field | Contoh | Keterangan |
|-------|--------|-----------|
| Base URL | `https://openrouter.ai/api/v1` | Endpoint kompatibel OpenAI |
| API Key | `sk-or-v1-...` | Disimpan di browser, diteruskan lewat proxy server |
| Model Name | `qwen/qwen2.5-vl-72b-instruct` | Harus mendukung input gambar |

### 2. AI Model Penalaran

Dipakai untuk penalaran teks (ringkasan, justifikasi plafon).

| Field | Contoh | Keterangan |
|-------|--------|-----------|
| Base URL | `https://openrouter.ai/api/v1` | Endpoint kompatibel OpenAI |
| API Key | `sk-or-v1-...` | Boleh sama dengan Vision |
| Model Name | `anthropic/claude-sonnet-4` | Model teks |

### 3. Default LTV

| Field | Rentang | Default |
|-------|---------|---------|
| Default LTV | 0% – 100% | **80%** |

Nilai ini menjadi **LTV dasar** pada perhitungan plafon — menggantikan batas LTV per kategori. Penyesuaian grade dan volatilitas produk tetap diterapkan di atasnya.

### 4. Tes Koneksi AI

Tombol **"Tes Koneksi AI"** di dalam sheet Pengaturan menguji konfigurasi **tanpa perlu menekan Simpan lebih dulu**.

| Aspek | Perilaku |
|-------|----------|
| Sumber nilai | Dibaca dari **input yang sedang diketik** (`readSettingsForm()`), bukan dari `localStorage` |
| Cakupan | Semua blok yang terisi — Vision, Penalaran, atau keduanya sekaligus |
| Validasi lokal | Base URL wajib diawali `http://` / `https://`; Model Name wajib terisi |
| **Uji nyata** | Server menghubungi **model yang diisi** lewat `chat/completions` (1 token). Nama model salah → langsung gagal |
| **Uji Vision** | Khusus blok Vision (`kind: "vision"`), server mengirim 1 gambar PNG uji. Model teks yang menolak `image_url` → langsung gagal |
| Selama proses | Tombol dinonaktifkan dan berlabel "Menguji…" |
| Hasil | Satu toast ringkas, mis. `Vision: OK (model & input gambar OK) · Reasoning: OK (model OK)` |
| **Auto-simpan** | Bila **semua** blok yang diuji lolos, nilai form langsung disimpan ke `localStorage` — sehingga `askVision()` / `askReason()` memakai konfigurasi yang sama persis |
| Server mati | Pesan khusus: *"Server Takseer belum jalan — jalankan npm start"* |

> Endpoint tes berada di backend (`POST /api/ai/test`), jadi server Node.js harus aktif. Membuka `index.html` sebagai file statis saja tidak cukup.

> **Catatan versi lama:** sebelum perbaikan ini endpoint hanya memanggil `GET /models` dan membalas `ok: true` tanpa pernah memakai `model` dari request. Itu sebabnya tes bisa "OK" sementara Inspeksi AI gagal — status OK kini berarti model benar-benar dihubungi dan (untuk Vision) menerima gambar.

### 5. Indikator status AI

Lihat [Indikator status AI](#indikator-status-ai-pojok-kanan-atas) pada bagian Fitur. Sumber kebenaran status ada di `TK.settings.hasVision()` dan `TK.settings.hasReason()`; indikator diperbarui pada setiap `render()` dan tepat setelah `save-settings`.

### Reset

```js
// Di console browser
TK.settings.reset();
```

### Batasan yang dihapus di v0.1

Fitur berikut **sudah tidak ada**: Mode Peran, Tim Agen, 5 Prinsip Akuntabilitas, Preferensi, tab Pipeline, dan label nama agen (Vivi/Raga/Riska/Dita) pada UI.

---

## Model Valuasi

```js
compFactor  = (kategori === 'emas') ? 1 : faktorKelengkapan
collateral  = medianPasar × compFactor
ltv         = clamp(defaultLTV + gradeAdj + volatilityAdj, 0.45, 0.95)
ceiling     = roundCeiling(collateral × ltv)      // dibulatkan ke bawah
displayLtv  = ceiling / medianPasar               // LTV yang ditampilkan
margin      = collateral − ceiling
```

| Variabel | Nilai |
|----------|-------|
| `defaultLTV` | dari slider Settings (default 0.80) |
| `gradeAdj` | A `0%` · B `−2%` · C `−5%` · D `−14%` |
| `volatilityAdj` | per produk (`tinggi` memberi penalti) |
| `faktorKelengkapan` | fullset `1,00` · tanpa dus `0,97` · unit saja `0,93` |

### Contoh

iPhone 13 Pro Max 256GB · Grade B · fullset · median pasar Rp 7.475.000 · Default LTV 80%

```
ltv       = 0,80 + (−0,02) = 0,78
collateral = 7.475.000 × 1,00 = 7.475.000
ceiling   = floor(7.475.000 × 0,78) = 5.830.000
displayLtv = 5.830.000 / 7.475.000 = 78%
margin    = 1.645.000
```

### Kategori & likuiditas

| Kategori | Likuiditas | Jendela likuidasi |
|----------|-----------|-------------------|
| Emas / Logam Mulia | Sangat tinggi | < 24 jam |
| Elektronik / Gadget | Tinggi | < 7 hari kerja |
| Kendaraan Bermotor | Sedang | 14–30 hari kerja |

> Catatan: `maxLtv` per kategori masih ada di `catalog.js` sebagai referensi likuiditas, tetapi **tidak lagi menjadi batas plafon** — batas plafon mengikuti Default LTV di Settings.

---

## API Backend

Base URL: same-origin (`/api/...`) — frontend mendeteksi backend otomatis lewat `GET /api/health`.

| Endpoint | Method | Fungsi |
|----------|--------|--------|
| `/api/health` | GET | Status service + ketersediaan Chromium + uptime |
| `/api/market` | GET | Crawl pasar (JSON). Param: `q`, `product`, `cat`, `ref`, `weight`, `limit`, `usedOnly`, `fresh` |
| `/api/market/stream` | GET (SSE) | Sama seperti `/api/market`, tapi streaming per sumber. Event: `source` → `done` |
| `/api/rag` | GET | Snapshot cache hasil crawl |
| `/api/ai/test` | POST | Uji koneksi model AI |
| `/api/ai/vision` | POST | Proxy analisis gambar (maks 3 gambar) |
| `/api/ai/reason` | POST | Proxy chat completion teks |

### Contoh

```bash
curl https://app.takseer.my.id/api/health

curl "https://app.takseer.my.id/api/market?q=iphone%2013%20pro%20max&cat=elektronik&fresh=1"

curl -N "https://app.takseer.my.id/api/market/stream?q=iphone%2013&cat=elektronik"
```

### Kontrak AI (berlaku sejak v0.2.1)

Alur pemanggilan dari frontend — jangan memanggil `TK.api.vision()` langsung dengan bentuk lama:

```
TK.engine.askVision(draft)   → POST /api/ai/vision  → { ok, data }
TK.engine.askReason(draft,v) → POST /api/ai/reason  → { ok, text }
TK.engine.askCondition(d,v)  → POST /api/ai/reason  → { ok, text }
```

Body request Vision: `{ baseUrl, apiKey, model, images[], prompt }` — `images` berisi data URL (maks 3).

Skema `data` yang dikembalikan model (dipaksa lewat prompt di server):

```json
{
  "product": "iPhone 13 Pro Max 256GB",
  "brand": "Apple Inc.",
  "specs": "256GB graphite, baterai 87%",
  "completeness": "fullset | minus_box | unit_only",
  "grade": "A | B | C | D",
  "confidence": 0,
  "notes": "kondisi fisik yang terlihat",
  "signals": ["ciri yang terbaca"],
  "readable": true
}
```

`completeness` harus salah satu dari tiga kunci di `C.COMPLETENESS`; nilai di luar itu diabaikan. Pemetaan ke kolom UI ada di `runInspection()` (`js/app.js`).

### Catatan implementasi

- Cache crawl: **3 menit** (`fresh=1` untuk bypass)
- Timeout per sumber: **32 detik**
- Crawl paralel; skor relevansi mempenalti aksesoris, posting "dicari", dan barang rusak
- Proxy AI meneruskan `baseUrl`, `apiKey`, `model` dari body request — **server tidak menyimpan kredensial**
- Bila model tidak tersedia atau membalas bukan JSON, `extractJson()` mengembalikan `null` dan endpoint membalas `{ ok:false, data:null, raw:<potongan jawaban> }`

---

## Development Lokal

### Prasyarat

- Node.js ≥ 18
- Chromium via Playwright

### Langkah

```bash
# 1. Install dependency
npm install

# 2. Install Chromium
npx playwright install chromium

# 3. Siapkan env
cp .env.example .env

# 4. Jalankan
npm start
# → Takseer scraper aktif -> http://127.0.0.1:8787

# 5. Buka browser
open http://127.0.0.1:8787
```

> Server Node.js sudah menyajikan file statis **dan** API dari origin yang sama, jadi tidak perlu server statis terpisah.

### Mode tanpa backend

Buka `index.html` langsung (`file://`). Frontend akan mencoba `127.0.0.1:8787` dan `localhost:8787`; kalau tidak ada, scraping jatuh ke generator lokal (data simulasi) — UI tetap bisa diuji, tetapi **link sumber tidak akan mengarah ke produk nyata**.

### Auto-discover backend

`js/api.js` mencoba kandidat berurutan, memakai yang pertama membalas `{"ok":true}`:

1. `''` (same-origin) — hanya jika protokol http/https
2. `http://127.0.0.1:8787`
3. `http://localhost:8787`

Hasil di-cache setelah berhasil.

---

## Deployment Produksi

Panduan langkah-demi-langkah lengkap: **[`deploy.md`](./deploy.md)**

### Ringkasan infrastruktur

| Item | Nilai |
|------|-------|
| Server | VPS Ubuntu 22.04/24.04, RAM 3,6 GB, swap 1,9 GB |
| Path aplikasi | `/opt/takseer` |
| Path landing | `/var/www/takseer` |
| Port aplikasi | `127.0.0.1:8787` (internal, tidak diekspos) |
| Process manager | PM2 (`takseer`), auto-start via systemd |
| Reverse proxy | Nginx, dual server block |
| SSL | Let's Encrypt (Certbot), 1 sertifikat untuk 3 domain, auto-renew |

### Environment variable

| Variable | Default | Keterangan |
|----------|---------|-----------|
| `PORT` | `8787` | Port server |
| `HOST` | `127.0.0.1` | Bind address. Pakai `0.0.0.0` hanya jika tanpa reverse proxy |
| `CHROMIUM_PATH` | auto-detect | Override lokasi binary Chromium |

### Update kode ke produksi

```bash
# Dari lokal
rsync -avz --exclude node_modules --exclude .git \
  "/path/ke/takseer/" ubuntu@SERVER:/opt/takseer/

# Di server
cd /opt/takseer
npm install            # jika dependency berubah
pm2 restart takseer
```

### Perintah deploy singkat (server baru)

```bash
sudo apt update && sudo apt install -y nodejs nginx
sudo npm install -g pm2
npx playwright install chromium
cd /opt/takseer && npm install && cp .env.example .env
pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
# lalu konfigurasi Nginx + Certbot — lihat deploy.md
```

---

## Operasional Harian

### PM2

```bash
pm2 status                        # status proses
pm2 logs takseer                  # log real-time
pm2 logs takseer --lines 50 --nostream
pm2 restart takseer               # setelah update kode
pm2 monit                         # CPU/RAM real-time
pm2 save                          # simpan process list
```

### Nginx

```bash
sudo nginx -t                     # uji konfigurasi
sudo systemctl reload nginx       # muat ulang
sudo systemctl status nginx
```

### SSL

```bash
sudo certbot certificates         # daftar sertifikat + expiry
sudo certbot renew --dry-run      # uji auto-renew
sudo certbot renew                # renew manual (biasanya otomatis)
```

### Log

```bash
tail -f /var/log/takseer/out-0.log      # stdout aplikasi
tail -f /var/log/takseer/error-0.log    # stderr aplikasi
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Backup

```bash
tar -czf /home/ubuntu/backup-$(date +%F).tar.gz \
  /opt/takseer/.env \
  /opt/takseer/ecosystem.config.cjs \
  /var/www/takseer \
  /etc/nginx/sites-available/takseer-landing \
  /etc/nginx/sites-available/takseer-app
```

> Riwayat penaksiran tersimpan di `localStorage` **browser pengguna**, bukan di server — tidak perlu di-backup di sisi server, tetapi juga tidak tersinkron antar perangkat.

---

## Troubleshooting

| Gejala | Penyebab | Solusi |
|--------|----------|--------|
| `EADDRINUSE 127.0.0.1:8787` + `↺` naik terus | Ada proses lain memegang port 8787 | `pm2 stop takseer` → `sudo ss -lntp 'sport = :8787'` → `sudo kill -9 <PID>` → `pm2 restart takseer` |
| `pm2 status` → `errored` | Crash saat start | `pm2 logs takseer --lines 50 --nostream` |
| PM2 `↺` naik berulang | Crash loop / OOM | Cek log; turunkan `max_memory_restart` atau tambah RAM |
| Scraping 0 hasil | Chromium gagal / timeout | `npx playwright install chromium`, cek RAM ≥ 2 GB |
| Kamera tidak aktif | Origin bukan HTTPS | Wajib HTTPS (Let's Encrypt). `getUserMedia` diblokir di HTTP |
| PWA tidak bisa di-install | HTTPS / manifest bermasalah | Pastikan HTTPS valid dan `manifest.webmanifest` dapat diakses |
| Nginx 502 Bad Gateway | Node.js mati / port salah | `pm2 restart takseer`; pastikan `HOST=127.0.0.1` dan `PORT=8787` |
| Port 443 tidak merespons | Nginx tidak listen, atau config ter-revert | **Selalu cek `sudo ss -lntp \| grep ':443'` sebelum menyimpulkan blokir firewall** |
| Sertifikat warning di browser | Self-signed / cert tidak mencakup domain | Pasang Certbot untuk semua domain; akses via IP tetap warning karena cert tidak mencakup IP |
| **"Inspeksi AI gagal — Model tidak mengembalikan data"** padahal Tes Koneksi OK | Model pada blok **Vision** bukan multimodal, menjawab bukan JSON, atau jawaban kosong/terpotong; `extractJson()` gagal di server | Ganti ke model Vision (mis. `qwen/qwen2.5-vl-72b-instruct`, `gpt-4o`), lalu jalankan ulang **Tes Koneksi AI** — sekarang tes akan menolak model yang tidak menerima gambar. Sheet error menampilkan balasan mentah model untuk diagnosis |
| Tes Koneksi OK tetapi inspeksi memakai konfigurasi lama | Perubahan belum tersimpan; `askVision()` membaca `localStorage`, `Tes` membaca form | Klik **Simpan Pengaturan**, atau cukup jalankan **Tes Koneksi AI** (nilai kini tersimpan otomatis bila semua blok lolos) |
| `AI gagal: Base URL model AI belum diisi` saat Tes | `Tes` mengirim config kosong karena membaca nilai tersimpan, bukan kolom yang diketik | Sudah diperbaiki: `test-ai` memakai `readSettingsForm()`. Pastikan menjalankan build terbaru dan hard-reload agar service worker memperbarui cache |

---

## Keamanan

- **API key AI disimpan di `localStorage` browser** dan diteruskan per-request lewat proxy server. Server tidak menyimpan kredensial. Untuk penggunaan multi-pengguna, pertimbangkan memindahkan kredensial ke server (vault) dan memakai sesi login.
- **Port 8787 tidak diekspos ke internet** — hanya Nginx yang mendengarkan 80/443.
- **`.env` tidak boleh di-commit.** Sudah masuk `.gitignore`.
- **Sertifikat privat** (`/etc/ssl/private/*`, `/etc/letsencrypt/*`) tidak boleh masuk repository.
- **Path traversal** pada static file host sudah dicegah (`serveStatic` memvalidasi resolved path terhadap root).
- CORS pada endpoint API bersifat permisif (`*`) — aman selama port tidak diekspos langsung; kalau nanti diekspos, batasi origin.

---

## Changelog

### v0.2.2 — pemantapan diagnostik AI (build 0.2.2)

Rilis patch. Fokus: membuat status **"Tes Koneksi AI"** benar-benar dapat dipercaya dan kegagalan Vision mudah didiagnosis. Tidak ada perubahan model valuasi atau alur penaksiran.

**Diubah**

- `POST /api/ai/test` tidak lagi hanya memanggil `GET /models`. Server kini menghubungi **model yang diisi** lewat `chat/completions` 1 token; untuk blok Vision (`kind: "vision"`) dikirim pula gambar PNG 1×1 lewat `image_url`. Model teks / nama model salah → tes **gagal**, bukan "OK" palsu
- `Tes Koneksi AI` mengirim `kind` per blok dan **menyimpan form otomatis** bila semua blok lolos — menghapus perbedaan antara konfigurasi yang diuji (`readSettingsForm()`) dan yang dipakai `askVision()` (`TK.settings.load()`)
- `/api/ai/vision`: `maxTokens` 700 → 900; saat `extractJson()` gagal, respons memuat `error` + `raw` yang menjelaskan perlunya model multimodal
- `engine.askVision()` mengembalikan `{ error, raw, hint }`; sheet **"Inspeksi AI gagal"** menampilkan balasan mentah model dan 3 langkah perbaikan, menggantikan pesan generik "Model tidak mengembalikan data"

**Diperbaiki**

- "OK" palsu pada Tes Koneksi AI padahal Model Name salah atau model bukan Vision
- Inspeksi memakai konfigurasi lama saat user mengubah model lalu menguji tanpa menyimpan
- Kegagalan Vision tanpa petunjuk penyebab

**Penanda versi**

- `package.json` → `0.2.2` · `sw.js` → `takseer-v0.2.2` · header → **`Takseer v0.2.2`** · `<title>` dan halaman Akun ikut diperbarui
- Tiga baris troubleshooting baru (Tes OK tapi Inspeksi gagal, konfigurasi lama, Base URL kosong)

**Verifikasi** — uji Chrome headless 3 skenario: model teks ditolak tes dan tidak tersimpan; config teks memunculkan sheet berisi balasan mentah + 3 langkah; model Vision benar lolos tes, tersimpan, dan mengisi kelima kolom. `node --check` bersih, nol error browser.

---

### v0.2.1 — integrasi AI Vision & Reasoning (build 0.2.1)

Rilis ini menyambungkan model AI ke alur kerja nyata: indikator status, pemanggilan Vision & Reasoning di pipeline, dan tombol Inspeksi yang benar-benar mengisi kolom deteksi.

**Ditambahkan**

- **Indikator status AI** di pojok kanan atas (`#aiStatus`) dengan 4 keadaan — `AI: off`, `AI: Vision`, `AI: Reason`, `AI: Vision + Reason` — berwarna abu/kuning/hijau dan dapat diklik untuk membuka Pengaturan
- **`js/engine.js` kini benar-benar dimuat** (`index.html`, setelah `agents.js`). Sebelumnya file ini ada di repositori tetapi tidak pernah di-`<script>`, sehingga seluruh pemanggilan AI tidak pernah aktif
- **`TK.engine.askVision()` / `askReason()` / `askCondition()`** sebagai satu-satunya kontrak pemanggilan model
- **Integrasi AI ke pipeline utama** (`runPipeline()` di `agents.js`): Vision dipanggil setelah `computeVision()`, Reasoning setelah `computeValuation()`. Keduanya ber-`try/catch` dan jatuh kembali ke heuristik lokal bila gagal — pipeline tidak pernah batal karena AI
- **`askCondition()`** — fungsi baru untuk menulis catatan kondisi fisik lewat AI Penalaran
- **Tombol "Inspeksi Kondisi Agunan" mengisi 5 kolom**: nama & tipe produk, merk, kelengkapan, grade, dan catatan kondisi
- **Status busy pada tombol Inspeksi** — berubah menjadi "Menginspeksi…" dan dinonaktifkan selama request berjalan, lalu pulih otomatis
- **Sheet "AI Vision belum aktif"** dengan tombol Buka Pengaturan, dan **sheet "Inspeksi AI gagal"** berisi pesan penyebab — tidak ada lagi kegagalan senyap
- **Blok "Catatan AI Vision"** di panel deteksi perangkat dan **"Catatan AI Reasoning"** di kartu valuasi — sebelumnya `aiNote`/`aiData` dihitung tetapi tidak pernah ditampilkan
- **Field `completeness` pada skema AI Vision** (`fullset | minus_box | unit_only`)
- **`readSettingsForm()`** — pembaca nilai form Pengaturan yang dipakai bersama oleh Simpan dan Tes
- **Tes Koneksi AI menguji Vision dan Penalaran sekaligus**, dengan validasi lokal dan pesan khusus bila server backend belum jalan

**Diubah**

- `test-ai` membaca **nilai yang sedang diketik**, bukan `TK.settings.load()` — memperbaiki bug "Base URL model belum diisi" saat kredensial sudah benar tetapi belum disimpan
- `save-settings` memakai `readSettingsForm()` (kode duplikat dihapus)
- Pesan error server: `Base URL model AI belum diisi — buka Pengaturan (gear) lalu isi Base URL & Model Name`
- `sw.js`: SHELL dilengkapi `engine.js`, `settings.js`, dan `api.js` agar PWA offline tidak kehilangan modul; cache key → **`takseer-v0.2.1-r2`** (revisi ke-2 selepas perbaikan diagnostik Vision, supaya klien lama tidak memakai JS hasil cache)
- Header menampilkan **`Takseer v0.2.1`**; `<title>` dan halaman Akun ikut diperbarui
- `package.json` → `0.2.1`

**Diperbaiki**

- Tombol Inspeksi tidak lagi no-op saat AI belum dikonfigurasi
- Kontrak lama `TK.api.vision({ photos, product, cat })` yang menunggu `res.result` (selalu gagal) diganti `TK.engine.askVision()` yang mengirim `{ baseUrl, apiKey, model, images, prompt }` dan membaca `{ ok, data }`
- Dua akses `prod.*` tanpa penjaga null di `fetchMarket()` yang melempar `TypeError` saat produk diisi manual
- PWA offline gagal memuat `engine.js`, `settings.js`, dan `api.js` karena tidak terdaftar di app shell

> Perbaikan diagnostik AI yang menyusul (validasi Tes Koneksi, auto-save, `raw` response) dirilis resmi di **v0.2.2** — lihat entri di atas agar tidak tercatat dua kali.

**Verifikasi**

- `node --check` bersih untuk seluruh `js/*.js`, `server/*.js`, dan `sw.js`
- Uji browser headless (Chrome + CDP) dua skenario: AI mati → sheet penjelasan muncul; AI aktif → kelima kolom terisi
- Penangkapan jaringan membuktikan `POST /api/ai/vision` dan `POST /api/ai/reason` benar-benar terkirim dengan foto (data URL), kredensial, dan prompt; durasi status busy (≈2140 ms) sepadan dengan total round-trip (≈2122 ms)
- Penanda acak yang disuntikkan ke respons server muncul persis di kolom `spec` DOM — membuktikan nilai berasal dari respons AI, bukan katalog lokal

---

### v0.2 — penyederhanaan kategori & alur manual (build 0.2.0)

**Ditambahkan**
- Tombol **"Inspeksi Kondisi Agunan"** di kartu inspeksi visual — opsional, memanggil AI untuk auto-fill produk & kondisi
- Tombol **"Isi sendiri"** di sheet pemilih produk referensi — untuk pengguna yang ingin mengisi manual
- Hasil deteksi perangkat (merek, model, grade, spesifikasi) tampil langsung di halaman utama, tidak tersembunyi
- Fungsi `estimateBase()` di `agents.js` — heuristik harga untuk produk yang diisi manual

**Diubah**
- Kategori disederhanakan: `kamera` dan `laptop` digabung ke `elektronik`
- Tombol analisa aktif dengan minimal **1 foto jelas** — tidak lagi wajib pilih produk referensi atau catatan kondisi
- Produk referensi sekarang **opsional**: boleh pilih dari katalog atau isi sendiri
- Sheet pemilih produk muncul **sekali** (saat foto pertama), bukan setiap foto
- Label "Analisa Agunan" → **"Analisa Harga Pasar"** di seluruh UI
- Pipeline `agents.js` menggunakan pola nullable product — semua akses `prod.*` di-guard untuk null safety
- Service worker cache key: `takseer-v1` → `takseer-v0.2`

**Dihapus**
- Kategori `kamera` dan `laptop` dari `catalog.js` (produk dipindah ke `elektronik`)

---

### v0.1 — rilis pertama terdeploy (build 1.1.0)

**Ditambahkan**
- Pengaturan terpusat via ikon ⚙️: AI Model Vision, AI Model Penalaran, Default LTV (slider 0–100%)
- Tab **Mulai** untuk kanvas penaksiran baru
- Tab **Data RAG** — seluruh referensi hasil scraping + filter sumber & urutan
- Scraping **real-time** via Playwright Chromium (Tokopedia, OLX, Logam Mulia) dengan streaming SSE
- Filter urutan harga pasar: Terbaru · Terlama · Harga Tertinggi · Harga Terendah
- Link sumber **dapat diklik** menuju halaman produk asli
- Deployment produksi: PM2 + Nginx dual server block + Let's Encrypt

**Diubah**
- LTV plafon sekarang mengikuti **Default LTV** di Settings (sebelumnya hardcoded per kategori)
- Navigasi bawah jadi 5 tab: Mulai · Penaksiran · Riwayat · Data RAG · Akun
- Kartu hasil memakai label netral: *Inspeksi Visual*, *Harga Pasar*, *Rekomendasi Plafon*

**Dihapus**
- Tab **Pipeline** pada navigasi bawah
- Label nama agen (Vivi / Raga / Riska / Dita) dari UI
- **Mode Peran**, **Tim Agen**, **5 Prinsip Akuntabilitas**, **Preferensi** dari halaman Akun

---

## Referensi

- [`deploy.md`](./deploy.md) — panduan deployment VPS langkah-demi-langkah
- [`ecosystem.config.cjs`](./ecosystem.config.cjs) — konfigurasi PM2
- [`.env.example`](./.env.example) — template environment variable
