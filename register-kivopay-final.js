(() => {
  'use strict';

  const form = document.getElementById('registerForm');
  const message = document.getElementById('message');
  const submitButton = form?.querySelector('button[type="submit"]');
  const submitLabel = submitButton?.querySelector('span');

  function setLoading(loading) {
    if (!submitButton) return;
    submitButton.disabled = loading;
    if (submitLabel) {
      submitLabel.textContent = loading ? 'Sedang Membuat Akun...' : 'Daftar Sekarang';
    }
  }

  function setMessage(text = '', type = '') {
    if (!message) return;
    const safeText = typeof text === 'string' ? text.trim() : '';
    message.textContent = safeText;
    message.className = `auth-message${type ? ` ${type}` : ''}`;
    message.hidden = !safeText;
  }

  function readableError(error) {
    const text =
      error?.message ||
      error?.error_description ||
      error?.details ||
      error?.hint ||
      error?.msg ||
      (typeof error === 'string' ? error : '');

    if (/already registered|already been registered|user already exists/i.test(text)) {
      return 'Email tersebut sudah terdaftar. Silakan masuk menggunakan akun yang sudah ada.';
    }
    if (/duplicate key|profiles_username|username.*unique/i.test(text)) {
      return 'Username tersebut sudah digunakan. Silakan pilih username lain.';
    }
    if (/column.*username.*does not exist|schema cache.*username/i.test(text)) {
      return 'Database akun belum diperbarui. Jalankan file SQL REGISTER_DATABASE_FIX di Supabase.';
    }
    if (/database error saving new user/i.test(text)) {
      return 'Profil akun gagal dibuat oleh database. Jalankan file SQL REGISTER_DATABASE_FIX di Supabase.';
    }
    if (/password/i.test(text) && /least|short|weak|characters/i.test(text)) {
      return 'Kata sandi terlalu lemah. Gunakan minimal 6 karakter.';
    }
    if (/rate limit/i.test(text)) {
      return 'Terlalu banyak percobaan daftar. Tunggu beberapa menit lalu coba kembali.';
    }
    return text || 'Pendaftaran gagal. Silakan periksa data dan coba kembali.';
  }

  async function withTimeout(promise, milliseconds = 25000) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Proses pendaftaran terlalu lama. Periksa koneksi lalu coba kembali.'));
      }, milliseconds);
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  document.querySelectorAll('[data-toggle-password]').forEach(button => {
    button.addEventListener('click', () => {
      const input = button.parentElement?.querySelector('input');
      if (!input) return;
      const willShow = input.type === 'password';
      input.type = willShow ? 'text' : 'password';
      button.textContent = willShow ? 'Sembunyi' : 'Lihat';
    });
  });

  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    event.stopPropagation();

    if (submitButton?.disabled) return;

    const db = window.KivoAuth?.db;
    if (!db) {
      setMessage('Koneksi Supabase belum tersedia. Muat ulang halaman lalu coba kembali.');
      return;
    }

    const fullName = document.getElementById('fullName')?.value.trim() || '';
    const username = document.getElementById('username')?.value.trim().toLowerCase() || '';
    const email = document.getElementById('email')?.value.trim().toLowerCase() || '';
    const password = document.getElementById('password')?.value || '';
    const confirmation = document.getElementById('confirmPassword')?.value || '';

    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      setMessage('Username harus 3–20 karakter dan hanya boleh berisi huruf, angka, atau garis bawah.');
      return;
    }

    if (password !== confirmation) {
      setMessage('Kata sandi dan konfirmasi kata sandi tidak sama.');
      return;
    }

    setLoading(true);
    setMessage('Sedang membuat akun KivoPay...');

    try {
      const usernameResult = await withTimeout(
        db.from('profiles')
          .select('user_id')
          .eq('username', username)
          .maybeSingle(),
        12000
      );

      if (usernameResult.error) throw usernameResult.error;
      if (usernameResult.data) {
        throw new Error('Username tersebut sudah digunakan.');
      }

      const result = await withTimeout(
        db.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              display_name: fullName,
              username
            }
          }
        })
      );

      if (result.error) throw result.error;
      if (!result.data?.user) {
        throw new Error('Akun tidak berhasil dibuat oleh Supabase.');
      }

      if (result.data.session) {
        setMessage('Akun berhasil dibuat. Membuka dashboard...', 'success');
        setTimeout(() => window.location.replace('account.html?registered=1'), 900);
        return;
      }

      setMessage(
        'Akun berhasil dibuat. Verifikasi email terlebih dahulu, lalu masuk ke akun.',
        'success'
      );
      setTimeout(() => window.location.replace('login.html?registered=1'), 2200);
    } catch (error) {
      console.error('KivoPay register error:', error);
      setMessage(readableError(error));
      setLoading(false);
    }
  });

  setMessage('');
})();