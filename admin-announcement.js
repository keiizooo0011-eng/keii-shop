(() => {
  const cfg = window.KIVOPAY_CONFIG || {};
  const db = window.supabase && cfg.supabaseUrl && cfg.supabaseAnonKey
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey)
    : null;
  const $ = s => document.querySelector(s);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const labels = {info:'INFORMASI', promo:'PROMO', maintenance:'MAINTENANCE', restock:'RESTOCK'};
  const icons = {info:'i', promo:'%', maintenance:'!', restock:'↻'};

  function value() {
    return {
      id: 'main',
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
  function render(data) {
    const root = $('#announcementPreview'); if (!root) return;
    root.innerHTML = `<article class="kivo-announcement-card type-${esc(data.type)}"><div class="kivo-announcement-icon">${icons[data.type] || 'i'}</div><div class="kivo-announcement-copy"><small>${labels[data.type] || 'INFORMASI'} KIVOPAY</small><h3>${esc(data.title || 'Judul pengumuman')}</h3><p>${esc(data.body || 'Isi pengumuman akan tampil di sini.')}</p>${data.button_text ? `<span class="kivo-announcement-button">${esc(data.button_text)} →</span>` : ''}</div><span class="kivo-announcement-state">${data.is_active ? 'Aktif' : 'Nonaktif'}</span></article>`;
  }
  function message(text, type='') { const el=$('#announcementAdminMessage'); if(el){el.textContent=text;el.className=`admin-message ${type}`;} }
  function fill(data={}) {
    $('#announcementTitle').value=data.title||''; $('#announcementBody').value=data.body||'';
    $('#announcementType').value=data.type||'info'; $('#announcementActive').value=String(data.is_active ?? true);
    $('#announcementButtonText').value=data.button_text||''; $('#announcementButtonUrl').value=data.button_url||'';
    $('#announcementExpiresAt').value=data.expires_at ? new Date(new Date(data.expires_at).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16) : '';
    render(value());
  }
  async function load() {
    if (!db) return message('Supabase belum dikonfigurasi.', 'error');
    message('Memuat pengumuman...');
    const {data,error}=await db.from('site_announcements').select('*').eq('id','main').maybeSingle();
    if(error){message(error.message,'error');return;} fill(data||{is_active:true,type:'info'}); message(data?'Pengumuman berhasil dimuat.':'Belum ada pengumuman. Silakan buat baru.','success');
  }
  $('#previewAnnouncement')?.addEventListener('click',()=>render(value()));
  $('#refreshAnnouncement')?.addEventListener('click',load);
  document.querySelector('[data-admin-page-btn="announcement"]')?.addEventListener('click',load);
  $('#announcementForm')?.addEventListener('submit',async e=>{
    e.preventDefault(); const payload=value();
    if(!payload.title||!payload.body)return message('Judul dan isi wajib diisi.','error');
    if(!db)return message('Supabase belum dikonfigurasi.','error');
    message('Menyimpan pengumuman...');
    const {error}=await db.from('site_announcements').upsert(payload,{onConflict:'id'});
    if(error)return message(error.message,'error'); render(payload); message('Pengumuman berhasil disimpan dan akan tampil di halaman Semua Produk.','success');
  });
})();
