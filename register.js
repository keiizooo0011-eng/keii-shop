(() => {
  'use strict';

  const form = document.getElementById('registerForm');
  const message = document.getElementById('message');
  const submitButton = form?.querySelector('button[type="submit"]');
  const submitLabel = submitButton?.querySelector('span');

  function setLoading(active) {
    if (!submitButton) return;
    submitButton.disabled = active;
    submitButton.setAttribute('aria-busy', active ? 'true' : 'false');
    if (submitLabel) submitLabel.textContent = active ? 'Sedang Membuat Akun...' : 'Daftar Sekarang';
  }

  function rawErrorText(error) {
    if (!error) return '';
    if (typeof error === 'string') return error.trim();

    const candidates = [
      error.message,
      error.error_description,
      error.description,
      error.details,
      error.hint,
      error.msg,
      error.code,
      error.error
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim() && candidate.trim() !== '{}') {
        return candidate.trim();
      }
    }

    try {
      const json = JSON.stringify(error);
      if (json && json !== '{}' && json !== '[]') return json;
    } catch (_) {}

    return '';
  }

  function readableError(error) {
    const text = rawErrorText(error);

    if (/already registered|already been registered|user already exists|email.*exists/i.test(text)) {
      return 'Email tersebut sudah terdaftar. Silakan masuk menggunakan akun yang sudah ada.';
    }
    if (/duplicate key|profiles_username|username.*unique|username.*used|username.*exists/i.test(text)) {
      return 'Username tersebut sudah digunakan. Silakan pilih username lain.';
    }
    if (/database error saving new user|unexpected_failure|500/i.test(text)) {
      return 'Database gagal membuat profil pengguna. Periksa trigger profiles di Supabase.';
    }
    if (/column.*username.*does not exist|schema cache.*username/i.test(text)) {
      return 'Kolom username pada tabel profiles belum tersedia. Jalankan pembaruan database akun di Supabase.';
    }
    if (/password/i.test(text) && /least|short|weak|characters/i.test(text)) {
      return 'Kata sandi terlalu lemah. Gunakan minimal 6 karakter.';
    }
    if (/email.*invalid|invalid.*email/i.test(text)) {
      return 'Format email tidak valid. Periksa kembali alamat email kamu.';
    }
    if (/rate limit|too many requests|429/i.test(text)) {
      return 'Terlalu banyak percobaan daftar. Tunggu beberapa menit lalu coba kembali.';
    }
    if (/failed to fetch|network|load failed|fetch/i.test(text)) {
      return 'Koneksi ke server akun gagal. Periksa internet lalu coba kembali.';
    }

    return text || 'Pendaftaran gagal. Supabase tidak memberikan keterangan kesalahan. Periksa konfigurasi Auth dan trigger profiles.';
  }

  function showMessage(value = '', type = '') {
    if (!message) return;
    let text = typeof value === 'string' ? value.trim() : readableError(value);
    if (!text || text === '{}' || text === '[object Object]') {
      text = 'Pendaftaran gagal. Supabase tidak memberikan keterangan kesalahan. Silakan coba kembali.';
    }
    message.textContent = text;
    message.className = `auth-message${type ? ` ${type}` : ''}`;
    message.style.display = text ? 'block' : 'none';
    message.hidden = !text;
  }

  function clearMessage() {
    if (!message) return;
    message.textContent = '';
    message.className = 'auth-message';
    message.style.display = 'none';
    message.hidden = true;
  }

  async function getClient() {
    if (window.KivoAuth?.db) return window.KivoAuth.db;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (window.supabase && window.KIVOPAY_CONFIG?.supabaseUrl && window.KIVOPAY_CONFIG?.supabaseAnonKey) {
        return window.supabase.createClient(
          window.KIVOPAY_CONFIG.supabaseUrl,
          window.KIVOPAY_CONFIG.supabaseAnonKey
        );
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Koneksi Supabase belum tersedia. Muat ulang halaman lalu coba kembali.');
  }

  async function withTimeout(promise, milliseconds = 25000) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Proses pendaftaran terlalu lama. Periksa koneksi lalu coba kembali.')), milliseconds);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  document.querySelectorAll('[data-toggle-password]').forEach(button => {
    button.addEventListener('click', () => {
      const input = button.parentElement?.querySelector('input');
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.textContent = show ? 'Sembunyi' : 'Lihat';
    });
  });

  if (!form) return;
  clearMessage();

  // Menahan script/cache lama agar tidak pernah menampilkan "{}" lagi.
  if (message) {
    new MutationObserver(() => {
      const value = message.textContent.trim();
      if (value === '{}' || value === '[object Object]') {
        showMessage('Pendaftaran gagal. Supabase tidak memberikan keterangan kesalahan. Silakan coba kembali.');
      }
    }).observe(message, { childList: true, characterData: true, subtree: true });
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (submitButton?.disabled) return;

    clearMessage();

    const fullName = document.getElementById('fullName')?.value.trim() || '';
    const username = document.getElementById('username')?.value.trim().toLowerCase() || '';
    const email = document.getElementById('email')?.value.trim().toLowerCase() || '';
    const password = document.getElementById('password')?.value || '';
    const confirmation = document.getElementById('confirmPassword')?.value || '';
    const acceptedTerms = document.getElementById('terms')?.checked;

    if (fullName.length < 2) return showMessage('Nama lengkap minimal 2 karakter.');
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return showMessage('Username harus 3–20 karakter dan hanya berisi huruf, angka, atau garis bawah.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return showMessage('Masukkan alamat email yang valid.');
    if (password.length < 6) return showMessage('Kata sandi minimal 6 karakter.');
    if (password !== confirmation) return showMessage('Kata sandi dan konfirmasi kata sandi tidak sama.');
    if (!acceptedTerms) return showMessage('Kamu harus menyetujui ketentuan penggunaan KivoPay.');

    setLoading(true);
    showMessage('Sedang membuat akun KivoPay...');

    try {
      const db = await getClient();
      const result = await withTimeout(db.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            display_name: fullName,
            username
          }
        }
      }));

      if (result?.error) throw result.error;
      if (!result?.data?.user) throw new Error('Supabase tidak mengembalikan data akun baru.');

      if (result.data.session) {
        showMessage('Akun berhasil dibuat. Membuka dashboard...', 'success');
        setTimeout(() => window.location.replace('account.html?registered=1'), 900);
        return;
      }

      showMessage('Akun berhasil dibuat. Silakan verifikasi email, lalu masuk ke akun.', 'success');
      setTimeout(() => window.location.replace('login.html?registered=1'), 1800);
    } catch (error) {
      console.error('KIVOPAY_REGISTER_ERROR', error);
      showMessage(readableError(error));
      setLoading(false);
    }
  }, true);
})();
