# Kivo Tools v2

Versi tanpa emoji, siap deploy ke Vercel.

## Isi
- AI Chat
- Translate
- TikTok downloader
- CapCut downloader
- SnackVideo downloader
- TikTok profile
- Cuaca
- Zodiak
- Arti nama
- Potensi kesehatan berbasis primbon
- Password, JSON, Base64, Case Converter, UUID, Word Counter

## Deploy
Upload semua file dan folder ini ke repository GitHub:
- index.html
- style.css
- script.js
- api/siputzx.js
- README.md

Vercel akan otomatis memakai folder `api` sebagai Serverless Function.

## Catatan
Endpoint pihak ketiga dapat berubah atau berhenti sewaktu-waktu.
Downloader hanya untuk konten yang berhak disimpan.
Fitur potensi kesehatan adalah hiburan dan bukan diagnosis medis.


## Perubahan v3
- AI tampil seperti chat biasa, bukan JSON.
- Riwayat chat tersimpan di browser.
- Downloader menampilkan preview video/gambar/audio dan tombol download.
- Data mentah tetap tersedia dalam bagian detail.


## Perubahan v4
- Input AI dan tombol kirim sejajar seperti WhatsApp/Telegram.
- Tombol kirim bulat.
- Textarea otomatis membesar saat mengetik.
- Bubble pesan memiliki jam dan centang ganda untuk pesan pengguna.
- Tampilan modal, hasil downloader, dan respons mobile dirapikan.

## Perubahan v5
- TikTok Profile tidak lagi menampilkan JSON mentah.
- Cuaca, zodiak, arti nama, dan potensi kesehatan tampil sebagai kartu teks.
- Translate menampilkan hasil terjemahan secara langsung.
- Angka statistik dibuat ringkas dan mudah dibaca.
- Foto profil, statistik, bio, dan tombol salin username ditambahkan.
- Pesan kesalahan kini tampil sebagai kartu yang jelas.


## Perubahan v6
- Memperbaiki parameter Zodiak (`zodiac` diteruskan sebagai `zodiak`).
- Animasi muncul saat scroll, glow bergerak, partikel halus, judul berkilau, dan modal lebih lembut.
- Efek hover kartu dan tombol ditingkatkan.
- Footer profesional dengan identitas pembuat Hetacase.
- Menghormati pengaturan reduced motion pengguna.

## Perubahan v6.1
- Bubble AI dibuat lebih kecil dan mengikuti panjang isi pesan.
- Indikator mengetik menjadi tiga titik bergerak.
- Pesan kosong atau indikator mengetik yang tersangkut dibersihkan otomatis.
- Nama pembuat diganti menjadi `keii official`.
- Ditambahkan layar sambutan dengan efek mengetik saat website dibuka.

## Perubahan v7
- Seluruh tulisan utama dibuat lebih natural dan memiliki identitas Kivo Tools.
- Hero memakai kalimat baru dari keii official.
- Ditambahkan pesan singkat yang berganti otomatis setiap empat detik.
- Tombol utama, status website, judul bagian tools, dan deskripsi fitur diperbarui.
- Footer dibuat lebih profesional dan tetap mencantumkan keii official.
- Sambutan pembuka hanya muncul sekali dalam satu sesi browser agar tidak mengganggu.

## Perubahan v8
- Bug jawaban AI yang terpotong telah diperbaiki.
- Bubble chat mengikuti panjang dan tinggi konten secara otomatis.
- Jawaban AI mendukung tampilan bold, italic, daftar, inline code, dan code block.
- Ditambahkan tombol salin pada setiap pesan dan tombol ulangi pada jawaban AI.
- Ditambahkan menu pengaturan untuk system prompt dan temperature.
- Pengaturan AI tersimpan di browser masing-masing pengguna.
- Chat dapat diekspor menjadi file teks.
- Identitas default AI diperbarui menjadi Kivo AI buatan keii official.


## Perbaikan v8.1
- Memperbaiki syntax error JavaScript yang membuat hero dan seluruh kartu tools tidak tampil.
- Menambahkan cache busting untuk style.css dan script.js agar browser langsung memakai versi terbaru.
- Semua fitur v8 tetap dipertahankan.

## Perubahan v8.2
- Bubble pesan dipaksa mengikuti tinggi isi teks.
- Ukuran teks chat diperkecil dan dibuat lebih proporsional.
- Padding, jarak waktu, dan tombol aksi dipadatkan.
- Bubble pengguna dibatasi agar tidak terlalu lebar atau tinggi.
- Cache versi dinaikkan ke v8.2.

## Perubahan v9
- Menambahkan fitur Anime Quote dari endpoint Siputzx `/api/r/quotesanime`.
- Menambahkan Kartu Profil Demo yang berjalan langsung di browser.
- Foto Kartu Profil Demo dapat dipilih melalui link atau upload langsung dari perangkat.
- Hasil kartu dapat diunduh sebagai PNG.
- Semua kartu demo memiliki watermark permanen `SIMULASI — TIDAK BERLAKU`.
- Menambahkan kategori Kreatif di navigasi.

## Perubahan v9.1 — Downloader
- Preview video tidak dimuat otomatis; thumbnail tampil lebih dulu agar modal lebih cepat.
- Video baru dimuat setelah tombol `Putar Preview` ditekan.
- Ditambahkan proxy media Vercel dengan dukungan HTTP Range untuk preview.
- Tombol download memakai `Content-Disposition: attachment` agar lebih konsisten.
- Ditambahkan tombol `Buka Link Asli` sebagai fallback jika CDN menolak proxy.
- Cache aset dinaikkan ke versi 9.1.
