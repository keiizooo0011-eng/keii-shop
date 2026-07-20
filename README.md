# KivoPay V11 — Store + Admin Foundation

Versi ini menggabungkan:

- Store **APK Premium**
- Store **Sewa Bot**
- Seluruh **Kivo Tools v10.3**
- Cek pesanan
- Login Admin Supabase
- Tambah, edit, hapus, aktif/nonaktif produk
- Upload foto produk dari HP ke bucket `keiishop`
- Varian/paket produk
- Kelola status order

## Penting

Versi ini adalah **fondasi Store dan Admin**. QRIS Sanpay belum live supaya gateway tidak dipasang sebelum database dan checkout dasar berhasil dites.

## Instalasi

### 1. Jalankan SQL

Buka Supabase:

`SQL Editor → New query`

Salin seluruh isi file:

`supabase_setup.sql`

Klik **Run**.

### 2. Daftarkan akun sebagai admin

Buka:

`Authentication → Users`

Salin **UID** akun admin yang sudah dibuat.

Kembali ke SQL Editor, jalankan:

```sql
insert into public.admin_users(user_id)
values ('PASTE_UID_ADMIN_DI_SINI')
on conflict (user_id) do nothing;
```

Ganti `PASTE_UID_ADMIN_DI_SINI` dengan UID akunmu.

### 3. Isi konfigurasi Supabase

Buka file:

`config.js`

Isi:

```js
window.KIVOPAY_CONFIG = {
  supabaseUrl: "PROJECT_URL",
  supabaseAnonKey: "PUBLISHABLE_ANON_KEY",
  storageBucket: "keiishop"
};
```

Jangan pernah memasukkan `service_role`, secret key, Sanpay API key, atau token bot ke file frontend.

### 4. Deploy

Upload seluruh isi proyek ke repository Vercel yang terhubung dengan `kivopay.shop`.

### 5. Login admin

Buka:

`https://kivopay.shop/admin.html`

Login menggunakan akun Supabase yang sudah dibuat.

## Menambah varian

Di form produk, format satu baris satu varian:

```text
1 Bulan|15000
3 Bulan|40000
Lifetime|100000
```

## Tahap selanjutnya

Sesudah Store, Admin, upload foto, dan order pending sudah berhasil dites, tahap berikutnya adalah:

- Backend Vercel untuk checkout aman
- Integrasi QRIS Sanpay
- Callback pembayaran
- Status paid otomatis
- Pengiriman stok atau aktivasi sewa bot


Baca juga README_V12.md.
