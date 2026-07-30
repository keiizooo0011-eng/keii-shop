(() => {
  const copy = document.querySelector('.apk-typing-copy');
  const output = document.getElementById('apkTypingText');
  if (!copy || !output) return;

  const messages = [
    'Nikmati pengalaman berlangganan aplikasi premium dengan sistem pemesanan modern.',
    'Proses cepat, pembayaran praktis, dan dukungan layanan yang siap membantu setiap saat.',
    'Tersedia pilihan akun otomatis, layanan manual, hingga sistem invite email.',
    'Semua kebutuhan premium dalam satu katalog yang aman, praktis, dan terpercaya.'
  ];

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let index = 0;

  const show = (message) => {
    output.textContent = message;
    copy.classList.remove('is-leaving');
    requestAnimationFrame(() => copy.classList.add('is-visible'));
  };

  if (reduceMotion) {
    show(messages[0]);
    return;
  }

  show(messages[0]);
  window.setInterval(() => {
    copy.classList.remove('is-visible');
    copy.classList.add('is-leaving');
    window.setTimeout(() => {
      index = (index + 1) % messages.length;
      output.textContent = messages[index];
      copy.classList.remove('is-leaving');
      requestAnimationFrame(() => copy.classList.add('is-visible'));
    }, 460);
  }, 9000);
})();
