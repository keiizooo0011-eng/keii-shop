(() => {
  'use strict';

  const form = document.getElementById('registerForm');
  const message = document.getElementById('message');
  const submitButton = form?.querySelector('button[type="submit"]');
  const buttonLabel = submitButton?.querySelector('span');

  function setMessage(text = '', type = '') {
    if (!message) return;
    message.textContent = String(text || '');
    message.className = `auth-message${type ? ` ${type}` : ''}`;
    message.style.display = text ? 'block' : 'none';
  }

  function setLoading(active) {
    if (!submitButton) return;
    submitButton.disabled = active;
    if (buttonLabel) {
      buttonLabel.textContent = active ? 'Sedang Membuat Akun...' : 'Daftar Sekarang';
    }
  }

  function readableError(error) {
    const text =
      error?.message ||
      error?.error_description ||
      error?.msg ||
      (typeof error === 'string' ? error : '');

    if (/already registered|already been registered|user already exists/i.test(text)) {
      return 'Email tersebut sudah terdaftar. Silakan masuk menggunakan akun yang sudah ada.';
    }
    if (/username/i.test(text) && /duplicate|unique|used|exists/i.test(text)) {
      return 'Username tersebut sudah digunakan. Silakan pilih username lain.';
    }
    if (/password/i.test(text) && /least|short|weak|characters/i.test(text)) {
      return 'Kata sandi terlalu lemah. Gunakan minimal 6 karakter.';
    }
    if (/rate limit/i.test(text)) {
      return 'Terlalu banyak percobaan. Tunggu sebentar lalu coba kembali.';
    }
    return text || 'Pendaftaran gagal. Silakan periksa koneksi dan coba kembali.';
  }

  async function withTimeout(promise, milliseconds = 20000) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(
        'Proses pendaftaran terlalu lama. Periksa koneksi lalu coba kembali.'
      )), milliseconds);
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

  form.addEventListener('submit', async event => {
    event.preventDefault();
    event.stopPropagation();

    if (submitButton?.disabled) return;

    setMessage('');

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

    if (password !== confirmation) {
      setMessage('Kata sandi dan konfirmasi kata sandi tidak sama.');
      return;
    }

    setLoading(true);
    setMessage('Sedang membuat akun KivoPay...');

    try {
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

      if (result.error) throw result.error;
      if (!result.data?.user) {
        throw new Error('Supabase tidak mengembalikan data akun.');
      }

      // Confirm Email OFF: session tersedia dan user langsung masuk dashboard.
      if (result.data.session) {
        setMessage('Akun berhasil dibuat. Membuka dashboard...', 'success');
        setLoading(true);
        setTimeout(() => window.location.replace('account.html?registered=1'), 900);
        return;
      }

      // Confirm Email ON: akun tetap berhasil dibuat, lalu ke login.
      setMessage(
        'Akun berhasil dibuat. Silakan verifikasi email, lalu masuk menggunakan akun tersebut.',
        'success'
      );
      setLoading(true);
      setTimeout(() => window.location.replace('login.html?registered=1'), 1800);
    } catch (error) {
      console.error('KivoPay registration failed:', error);
      setMessage(readableError(error));
      setLoading(false);
    }
  });

  setMessage('');
})();