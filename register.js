(() => {
  const form = document.getElementById('registerForm');
  const message = document.getElementById('message');
  const submitButton = form?.querySelector('button[type="submit"]');

  function showMessage(text = '', type = '') {
    if (!message) return;
    message.textContent = String(text || '');
    message.className = `auth-message${type ? ` ${type}` : ''}`;
  }

  function readableError(error) {
    if (!error) return 'Terjadi kesalahan saat membuat akun.';
    if (typeof error === 'string') return error;
    if (typeof error.message === 'string' && error.message.trim()) return error.message;
    if (typeof error.error_description === 'string' && error.error_description.trim()) return error.error_description;
    if (typeof error.msg === 'string' && error.msg.trim()) return error.msg;
    return 'Terjadi kesalahan saat membuat akun. Silakan coba lagi.';
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

    const fullNameInput = document.getElementById('fullName');
    const usernameInput = document.getElementById('username');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');

    const fullName = fullNameInput.value.trim();
    const username = usernameInput.value.trim().toLowerCase();
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    if (password !== confirmPasswordInput.value) {
      showMessage('Kata sandi dan konfirmasi kata sandi tidak sama.');
      return;
    }

    submitButton.disabled = true;
    showMessage('Sedang membuat akun KivoPay...');

    try {
      // Cek username lebih dulu. Error RLS diabaikan karena trigger database tetap
      // akan memvalidasi constraint username unik saat profil dibuat.
      const usernameCheck = await KivoAuth.db
        .from('profiles')
        .select('user_id')
        .eq('username', username)
        .maybeSingle();

      if (usernameCheck.data) {
        throw new Error('Username sudah digunakan. Silakan pilih username lain.');
      }

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

      // Profil dibuat otomatis oleh trigger Supabase. Tidak perlu upsert dari browser.
      if (!data.session) {
        showMessage('Akun berhasil dibuat. Silakan cek email untuk verifikasi sebelum masuk.', 'success');
        submitButton.disabled = false;
        return;
      }

      showMessage('Akun berhasil dibuat. Membuka dashboard...', 'success');
      setTimeout(() => location.replace('account.html'), 700);
    } catch (error) {
      console.error('Register error:', error);
      let text = readableError(error);
      if (/already registered|already been registered|user already exists/i.test(text)) {
        text = 'Email tersebut sudah terdaftar. Silakan masuk menggunakan akun yang ada.';
      } else if (/password/i.test(text) && /least|short|weak/i.test(text)) {
        text = 'Kata sandi terlalu lemah. Gunakan minimal 6 karakter.';
      }
      showMessage(text);
      submitButton.disabled = false;
    }
  });
})();
