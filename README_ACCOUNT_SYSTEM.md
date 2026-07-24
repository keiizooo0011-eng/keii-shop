# KivoPay Account System

1. Upload/replace semua file dari ZIP ini.
2. Jalankan `supabase_account_system.sql` satu kali di Supabase SQL Editor.
3. Daftar akun melalui `/register.html`.
4. Akun yang tercatat di `admin_users` otomatis diarahkan ke `/admin.html`; user biasa ke `/account.html`.
5. Confirm email boleh OFF saat testing. Site URL dan Redirect URL: `https://kivopay.shop`.

Catatan: order baru yang dibuat setelah login otomatis terkait ke `user_id`. Order lama tetap dapat dicek lewat invoice.
