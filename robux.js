(() => {
  const cfg = window.KIVOPAY_CONFIG || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const rupiah = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
  let methods = [], packages = [], selectedMethod = null, selectedPackage = null;

  async function load() {
    try {
      const [{data:m,error:me},{data:p,error:pe}] = await Promise.all([
        sb.from('robux_methods').select('*').eq('is_active',true).order('sort_order'),
        sb.from('robux_packages').select('*').eq('is_active',true).order('sort_order')
      ]);
      if (me) throw me; if (pe) throw pe;
      methods = m || []; packages = p || [];
      $('#robuxServiceStatus').textContent = methods.length ? '● Layanan tersedia' : '● Layanan ditutup';
      $('#robuxServiceStatus').classList.toggle('is-open', !!methods.length);
      $('#robuxClosedNotice').hidden = !!methods.length;
      renderMethods();
      if (methods[0]) selectMethod(methods[0].id);
    } catch (e) {
      $('#robuxMethodList').innerHTML = `<div class="robux-empty">Jalankan SQL Tahap 1 terlebih dahulu.<br><small>${esc(e.message)}</small></div>`;
      $('#robuxServiceStatus').textContent = 'Database belum siap';
    }
  }

  function renderMethods() {
    $('#robuxMethodList').innerHTML = methods.length ? methods.map(m => `
      <button type="button" class="robux-method-card ${selectedMethod?.id===m.id?'active':''}" data-method="${m.id}">
        <span>${m.form_type==='login'?'🔐':m.slug.includes('gamepass')?'🎟️':'💎'}</span>
        <div><strong>${esc(m.name)}</strong><small>${esc(m.description)}</small></div><b>→</b>
      </button>`).join('') : '<div class="robux-empty">Belum ada metode aktif.</div>';
    document.querySelectorAll('[data-method]').forEach(b => b.onclick = () => selectMethod(b.dataset.method));
  }

  function selectMethod(id) {
    selectedMethod = methods.find(x => String(x.id)===String(id));
    selectedPackage = null;
    renderMethods();
    $('#robuxMethodHelp').textContent = selectedMethod?.description || '';
    const list = packages.filter(x => String(x.method_id)===String(id));
    $('#robuxPackageList').innerHTML = list.length ? list.map(p => `
      <button type="button" class="robux-package-card" data-package="${p.id}">
        <span>${Number(p.robux_amount).toLocaleString('id-ID')} R$</span>
        <strong>${rupiah(p.price)}</strong>
        <small>${esc(p.eta || 'Proses sesuai antrean')}</small>
      </button>`).join('') : '<div class="robux-empty">Belum ada paket aktif untuk metode ini.</div>';
    document.querySelectorAll('[data-package]').forEach(b => b.onclick = () => choosePackage(b.dataset.package));
    $('#robuxOrderForm').hidden = true;
  }

  function choosePackage(id) {
    selectedPackage = packages.find(x => String(x.id)===String(id));
    document.querySelectorAll('[data-package]').forEach(b => b.classList.toggle('active', String(b.dataset.package)===String(id)));
    $('#robuxOrderForm').hidden = false;
    $('#robuxMethodId').value = selectedMethod.id;
    $('#robuxPackageId').value = selectedPackage.id;
    $('#robuxSelectedPrice').textContent = rupiah(selectedPackage.price);
    $('#robuxSummaryText').textContent = `${selectedMethod.name} • ${selectedPackage.label}`;
    const login = selectedMethod.form_type === 'login';
    $('#robuxPasswordWrap').hidden = !login;
    $('#robuxBackupWrap').hidden = !login;
    $('#robuxPassword').required = login;
    $('#robuxOrderForm').scrollIntoView({behavior:'smooth',block:'center'});
  }

  $('#robuxOrderForm')?.addEventListener('submit', e => {
    e.preventDefault();
    if (!selectedMethod || !selectedPackage) return;
    const draft = {
      method_id:selectedMethod.id, package_id:selectedPackage.id,
      username:$('#robuxUsername').value.trim(), whatsapp:$('#robuxWhatsapp').value.trim(),
      note:$('#robuxNote').value.trim(), created_at:new Date().toISOString()
    };
    localStorage.setItem('kivopay_robux_draft', JSON.stringify(draft));
    const btn=$('#robuxContinueBtn'); btn.textContent='Data tersimpan ✓';
    alert('Data Top Up Robux sudah siap. Pada Tahap 2 tombol ini akan langsung membuka pembayaran QRIS KivoPay.');
    setTimeout(()=>btn.textContent='Lanjut ke Pembayaran',1800);
  });

  load();
})();
