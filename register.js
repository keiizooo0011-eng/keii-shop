(() => {
  const form = document.getElementById('registerForm');
  const message = document.getElementById('message');
  const submitButton = form?.querySelector('button[type="submit"]');

  function normalizeMessage(value) {
    if (value == null) return '';
    if (typeof value === 'string') {
      const clean = value.trim();
      return clean === '{}' || clean === '[object Object]' ? '' : clean;
    }
    if (value instanceof Error && value.message) return value.message;
    if (typeof value === 'object') {
      return value.message || value.error_description || value.msg || value.error ||
        'Terjadi kesalahan saat membuat akun. Silakan coba kembali.';
    }
    return String(value);
  }

  function showMessage(value = '', type = '') {
    if (!message) return;
    const text = normalizeMessage(value);
    message.textContent = text;
    message.className = `auth-message${type ? ` ${type}` : ''}`;
    message.hidden = !text;
  }

  // Perlindungan tambahan terhadap script/cache lama yang menulis "{}".
  if (message) {
    const observer = new MutationObserver(() => {
      const current = message.textContent.trim();
      if (current === '{}' || current === '[object Object]') {
        message.textContent = '';
        message.hidden = true;
      }
    });
    observer.observe(message, { childList: true, characterData: true, subtree: true });
    showMessage('');
  }

  document.querySelectorAll('[data-toggle-password]').forEach(button => {
    button.addEventListener('click', () => {
      const input = button.parentElement?.querySelector('input');
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      button.textContent = input.type === 'password' ? 'Lihat' : 'Sembunyi';
    });
  });

  form?.addEventListener('submit', async event => {
    event.preventDefault();
    showMessage('');

    if (!window.KivoAuth?.db) {
      showMessage('Koneksi akun belum tersedia. Muat ulang halaman lalu coba lagi.');
      return;
    }

    const fullName = document.getElementById('fullName').value.trim();
    const username = document.getElementById('username').value.trim().toLowerCase();
    const email = document.getElementById('email').value.trim().toLowerCase();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (password !== confirmPassword) {
      showMessage('Kata sandi dan konfirmasi kata sandi tidak sama.');
      return;
    }

    submitButton.disabled = true;
    showMessage('Sedang membuat akun KivoPay...');

    try {
      const { data, error } = await KivoAuth.db.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            display_name: fullName,
            username
          }
        }
      });

      if (error) throw error;
      if (!data?.user) throw new Error('Akun belum berhasil dibuat. Silakan coba lagi.');

      if (!data.session) {
        showMessage('Akun berhasil dibuat. Silakan cek email untuk verifikasi sebelum masuk.', 'success');
        submitButton.disabled = false;
        return;
      }

      showMessage('Akun berhasil dibuat. Membuka dashboard...', 'success');
      setTimeout(() => location.replace('index.html?registered=1'), 700);
    } catch (error) {
      console.error('Register error:', error);
      let text = normalizeMessage(error);

      if (/already registered|already been registered|user already exists/i.test(text)) {
        text = 'Email tersebut sudah terdaftar. Silakan masuk menggunakan akun yang ada.';
      } else if (/password/i.test(text) && /least|short|weak/i.test(text)) {
        text = 'Kata sandi terlalu lemah. Gunakan minimal 6 karakter.';
      } else if (!text) {
        text = 'Pendaftaran gagal. Silakan periksa data lalu coba kembali.';
      }

      showMessage(text);
      submitButton.disabled = false;
    }
  });
})();