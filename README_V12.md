# KivoPay V12 Full Auto Sanpay

## Jalankan SQL tambahan
Jalankan `supabase_v12_auto_order.sql` di SQL Editor setelah SQL V11 sudah sukses.

## Isi config.js
Masukkan Project URL dan publishable key BARU milikmu. Jangan gunakan key lama yang pernah dikirim.

## Environment Variables Vercel
Tambahkan di Vercel → Project → Settings → Environment Variables:

SUPABASE_URL=https://hfxdsyzdlfrekqrfleai.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SECRET_SERVER_SUPABASE
SANPAY_BASE_URL=https://sanpay.site
SANPAY_CREATE_QRIS_ENDPOINT=/api/v1/topup_qris
SANPAY_GET_MUTASI_ENDPOINT=/api/v1/get_mutasi
SANPAY_MERCHANT_CODE=MERCHANT_CODE_KAMU
SANPAY_API_KEY=API_KEY_SANPAY_KAMU
SANPAY_UNIQUE_FEE_MIN=100
SANPAY_UNIQUE_FEE_MAX=200
PAYMENT_EXPIRE_MINUTES=10
CRON_SECRET=TEKS_ACAK_PANJANG

Jangan taruh API key Sanpay atau Supabase service role di config.js/GitHub.

## Cara pakai Admin
1. Tambah produk.
2. Masukkan varian: `1 Bulan|15000`.
3. Buka Tambah Stok Produk.
4. Nama varian harus sama persis: `1 Bulan`.
5. Pisahkan stok menggunakan baris `---`.

## Alur otomatis
Checkout → QRIS Sanpay → cek mutasi → pembayaran cocok → satu stok dikunci → order completed → produk tampil untuk pembeli → stok berkurang.

Jika pembayaran masuk tetapi stok kosong, status berubah menjadi `processing` agar diproses manual.
