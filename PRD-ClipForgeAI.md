# PRD: ClipForge AI (v4)
### Web App dengan 2 Fungsi Utama: (A) Video Downloader & (B) AI Auto-Clipper

> **Perubahan dari v3:** ClipForge AI didesain sebagai **satu web app dengan dua halaman/fungsi terpisah**, bukan cuma clipper:
> - **(A) Downloader** — halaman sederhana untuk mengunduh video utuh dari URL, tanpa proses AI apapun. Ini fitur independen, bisa dipakai sendiri.
> - **(B) Clipper** — halaman terpisah untuk pipeline AI auto-highlight (transkripsi → deteksi momen terbaik → subtitle → face focus → judul otomatis) seperti dirancang di v3.
>
> Kedua fitur berbagi backend & infra yang sama, tapi alur kerja, endpoint API, dan halaman frontend-nya terpisah — user bisa pakai salah satu tanpa harus lewat yang lain.

> **Perubahan dari v3:** Fitur "AI auto-suggest highlight moments" dipindah jadi inti MVP untuk fungsi Clipper. User tidak lagi input rentang waktu klip secara manual — cukup URL + jumlah klip yang diinginkan (mis. 5), sistem otomatis mendeteksi momen terbaik dari seluruh video dan menghasilkan N klip sekaligus, masing-masing dengan subtitle, face focus, dan judul otomatis.
>
> **Perubahan dari v1:** Pipeline Clipper didesain **full-automatic** — subtitle, judul/deskripsi, dan reframe vertikal (face focus) dijalankan otomatis oleh AI tanpa user harus edit manual di UI editor. Arsitektur disederhanakan agar realistis dijalankan di infra murah (Render + object storage), dan beberapa inkonsistensi teknis di v1 (HLS, storage lokal) sudah diperbaiki.

---

## 1. Ringkasan Produk

**Nama Produk:** ClipForge AI

**Deskripsi:** Web app dengan dua fungsi utama yang bisa dipakai independen:
- **(A) Video Downloader** — user paste URL, pilih kualitas, langsung download video utuh dari platform sosial media. Cepat, sederhana, tanpa AI.
- **(B) AI Clipper** — user paste URL + jumlah klip yang diinginkan, sistem otomatis mendeteksi momen terbaik dari transkrip, lalu tiap klip diproses lengkap dengan subtitle terbakar, judul & deskripsi hasil AI, dan reframe vertikal yang mengikuti wajah pembicara.

**Target Pengguna:**
- Fungsi Downloader: siapa saja yang butuh unduh video dari media sosial (audiens umum).
- Fungsi Clipper: content creator, editor media sosial, tim marketing, podcaster yang ingin repurpose video panjang jadi short-form content dengan effort minimal.

**Target Pengguna:** Content creator, editor media sosial, tim marketing, podcaster yang ingin repurpose video panjang jadi short-form content dengan effort minimal.

**Value Proposition:** "Paste URL → dapat klip siap upload." Menghilangkan seluruh proses manual (transkrip, tulis judul, reframe manual pakai Premiere/CapCut) jadi satu pipeline otomatis.

**Perbedaan Kunci vs Tools Sejenis:** Fokus pada *zero-touch pipeline* — kompetitor (Opus Clip, dll) sering tetap perlu review manual; ClipForge AI didesain agar hasil AI langsung dipakai, dengan opsi override manual sebagai fitur sekunder, bukan wajib.

---

## 2. Tujuan & Metrik Sukses

| Tujuan | Metrik |
|---|---|
| Kecepatan end-to-end | Waktu dari submit URL sampai klip jadi (siap download) < 5 menit untuk video sumber < 10 menit |
| Akurasi subtitle otomatis | Word Error Rate (WER) < 15% (Bahasa Indonesia & Inggris) |
| Kualitas judul AI | Tingkat penerimaan (user pilih salah satu tanpa edit) > 60% |
| Kualitas face focus | Wajah utama tetap berada di frame ≥ 90% durasi klip (diukur dari sample video uji) |
| Kualitas pemilihan highlight | ≥ 70% klip hasil AI dianggap "layak posting tanpa perlu ganti momen" oleh user (diukur dari tidak-dihapusnya klip tsb) |
| Retensi | User kembali gunakan produk minimal 2x/minggu |

---

## 3. Lingkup Fitur (Scope)

### 3.1 MVP (Fase 1)

#### Fitur A: Video Downloader (mandiri, tanpa AI)
- [ ] Input URL video (YouTube + platform lain yang didukung yt-dlp)
- [ ] Resolve metadata (judul, durasi, thumbnail, daftar kualitas/format tersedia)
- [ ] User pilih kualitas/format → klik download
- [ ] Streaming langsung dari sumber ke user (tanpa disimpan permanen di server — lihat §7)
- [ ] Progress indikator sederhana selama proses
- [ ] Error jelas untuk URL tidak didukung/private/region-locked
- [ ] Batas durasi/ukuran video (parameter sistem, terpisah dari batas di Fitur B)

#### Fitur B: AI Clipper (auto-highlight, auto-subtitle, auto-title, face focus)
- [ ] Input URL video + input jumlah klip yang diinginkan (`num_clips`, dibatasi sistem mis. 1-10)
- [ ] Resolve metadata (judul, durasi, thumbnail) sebelum download
- [ ] Download **seluruh video sumber** ke object storage sementara (bukan disk lokal — lihat §7) — *catatan: berbeda dari kebutuhan Fitur A, di sini wajib download full video karena highlight bisa di mana saja*
- [ ] Transkripsi **seluruh video** (Groq Whisper) dengan timestamp per kalimat
- [ ] **Deteksi highlight otomatis**: kirim transkrip penuh ke Gemini, minta N segmen terbaik (start/end time + alasan singkat) yang cocok jadi klip berdiri sendiri
- [ ] Validasi & penyesuaian hasil highlight (durasi per klip dalam batas min/maks, tidak overlap berlebihan)
- [ ] **Untuk tiap segmen yang terpilih**, jalankan sub-pipeline otomatis secara paralel/berurutan:
  1. Burn-in subtitle otomatis ke video (potongan dari transkrip penuh, tidak perlu transkripsi ulang per klip)
  2. Auto face-focus reframe ke 9:16 (deteksi wajah per-frame → dynamic crop mengikuti posisi wajah)
  3. Generate judul (3 alternatif) + deskripsi + hashtag (Gemini) dari transkrip segmen tsb
- [ ] User melihat daftar N klip hasil, masing-masing dengan preview + status
- [ ] Untuk tiap klip, user memilih 1 dari 3 judul yang disarankan (satu-satunya keputusan manual wajib per klip)
- [ ] Export/download tiap klip (MP4, 9:16), atau download semua sekaligus (zip)
- [ ] Auto-cleanup seluruh file (video sumber + semua klip) setelah 24 jam
- [ ] Status job real-time per tahap, termasuk progress agregat batch (mis. "3 dari 5 klip selesai")

### 3.2 Fase 2 (Post-MVP)
- [ ] **(Downloader)** Dynamic DNS/domain sendiri, download batch (playlist)
- [ ] **(Clipper)** Toggle "Manual Mode" — izinkan user pilih rentang waktu sendiri (sebagai alternatif dari auto-highlight) dan edit subtitle/judul/crop sebelum render
- [ ] **(Clipper)** Custom subtitle styling (font, warna, posisi)
- [ ] **(Clipper)** Multi-bahasa subtitle (translate otomatis)
- [ ] **(Keduanya)** Riwayat project & auth/login
- [ ] **(Clipper)** Preset output selain 9:16 (1:1, 16:9)
- [ ] **(Clipper)** Face focus untuk multi-speaker (pilih siapa yang jadi fokus, atau split-screen otomatis)
- [ ] **(Clipper)** User bisa kasih feedback per klip ("bukan ini momennya") untuk improve prompt highlight detection ke depannya

### 3.3 Di Luar Scope
- Editing video kompleks (multi-track, transisi, efek visual)
- Direct publish/auto-post ke platform sosial media
- Live streaming clipping/downloading
- Reframe manual (drag crop box) & pemilihan rentang waktu manual di Clipper — ditunda ke Fase 2 sebagai "Manual Mode"

---

## 4. User Flow

### 4.1 Flow Fitur A: Downloader

1. User buka halaman **"Download Video"** → paste URL.
2. Sistem tampilkan preview info (judul, durasi, thumbnail) + daftar kualitas/format tersedia.
3. User pilih kualitas → klik **"Download"**.
4. Sistem streaming video langsung dari sumber ke browser user (tidak nunggu proses AI apapun).
5. User dapat file MP4 langsung tersimpan di device-nya.

*(Flow ini sepenuhnya independen dari flow Clipper — nggak ada transkripsi, AI, atau job queue kompleks.)*

### 4.2 Flow Fitur B: Clipper

1. User buka halaman **"Buat Klip AI"** (terpisah dari halaman Downloader) → paste URL.
2. Sistem tampilkan preview info (judul, durasi, thumbnail).
2. User input jumlah klip yang diinginkan (mis. 5) → klik **"Generate Clips"**.
3. Job batch masuk antrean, progress bar tampil real-time dengan tahap: `downloading → transcribing_full → detecting_highlights → rendering_clips`.
4. Sistem: download full video → transkripsi penuh (Groq) → kirim transkrip ke Gemini untuk deteksi N momen terbaik → untuk tiap momen terpilih, jalankan burn-in subtitle → deteksi wajah & reframe 9:16 → generate judul/deskripsi (Gemini).
5. Progress agregat ditampilkan (mis. "3 dari 5 klip selesai") sambil klip yang sudah selesai langsung muncul di daftar (tidak perlu tunggu semua selesai).
6. User melihat daftar N klip hasil: tiap klip ada preview (subtitle + crop sudah jadi), 3 pilihan judul, deskripsi, hashtag.
7. Per klip, user pilih salah satu judul (atau edit manual) → klik **"Finalize"** — bisa dilakukan per klip, tidak harus serentak.
8. User download klip satu-satu, atau semua sekaligus dalam satu zip.

*(Tidak ada tahap "editor" terpisah di MVP, dan tidak ada input rentang waktu manual — user hanya menentukan jumlah klip, sisanya sepenuhnya otomatis.)*

---

## 5. Kebutuhan Fungsional

### 5.0 Fitur A: Modul Downloader (Mandiri)
- Validasi URL via yt-dlp extractor list.
- Ambil metadata + daftar format/kualitas yang tersedia (`GET /api/download/info?url=...`).
- Streaming langsung dari sumber ke response, **tanpa menyimpan file di disk/object storage** (beda dari modul downloader internal di Fitur B yang wajib simpan full video untuk keperluan transkripsi).
- Tidak butuh job queue/worker terpisah — ini proses sinkron (request → stream → selesai), karena tidak ada AI processing.
- Error jelas untuk URL tidak didukung/private/region-locked/melebihi batas ukuran.
- *(Lihat diskusi sebelumnya soal keterbatasan video panjang di lingkungan serverless — modul ini perlu dijalankan di layanan yang mendukung proses berjalan lama, bukan di function dengan timeout ketat.)*

### 5.1 Fitur B — Modul Downloader (Internal Clipper)
- Validasi URL via yt-dlp extractor list.
- Error jelas untuk URL tidak didukung/private/region-locked.
- Batas durasi/ukuran video sumber (parameter sistem, default: 60 menit / 2GB) — **berlaku ketat di v3** karena seluruh video harus didownload penuh (highlight detection butuh transkrip lengkap), tidak bisa lagi cuma download segmen seperti rencana di v2.
- Batas jumlah klip per request (`num_clips`, parameter sistem, default maks 10) untuk kontrol biaya compute & API.

### 5.2 Modul Transkripsi Penuh (Groq)
- Transkripsi **seluruh audio video sumber** (bukan per-segmen) → teks dengan timestamp per kalimat.
- Transkrip penuh ini dipakai dua kali: (1) input untuk deteksi highlight, (2) sumber subtitle per klip (potong sesuai start/end tiap klip, tanpa transkripsi ulang).
- Simpan transkrip penuh + file SRT/VTT per klip untuk didownload independen.
- Fallback: jika Groq API gagal/rate limit, seluruh batch job gagal dengan opsi retry (karena highlight detection tidak bisa jalan tanpa transkrip).

### 5.3 Modul Highlight Detection (Gemini) — **BARU**
- Input: transkrip penuh (dengan timestamp) + `num_clips` yang diminta user.
- Prompt Gemini untuk mengidentifikasi N segmen yang: (a) punya awal-akhir yang natural/tidak motong kalimat, (b) berdiri sendiri tanpa perlu konteks sebelumnya, (c) punya "hook" atau insight yang menarik untuk short-form content.
- Output terstruktur: list `{ start_time, end_time, reason }` per segmen.
- Validasi hasil: pastikan tiap segmen dalam batas durasi klip (mis. 15-180 detik, parameter sistem), tidak overlap signifikan antar segmen, dan berada dalam durasi video asli.
- **Isu teknis yang perlu diantisipasi:** untuk video sangat panjang (mis. >45 menit), transkrip penuh bisa melebihi context window Gemini dalam satu request — perlu strategi chunking (kirim per-bagian, minta Gemini pilih kandidat per chunk, lalu gabungkan/ranking di akhir).
- Jika Gemini gagal menghasilkan N segmen yang valid (mis. video terlalu pendek untuk 10 klip), sistem mengembalikan jumlah klip maksimal yang bisa dibuat + pesan ke user, bukan error total.

### 5.4 Modul Subtitle Burn-in
- Burn-in subtitle ke tiap klip hasil crop (bukan ke video asli), styling default (font, posisi, ukuran) — tidak dikonfigurasi user di MVP.
- Subtitle diambil dari potongan transkrip penuh sesuai rentang waktu klip (tidak transkripsi ulang per klip, untuk hemat biaya Groq).

### 5.5 Modul Face Focus (Auto Reframe)
- Deteksi wajah per-frame (atau per-interval, mis. tiap 0.5 detik untuk efisiensi) menggunakan model deteksi wajah/pose (mis. MediaPipe Face Detection).
- Hitung titik fokus (centroid wajah utama) per interval waktu → hasilkan koordinat crop dinamis (x, y bergerak, ukuran crop tetap sesuai target 9:16).
- Smoothing pergerakan crop antar-interval (moving average) agar hasil tidak "patah-patah"/jittery.
- Terapkan crop dinamis via ffmpeg (filter `crop` dengan ekspresi berbasis waktu, atau segmentasi + concat jika ekspresi crop dinamis tidak stabil).
- **Kasus multi-wajah (MVP):** pilih wajah dengan area/confidence terbesar sebagai fokus (asumsi speaker utama). Multi-speaker switching → Fase 2.
- **Kasus tanpa wajah terdeteksi:** fallback ke center-crop statis, beri flag di response bahwa face focus tidak aktif untuk segmen tsb.

### 5.6 Modul AI Metadata (Gemini)
- Generate: 3 alternatif judul, deskripsi singkat, hashtag relevan — berdasarkan transkrip **per klip** (segmen, bukan video penuh).
- User bisa regenerate jika hasil kurang sesuai (max N kali per klip, dibatasi untuk kontrol biaya API).
- User bisa edit manual judul terpilih sebelum finalize.

### 5.7 Job Queue & Processing (Batch)
- Struktur job dua level: **parent job** (per request, mencakup download + transkripsi penuh + highlight detection) → menghasilkan N **child job** (satu per klip: burn subtitle + reframe + metadata).
- Status granular parent: `queued | downloading | transcribing_full | detecting_highlights | rendering_clips | completed | failed`.
- Status granular tiap child (per klip): `queued | burning_subtitle | reframing | generating_metadata | completed | failed`.
- Child job bisa dikerjakan paralel (antar klip) untuk mempercepat total waktu batch, dengan batas concurrency per worker untuk kontrol beban compute.
- Jika satu **child** gagal, klip lain tetap lanjut — user tetap dapat klip yang berhasil, dengan opsi retry khusus untuk klip yang gagal.
- Jika **parent** gagal (mis. download/transkripsi gagal), seluruh batch gagal karena child bergantung pada transkrip penuh.

---

## 6. Kebutuhan Non-Fungsional

| Kategori | Kebutuhan |
|---|---|
| Performa | **Downloader (Fitur A):** streaming dimulai < 5 detik setelah user klik download, mengikuti durasi video karena proses sinkron. **Clipper (Fitur B):** pipeline penuh (download+transkripsi+highlight detection+N klip) selesai < 8 menit untuk video sumber < 15 menit dan `num_clips` ≤ 5 |
| Skalabilitas | Downloader (A) tidak butuh job queue — beban dikontrol lewat rate limit per IP. Clipper (B): job queue horizontal-scalable; child job (per klip) diproses paralel dengan batas concurrency; **catatan khusus:** deteksi wajah (face focus) adalah tahap paling CPU/GPU-intensive di pipeline B, dikali N klip — perlu benchmark kapasitas worker sebelum production |
| Keamanan | Rate limiting per IP (belum ada auth di MVP); validasi ukuran/durasi sebelum job dimulai |
| Privasi | File auto-terhapus dari object storage setelah 24 jam; tidak menyimpan konten permanen tanpa izin |
| Reliabilitas | Retry per-stage untuk API eksternal (Groq/Gemini) yang gagal/limit |
| Biaya | Monitoring pemakaian API Groq & Gemini per hari; **tambahan:** monitoring biaya compute untuk face detection karena ini paling berat secara komputasi dibanding modul lain |

---

## 7. Arsitektur Teknis

- **Routing/Halaman:** Dua halaman utama di frontend yang independen: `/download` (Fitur A) dan `/clipper` (Fitur B) — beda komponen, beda state, beda API call, hanya berbagi layout/nav.
- **Endpoint Downloader (Fitur A):** synchronous, langsung di backend API (tidak lewat job queue/worker), karena tidak ada AI processing — cukup proxy-stream dari yt-dlp ke response.
- **Frontend:** React (Vite), di-deploy ke Vercel.
- **Backend API:** Node.js (Express/Fastify), di-deploy ke Render sebagai web service.
- **Worker:** Proses terpisah (Render Background Worker) khusus untuk pipeline berat (download, ffmpeg, face detection) — dipisah dari API agar API tetap responsif.
- **Job Queue:** BullMQ (Redis) — Redis di-hosting sebagai add-on/service terpisah di Render.
- **Video Processing:** ffmpeg (subprocess di worker).
- **Face Detection:** MediaPipe (Python) dipanggil dari worker Node via subprocess, **atau** worker ditulis di Python (FastAPI/Celery) jika lebih mudah integrasi MediaPipe — *keputusan teknis ini perlu di-finalisasi sebelum mulai coding karena mempengaruhi struktur worker.*
- **Download Engine:** yt-dlp.
- **Transkripsi:** Groq API (Whisper large-v3 turbo).
- **AI Metadata:** Gemini API.
- **Storage:** **Object storage (Cloudflare R2 / S3-compatible) — wajib, bukan opsional.** Disk lokal di Render bersifat ephemeral (hilang saat redeploy/restart), tidak layak untuk menyimpan file video/klip meski sementara.
- **Database:** PostgreSQL (job/video/clip metadata), di-hosting sebagai Render Postgres atau layanan terpisah (mis. Neon/Supabase free tier) untuk hemat biaya awal.
- **Streaming preview:** video preview di-serve langsung sebagai file MP4 dari object storage (signed URL), **bukan HLS/m3u8** — disederhanakan dari v1 karena HLS menambah kompleksitas transcoding yang tidak sepadan untuk klip pendek (<3 menit).
- **Highlight Detection:** dijalankan di parent worker setelah transkrip penuh tersedia, memanggil Gemini API dengan transkrip (+ chunking jika terlalu panjang, lihat §5.3) sebelum men-dispatch N child job.

---

## 8. Risiko & Legal

- **Hak Cipta/ToS Platform:** Mengunduh & memproses ulang video pihak ketiga berpotensi melanggar ToS platform sumber. Disclaimer wajib ke user bahwa tanggung jawab konten ada di tangan mereka.
- **Rate Limit API Gratis:** Groq & Gemini free tier terbatas — perlu kuota harian per IP/user dan strategi antre.
- **Biaya Compute Face Detection:** Deteksi wajah per-frame/interval untuk tiap klip tetap butuh compute yang tidak sepele — **dikali N klip per request di v3**, jadi ini paling perlu load-test lebih dulu sebelum asumsikan biayanya kecil.
- **Biaya Download & Transkripsi Penuh:** Berbeda dari v2, di v3 seluruh video sumber wajib didownload dan ditranskripsi penuh **meski user cuma minta 1-2 klip** — ini konsekuensi langsung dari desain auto-highlight, dan jadi biaya tetap (fixed cost) per request terlepas dari `num_clips`. Perlu dikomunikasikan ke user (mis. kuota per video, bukan per klip).
- **Akurasi Highlight Detection:** Gemini bisa saja memilih momen yang secara teknis "lengkap" tapi tidak sesuai selera user (mis. bagian yang membosankan tapi berdiri sendiri secara kalimat). Tidak ada jaminan kualitas tanpa feedback loop — ini risiko produk, bukan cuma teknis, dan sebaiknya dipantau lewat metrik retensi/penghapusan klip (lihat §2).
- **Context Window Gemini untuk Video Panjang:** Transkrip video panjang (>45 menit) berisiko melebihi context window dalam satu request highlight-detection — butuh strategi chunking yang belum final (lihat §5.3), dan ini bisa mempengaruhi kualitas hasil (highlight lintas-chunk bisa terlewat).
- **Kualitas Reframe Tidak Konsisten:** Deteksi wajah bisa gagal pada kondisi pencahayaan buruk, sudut kamera ekstrem, atau video tanpa wajah jelas (mis. gameplay/slide). Perlu fallback yang jelas (center-crop) dan ekspektasi user perlu di-set (mis. badge "Face Focus: Auto" vs "Center Crop (no face detected)").
- **Biaya Storage:** Meski auto-cleanup 24 jam, video yang di-retry berkali-kali (karena gagal di tengah pipeline) bisa numpuk. Perlu cleanup job juga untuk file job gagal.

---

## 9. Timeline Kasar (Estimasi)

| Fase | Durasi Estimasi |
|---|---|
| Setup infra (Render + object storage + Postgres + Redis) | 3-4 hari |
| Downloader (full video) + resolve metadata | 3-4 hari |
| Integrasi Groq (transkripsi penuh + potong subtitle per klip) | 4-6 hari |
| **Highlight detection (Gemini) + strategi chunking transkrip panjang** | 1 minggu |
| Face detection + dynamic crop ffmpeg per klip (bagian paling eksperimental) | 1-2 minggu |
| Integrasi Gemini (judul/metadata per klip) | 2-3 hari |
| Job orchestration (parent-child, paralelisasi child job) | 4-5 hari |
| UI (input URL+jumlah klip, progress batch, daftar hasil, pilih judul per klip) | 1-1.5 minggu |
| Testing end-to-end pipeline & polish | 1 minggu |

*Catatan: modul face focus adalah bagian dengan risiko teknis tertinggi (paling banyak trial-error) — pertimbangkan membangun modul ini sebagai proof-of-concept terpisah dulu sebelum diintegrasikan ke pipeline penuh.*

---

## 10. User Stories

### Epic 1: Input & Highlight Detection
**US-1.1** — Sebagai user, saya ingin memasukkan URL dan melihat preview info video sebelum menentukan jumlah klip.
- *AC:* URL tidak valid menampilkan error dalam 3 detik.

**US-1.2** — Sebagai user, saya ingin memasukkan jumlah klip yang saya inginkan (mis. 5), tanpa perlu menentukan rentang waktu sendiri.
- *AC:* Input dibatasi sesuai batas sistem (mis. 1-10); nilai di luar batas ditolak dengan pesan jelas.

**US-1.3** — Sebagai user, jika video terlalu pendek untuk menghasilkan jumlah klip yang saya minta, saya ingin diberi tahu dan tetap mendapat klip sebanyak yang memungkinkan, bukan error total.

**US-1.4** — Sebagai user, saya ingin tahu alasan singkat kenapa suatu segmen dipilih jadi klip, agar saya bisa menilai relevansinya.

### Epic 2: Pipeline Otomatis Per Klip
**US-2.1** — Sebagai user, saya ingin sistem otomatis membuat subtitle dan langsung burn-in ke tiap klip tanpa saya harus edit dulu.
- *AC:* Subtitle muncul di preview akhir tanpa langkah approval terpisah.

**US-2.5** — Sebagai user, saya ingin klip yang sudah selesai diproses langsung muncul di daftar hasil, tanpa harus menunggu semua klip selesai.
- *AC:* Klip ke-1 yang selesai duluan bisa langsung dipreview meski klip ke-5 masih diproses.

**US-2.6** — Sebagai user, jika satu klip gagal diproses, saya ingin klip lain tetap selesai normal, dengan opsi retry khusus untuk yang gagal.

**US-2.2** — Sebagai user, saya ingin video otomatis di-reframe ke format vertikal yang mengikuti wajah pembicara, tanpa saya crop manual.
- *AC:* Preview akhir sudah dalam format 9:16 dengan wajah utama terlihat di sebagian besar durasi.

**US-2.3** — Sebagai user, jika sistem tidak mendeteksi wajah di video, saya ingin diberi tahu bahwa hasil pakai center-crop biasa, bukan gagal diam-diam.

**US-2.4** — Sebagai user, saya ingin melihat progress pipeline per tahap (download/transkripsi/subtitle/reframe/metadata) secara real-time.

### Epic 3: Judul & Metadata Otomatis
**US-3.1** — Sebagai user, saya ingin sistem menyarankan 3 judul otomatis berdasarkan isi klip.

**US-3.2** — Sebagai user, saya ingin tombol regenerate jika judul kurang sesuai, dengan batas jumlah regenerate agar tidak boros API.

**US-3.3** — Sebagai user, saya tetap bisa edit manual judul yang saya pilih sebelum finalize.

### Epic 4: Output & Cleanup
**US-4.1** — Sebagai user, saya ingin mendownload hasil akhir dalam MP4 siap-upload (subtitle + crop + tanpa perlu edit lagi).

**US-4.2** — Sebagai user, saya ingin tahu file saya akan terhapus otomatis dalam 24 jam.

**US-4.3** — Sebagai user, jika salah satu tahap pipeline gagal, saya ingin tahu di tahap mana dan bisa retry dari situ, bukan mengulang dari awal.

---

## 11. Spesifikasi API (Ringkas)

Base URL: `/api/v1`

### 11.0 Fitur A: Downloader (Mandiri, Sinkron)

#### `GET /download/info?url=...`
```json
// Response 200
{
  "title": "Judul Video Asli",
  "duration_seconds": 754,
  "thumbnail_url": "https://...",
  "platform": "youtube",
  "formats": [
    { "quality": "1080p", "ext": "mp4", "filesize_approx": 85000000 },
    { "quality": "720p", "ext": "mp4", "filesize_approx": 45000000 }
  ]
}
```

#### `GET /download?url=...&quality=720p`
Streaming langsung (response body = file video), bukan JSON. Header `Content-Disposition` diset agar browser trigger download otomatis.

---

### 11.1 Fitur B: Clipper (Batch, Asynchronous)

#### `POST /videos/resolve`
Ambil metadata video dari URL.
```json
// Request
{ "url": "https://youtube.com/watch?v=xxxx" }

// Response 200
{
  "title": "Judul Video Asli",
  "duration_seconds": 754,
  "thumbnail_url": "https://...",
  "platform": "youtube"
}
```

#### `POST /videos/generate-clips`
Trigger pipeline penuh: download, transkripsi, highlight detection, lalu render N klip otomatis.
```json
// Request
{
  "url": "https://youtube.com/watch?v=xxxx",
  "num_clips": 5,
  "face_focus": true
}

// Response 202
{ "batch_job_id": "job_batch_123", "status": "queued" }
```

#### `GET /jobs/{batch_job_id}`
Status parent job (level video/batch).
```json
{
  "batch_job_id": "job_batch_123",
  "status": "processing",
  "stage": "rendering_clips",
  "clips_total": 5,
  "clips_completed": 3,
  "clip_ids": ["clip_001", "clip_002", "clip_003", "clip_004", "clip_005"]
}
```
`stage`: `downloading | transcribing_full | detecting_highlights | rendering_clips | completed | failed`

#### `GET /clips/{clip_id}`
Status & hasil per klip individual (dipoll terpisah per clip_id dari daftar di atas).
```json
{
  "clip_id": "clip_001",
  "batch_job_id": "job_batch_123",
  "status": "completed",
  "stage": "completed",
  "start_time": 132.0,
  "end_time": 210.5,
  "highlight_reason": "Insight utama disampaikan secara ringkas dan berdiri sendiri",
  "preview_url": "https://storage.../clip_001_preview.mp4",
  "face_focus_applied": true,
  "titles": ["...", "...", "..."],
  "description": "...",
  "hashtags": ["#produktivitas", "#tips"]
}
```
`stage` per klip: `queued | burning_subtitle | reframing | generating_metadata | completed | failed`

#### `POST /clips/{clip_id}/finalize`
```json
// Request
{ "selected_title": "3 Trik Produktivitas yang Jarang Diketahui" }

// Response 200
{ "download_url": "https://storage.../clip_789_final.mp4" }
```

#### Error Format Standar
```json
{
  "error": "FACE_DETECTION_FAILED",
  "message": "Tidak ada wajah terdeteksi, hasil pakai center-crop.",
  "stage": "reframing"
}
```
Kode error umum: `INVALID_URL`, `FILE_TOO_LARGE`, `UNSUPPORTED_PLATFORM`, `TRANSCRIPTION_FAILED`, `HIGHLIGHT_DETECTION_FAILED`, `INSUFFICIENT_CONTENT_FOR_NUM_CLIPS` (video terlalu pendek untuk jumlah klip yang diminta), `FACE_DETECTION_FAILED`, `RENDER_FAILED`, `RATE_LIMIT_EXCEEDED`.

---

## 12. Skema Database (PostgreSQL, Ringkas)

### `videos`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID (PK) | |
| source_url | TEXT | |
| platform | VARCHAR(50) | |
| original_title | TEXT | |
| duration_seconds | FLOAT | |
| storage_path | TEXT | Path video sumber (full) di object storage |
| num_clips_requested | INT | |
| full_transcript_path | TEXT | JSON transkrip penuh dengan timestamp |
| status | VARCHAR(20) | pending, downloading, transcribing, detecting_highlights, ready, failed |
| expires_at | TIMESTAMP | |

### `clips`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID (PK) | |
| video_id | UUID (FK) | |
| start_time | FLOAT | Hasil highlight detection (bukan input user) |
| end_time | FLOAT | |
| highlight_reason | TEXT | Alasan singkat dari Gemini kenapa segmen ini dipilih |
| highlight_rank | INT | Urutan skor/prioritas dari Gemini, untuk sorting di UI |
| face_focus_enabled | BOOLEAN | |
| face_focus_applied | BOOLEAN | False jika fallback center-crop |
| crop_data | JSONB | Koordinat crop per interval waktu (hasil deteksi wajah) |
| subtitle_srt_path | TEXT | |
| output_path | TEXT | |
| status | VARCHAR(20) | pending, processing, completed, failed |
| current_stage | VARCHAR(30) | queued, burning_subtitle, reframing, generating_metadata, completed |
| expires_at | TIMESTAMP | |

### `clip_metadata`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID (PK) | |
| clip_id | UUID (FK) | |
| titles | JSONB | 3 alternatif judul |
| description | TEXT | |
| hashtags | JSONB | |
| selected_title | TEXT | |
| regenerate_count | INT | Untuk batasi biaya API |

### `jobs`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID (PK) | |
| video_id | UUID (FK, nullable) | Diisi untuk parent job (level batch) |
| clip_id | UUID (FK, nullable) | Diisi untuk child job (level klip) |
| parent_job_id | UUID (FK ke jobs.id, nullable) | Null untuk parent job, terisi untuk child |
| type | VARCHAR(20) | batch (parent), clip_render (child) |
| status | VARCHAR(20) | queued, processing, completed, failed |
| stage | VARCHAR(30) | |
| progress_percent | INT | |
| error_message | TEXT | |
| failed_stage | VARCHAR(30) | Untuk resume retry dari stage yang gagal |

*(Satu request user → satu row `jobs` dengan `type=batch` → N row `jobs` dengan `type=clip_render` dan `parent_job_id` mengarah ke parent-nya.)*

---

## 13. Struktur Folder Proyek (Ringkas)

```
clipforge-ai/
├── backend/
│   └── src/
│       ├── modules/
│       │   ├── downloader/          # dipakai BERSAMA oleh Fitur A (sinkron) & Fitur B (internal, via worker)
│       │   │   ├── downloader.controller.ts   # route /api/v1/download/* — Fitur A, sinkron
│       │   │   ├── downloader.service.ts      # wrapper yt-dlp (dipakai keduanya)
│       │   │   └── downloader.routes.ts
│       │   ├── transcription/       # Groq — transkripsi penuh (Fitur B)
│       │   ├── highlight-detection/ # Gemini — pilih N segmen terbaik (Fitur B)  ← BARU
│       │   ├── clipper/             # ffmpeg cut + subtitle burn-in (Fitur B)
│       │   ├── face-focus/          # deteksi wajah + dynamic crop (Fitur B)
│       │   └── metadata/            # Gemini — judul/deskripsi per klip (Fitur B)
│       ├── workers/
│       │   ├── batch-pipeline.worker.ts   # Fitur B parent: download → transcribe → detect highlights → dispatch child jobs
│       │   └── clip-render.worker.ts      # Fitur B child: burn subtitle → reframe → metadata (per klip, paralel)
│       ├── lib/
│       │   ├── ffmpeg.ts
│       │   ├── yt-dlp.ts
│       │   ├── face-detector.ts   # wrapper ke MediaPipe (Python subprocess) ← BARU
│       │   ├── groq-client.ts
│       │   ├── gemini-client.ts
│       │   └── object-storage.ts  # R2/S3 client ← ganti dari local storage.ts
│       └── db/
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── DownloadPage.tsx    # Fitur A — /download, mandiri
│       │   ├── HomePage.tsx        # Fitur B — /clipper, input URL + jumlah klip
│       │   ├── ProcessingPage.tsx  # Fitur B — progress batch + progress per klip
│       │   └── ResultsPage.tsx     # Fitur B — daftar N klip, tiap kartu: preview + pilih judul + download
│       └── components/
│           ├── downloader/
│           │   ├── UrlInputForm.tsx
│           │   └── QualitySelector.tsx
│           ├── NumClipsInput.tsx
│           ├── BatchProgress.tsx
│           ├── ClipCard.tsx        # preview + highlight_reason + title selector per klip
│           └── TitleSelector.tsx
├── docker-compose.yml   # Postgres, Redis (lokal dev saja)
├── PRD-ClipForgeAI.md
└── README.md
```

---

## 14. Keputusan Teknis yang Masih Perlu Difinalisasi

- [ ] Worker face-detection: subprocess Python dari Node, atau worker Python terpisah sepenuhnya?
- [ ] Library face detection: MediaPipe vs alternatif lain (trade-off akurasi vs kecepatan)
- [ ] Strategi dynamic crop di ffmpeg: filter `crop` dengan ekspresi waktu vs render per-segmen lalu concat (mana yang lebih stabil hasilnya)
- [ ] Object storage provider: Cloudflare R2 (gratis 10GB) vs alternatif lain
- [ ] Database hosting: Render Postgres vs Neon/Supabase (pertimbangan biaya di free tier)
- [ ] Strategi chunking transkrip untuk video panjang di highlight detection (§5.3) — belum ada pendekatan final
- [ ] Batas concurrency child job (berapa klip diproses paralel sekaligus) — trade-off kecepatan batch vs beban worker/biaya API
