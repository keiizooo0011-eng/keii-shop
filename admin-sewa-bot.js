(async () => {
  const list = document.querySelector('#adminBotList');
  const msg = document.querySelector('#adminBotMessage');
  const stats = document.querySelector('#botStats');
  const backupList = document.querySelector('#backupList');
  const backupMessage = document.querySelector('#backupMessage');
  const backupProgress = document.querySelector('#backupProgress');
  const backupStage = document.querySelector('#backupStage');
  const backupPercent = document.querySelector('#backupPercent');
  const backupBar = document.querySelector('#backupBar');
  const backupLastInfo = document.querySelector('#backupLastInfo');
  const createBackupButton = document.querySelector('#createBotBackup');

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
  const date = (value) => value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
  const size = (bytes = 0) => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = Number(bytes || 0);
    let index = 0;
    while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
    return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
  };

  async function headers(json = true) {
    const session = await KivoAuth.session();
    if (!session) { location.href = 'login.html'; throw new Error('Sesi login berakhir.'); }
    return {
      Authorization: `Bearer ${session.access_token}`,
      ...(json ? { 'Content-Type': 'application/json' } : {})
    };
  }

  async function api(options = {}) {
    const response = await fetch('/api/admin-bot-orders', {
      ...options,
      headers: { ...(await headers()), ...(options.headers || {}) }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Gagal memuat.');
    return body;
  }

  async function backupApi(query = '', options = {}) {
    const response = await fetch(`/api/admin-bot-backups${query}`, {
      ...options,
      headers: { ...(await headers()), ...(options.headers || {}) }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Proses backup gagal.');
    return body;
  }

  function renderStats(summary = {}, orders = []) {
    stats.innerHTML = [
      ['Total Order', orders.length],
      ['Bot Aktif', summary.connected || orders.filter((item) => item.status === 'connected').length],
      ['Menunggu Pairing', summary.waitingPairing || orders.filter((item) => item.status === 'waiting_pairing').length],
      ['Bermasalah', (summary.error || 0) + orders.filter((item) => ['failed', 'error'].includes(item.status)).length]
    ].map(([label, value]) => `<article><span>${label}</span><strong>${value}</strong></article>`).join('');
  }

  function render(orders) {
    list.innerHTML = orders.length ? orders.map((order) => `<article class="order">
      <div class="head"><div><small>${esc(order.invoice)}</small><h3>${esc(order.product_name)} — ${esc(order.variant_name || 'Paket utama')}</h3><small>${esc(order.customer_name)} / ${esc(order.phone)}</small></div><span class="status">${esc(order.status)}</span></div>
      <div class="meta"><div><span>SESSION ID</span><strong>${esc(order.session_id)}</strong></div><div><span>PAIRING CODE</span><strong>${esc(order.pairing_code || '-')}</strong></div><div><span>KEDALUWARSA</span><strong>${date(order.expires_at)}</strong></div><div><span>TERAKHIR UPDATE</span><strong>${date(order.updated_at)}</strong></div></div>
      <div class="actions">${['restart', 'stop', 'suspend', 'resume', 'pairing'].map((action) => `<button data-action="${action}" data-invoice="${esc(order.invoice)}">${action}</button>`).join('')}<button data-action="extend" data-invoice="${esc(order.invoice)}">Perpanjang</button><button class="danger" data-action="delete" data-invoice="${esc(order.invoice)}">Hapus Session</button></div>
    </article>`).join('') : '<div class="message">Belum ada pesanan sewa bot.</div>';

    list.querySelectorAll('[data-action]').forEach((button) => {
      button.onclick = async () => {
        let days;
        if (button.dataset.action === 'extend') days = Number(prompt('Tambah berapa hari?', 30) || 0);
        if (button.dataset.action === 'delete' && !confirm('Hapus session bot permanen?')) return;
        button.disabled = true;
        try {
          await api({ method: 'POST', body: JSON.stringify({ invoice: button.dataset.invoice, action: button.dataset.action, days }) });
          await load();
        } catch (error) { alert(error.message); }
        finally { button.disabled = false; }
      };
    });
  }

  function renderBackups(backups = []) {
    backupLastInfo.textContent = backups[0]
      ? `Backup terakhir ${date(backups[0].createdAt)} • ${size(backups[0].size)}`
      : 'Belum ada file backup';
    backupList.innerHTML = backups.length ? backups.map((backup) => `<article class="backup-item">
      <div><h4>${esc(backup.name)}</h4><small>${size(backup.size)} • ${date(backup.createdAt)}</small></div>
      <div class="backup-buttons"><button data-download="${esc(backup.name)}">Download ZIP</button><button class="delete-backup" data-delete-backup="${esc(backup.name)}">Hapus</button></div>
    </article>`).join('') : '<div class="backup-empty">Belum ada backup. Tekan “Buat Backup Sekarang”.</div>';

    backupList.querySelectorAll('[data-download]').forEach((button) => {
      button.onclick = async () => {
        button.disabled = true;
        const oldText = button.textContent;
        button.textContent = 'Membuat link...';
        try {
          const body = await backupApi(`?action=download-ticket&name=${encodeURIComponent(button.dataset.download)}`);
          if (!body.downloadUrl) throw new Error('Link download tidak tersedia.');

          // Buka sebagai navigasi browser biasa. File dikirim dengan Content-Disposition: attachment,
          // jadi Chrome/Android memakai download manager bawaan tanpa menampung ZIP di JavaScript.
          const popup = window.open(body.downloadUrl, '_blank', 'noopener,noreferrer');
          if (!popup) window.location.assign(body.downloadUrl);

          button.textContent = 'Cek Download';
          backupMessage.textContent = `Browser sedang membuka download ${button.dataset.download}. Cek notifikasi unduhan.`;
          setTimeout(() => {
            button.disabled = false;
            button.textContent = oldText;
          }, 1800);
          return;
        } catch (error) {
          alert(error.message);
          button.disabled = false;
          button.textContent = oldText;
        }
      };
    });

    backupList.querySelectorAll('[data-delete-backup]').forEach((button) => {
      button.onclick = async () => {
        if (!confirm(`Hapus backup ${button.dataset.deleteBackup}?`)) return;
        button.disabled = true;
        try {
          await backupApi(`?name=${encodeURIComponent(button.dataset.deleteBackup)}`, { method: 'DELETE' });
          await loadBackups();
        } catch (error) { alert(error.message); }
        finally { button.disabled = false; }
      };
    });
  }

  function setProgress(job) {
    const progress = Math.max(0, Math.min(100, Number(job?.progress || 0)));
    backupProgress.hidden = false;
    backupStage.textContent = job?.stage || 'Memproses backup...';
    backupPercent.textContent = `${progress}%`;
    backupBar.style.width = `${progress}%`;
  }

  async function pollBackup(jobId) {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const body = await backupApi(`?action=status&jobId=${encodeURIComponent(jobId)}`);
      const job = body.job || {};
      setProgress(job);
      if (job.status === 'completed') {
        backupMessage.textContent = `Backup berhasil dibuat: ${job.name} (${size(job.size)})`;
        await loadBackups();
        setTimeout(() => { backupProgress.hidden = true; }, 1800);
        return;
      }
      if (job.status === 'failed') throw new Error(job.error || 'Backup gagal dibuat.');
    }
    throw new Error('Proses backup terlalu lama. Cek kembali beberapa saat lagi.');
  }

  async function loadBackups() {
    try {
      const body = await backupApi();
      renderBackups(body.backups || []);
    } catch (error) {
      backupList.innerHTML = `<div class="backup-empty">${esc(error.message)}</div>`;
    }
  }

  async function createBackup() {
    if (!confirm('Buat ZIP seluruh file bot sekarang? Proses ini dapat memakai CPU server beberapa saat.')) return;
    createBackupButton.disabled = true;
    backupMessage.textContent = 'Memulai proses backup di Bot Controller...';
    setProgress({ progress: 2, stage: 'Mengirim perintah backup' });
    try {
      const body = await backupApi('', { method: 'POST', body: '{}' });
      const job = body.job;
      setProgress(job);
      await pollBackup(job.id);
    } catch (error) {
      backupMessage.textContent = error.message;
      alert(error.message);
    } finally {
      createBackupButton.disabled = false;
    }
  }

  async function load() {
    msg.textContent = 'Memuat data bot...';
    try {
      const body = await api();
      renderStats(body.stats, body.orders || []);
      render(body.orders || []);
      msg.textContent = '';
    } catch (error) { msg.textContent = error.message; }
  }

  document.querySelector('#refreshAdminBots').onclick = async () => { await Promise.all([load(), loadBackups()]); };
  createBackupButton.onclick = createBackup;
  await Promise.all([load(), loadBackups()]);
})();
