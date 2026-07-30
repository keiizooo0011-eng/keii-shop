(() => {
  const cfg = window.KIVOPAY_CONFIG || {};
  const db = window.supabase && cfg.supabaseUrl && cfg.supabaseAnonKey
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey)
    : null;
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const labels = { info:'INFORMASI', promo:'PROMO', maintenance:'MAINTENANCE', restock:'RESTOCK' };
  const icons = { info:'i', promo:'%', maintenance:'!', restock:'↻' };
  let rows = [];

  function formValue() {
    const existingId = $('#announcementId')?.value.trim();
    return {
      id: existingId || `notice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: $('#announcementTitle')?.value.trim() || '',
      body: $('#announcementBody')?.value.trim() || '',
      type: $('#announcementType')?.value || 'info',
      is_active: $('#announcementActive')?.value === 'true',
      button_text: $('#announcementButtonText')?.value.trim() || null,
      button_url: $('#announcementButtonUrl')?.value.trim() || null,
      expires_at: $('#announcementExpiresAt')?.value ? new Date($('#announcementExpiresAt').value).toISOString() : null,
      updated_at: new Date().toISOString()
    };
  }

  function preview(data) {
    const root = $('#announcementPreview');
    if (!root) return;
    root.innerHTML = `<article class="kivo-announcement-card type-${esc(data.type)}"><div class="kivo-announcement-icon">${icons[data.type] || 'i'}</div><div class="kivo-announcement-copy"><small>${labels[data.type] || 'INFORMASI'} KIVOPAY</small><h3>${esc(data.title || 'Judul pengumuman')}</h3><p>${esc(data.body || 'Isi pengumuman akan tampil di sini.')}</p>${data.button_text ? `<span class="kivo-announcement-button">${esc(data.button_text)} →</span>` : ''}</div><span class="kivo-announcement-state">${data.is_active ? 'Aktif' : 'Nonaktif'}</span></article>`;
  }

  function message(text, type = '') {
    const el = $('#announcementAdminMessage');
    if (el) {
      el.textContent = text;
      el.className = `admin-message ${type}`;
    }
  }

  function resetForm() {
    $('#announcementId').value = '';
    $('#announcementTitle').value = '';
    $('#announcementBody').value = '';
    $('#announcementType').value = 'info';
    $('#announcementActive').value = 'true';
    $('#announcementButtonText').value = '';
    $('#announcementButtonUrl').value = '';
    $('#announcementExpiresAt').value = '';
    $('#announcementFormTitle').textContent = 'Tambah slide pengumuman';
    preview(formValue());
    message('Form siap untuk pengumuman baru.');
  }

  function fill(data = {}) {
    $('#announcementId').value = data.id || '';
    $('#announcementTitle').value = data.title || '';
    $('#announcementBody').value = data.body || '';
    $('#announcementType').value = data.type || 'info';
    $('#announcementActive').value = String(data.is_active ?? true);
    $('#announcementButtonText').value = data.button_text || '';
    $('#announcementButtonUrl').value = data.button_url || '';
    $('#announcementExpiresAt').value = data.expires_at
      ? new Date(new Date(data.expires_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
      : '';
    $('#announcementFormTitle').textContent = 'Edit slide pengumuman';
    preview(formValue());
    $('#announcementForm')?.scrollIntoView({ behavior:'smooth', block:'start' });
  }

  function renderList() {
    const root = $('#announcementAdminList');
    const count = $('#announcementCount');
    if (count) count.textContent = `${rows.length} pengumuman`;
    if (!root) return;
    if (!rows.length) {
      root.innerHTML = '<div class="announcement-empty"><b>Belum ada slide</b><span>Tekan “Pengumuman Baru”, isi formulir, lalu simpan.</span></div>';
      return;
    }
    root.innerHTML = rows.map((item, index) => {
      const expired = item.expires_at && new Date(item.expires_at).getTime() <= Date.now();
      const status = expired ? 'Kedaluwarsa' : item.is_active ? 'Aktif' : 'Nonaktif';
      return `<article class="announcement-list-item" data-id="${esc(item.id)}">
        <div class="announcement-list-number">${index + 1}</div>
        <div class="announcement-list-copy"><small>${labels[item.type] || 'INFORMASI'}</small><b>${esc(item.title)}</b><span>${esc(item.body)}</span><em class="${status === 'Aktif' ? 'active' : ''}">${status}</em></div>
        <div class="announcement-list-actions"><button type="button" data-action="edit">Edit</button><button type="button" data-action="toggle">${item.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button><button class="danger" type="button" data-action="delete">Hapus</button></div>
      </article>`;
    }).join('');
  }

  async function load() {
    if (!db) return message('Supabase belum dikonfigurasi.', 'error');
    message('Memuat daftar pengumuman...');
    const { data, error } = await db.from('site_announcements').select('*').order('updated_at', { ascending:true });
    if (error) return message(error.message, 'error');
    rows = data || [];
    renderList();
    message(rows.length ? 'Daftar pengumuman berhasil dimuat.' : 'Belum ada pengumuman. Silakan buat baru.', 'success');
  }

  $('#previewAnnouncement')?.addEventListener('click', () => preview(formValue()));
  $('#refreshAnnouncement')?.addEventListener('click', load);
  $('#newAnnouncement')?.addEventListener('click', resetForm);
  document.querySelector('[data-admin-page-btn="announcement"]')?.addEventListener('click', load);

  $('#announcementAdminList')?.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]');
    const itemEl = event.target.closest('[data-id]');
    if (!button || !itemEl || !db) return;
    const item = rows.find(row => String(row.id) === String(itemEl.dataset.id));
    if (!item) return;
    if (button.dataset.action === 'edit') return fill(item);
    if (button.dataset.action === 'toggle') {
      button.disabled = true;
      const { error } = await db.from('site_announcements').update({ is_active:!item.is_active, updated_at:new Date().toISOString() }).eq('id', item.id);
      if (error) message(error.message, 'error'); else await load();
      return;
    }
    if (button.dataset.action === 'delete') {
      if (!confirm(`Hapus pengumuman “${item.title}”?`)) return;
      button.disabled = true;
      const { error } = await db.from('site_announcements').delete().eq('id', item.id);
      if (error) message(error.message, 'error'); else {
        if ($('#announcementId').value === String(item.id)) resetForm();
        await load();
      }
    }
  });

  $('#announcementForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const payload = formValue();
    if (!payload.title || !payload.body) return message('Judul dan isi wajib diisi.', 'error');
    if (!db) return message('Supabase belum dikonfigurasi.', 'error');
    message('Menyimpan slide pengumuman...');
    const { error } = await db.from('site_announcements').upsert(payload, { onConflict:'id' });
    if (error) return message(error.message, 'error');
    $('#announcementId').value = payload.id;
    $('#announcementFormTitle').textContent = 'Edit slide pengumuman';
    preview(payload);
    await load();
    message('Slide berhasil disimpan dan akan tampil di halaman Semua Produk.', 'success');
  });
})();
