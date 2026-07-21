(() => {
  const cfg = window.KIVOPAY_CONFIG || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const rupiah = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
  let methods = [], packages = [], selectedMethod = null, selectedPackage = null, paymentStopped = false;
  if (!document.querySelector('#robuxMethodList')) return;

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
      $('#robuxMethodList').innerHTML = `<div class="robux-empty">Database Robux belum siap.<br><small>${esc(e.message)}</small></div>`;
      $('#robuxServiceStatus').textContent = 'Database belum siap';
    }
  }

  function renderMethods() {
    $('#robuxMethodList').innerHTML = methods.length ? methods.map(m => `
      <button type="button" class="robux-method-card ${selectedMethod?.id===m.id?'active':''}" data-method="${m.id}">
        <span>${String(m.slug||'').includes('login')?'🔐':String(m.slug||'').includes('gamepass')?'🎟️':'💎'}</span>
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
    // Hanya metode Via Login yang boleh menampilkan data sensitif.
    // Gunakan slug sebagai sumber utama agar salah set form_type di panel admin tidak
    // membuat form username/gamepass ikut meminta password.
    const login = String(selectedMethod.slug || '').toLowerCase().includes('login');
    const passwordWrap = $('#robuxPasswordWrap');
    const backupWrap = $('#robuxBackupWrap');
    passwordWrap.hidden = !login;
    backupWrap.hidden = !login;
    passwordWrap.style.display = login ? '' : 'none';
    backupWrap.style.display = login ? '' : 'none';
    $('#robuxPassword').required = login;
    ['#robuxBackupCode1','#robuxBackupCode2','#robuxBackupCode3'].forEach(id => $(id).required = login);
    if (!login) {
      $('#robuxPassword').value = '';
      $('#robuxBackupCode1').value = '';
      $('#robuxBackupCode2').value = '';
      $('#robuxBackupCode3').value = '';
    }
    $('#robuxOrderForm').scrollIntoView({behavior:'smooth',block:'center'});
  }

  $('#robuxOrderForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!selectedMethod || !selectedPackage) return;
    const btn=$('#robuxContinueBtn');
    btn.disabled=true; btn.textContent='Membuat QRIS...';
    try {
      const response = await fetch('/api/create-robux-order', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          method_id:selectedMethod.id, package_id:selectedPackage.id,
          username:$('#robuxUsername').value.trim(), whatsapp:$('#robuxWhatsapp').value.trim(),
          password:$('#robuxPassword').value,
          backup_code_1:$('#robuxBackupCode1').value.trim(),
          backup_code_2:$('#robuxBackupCode2').value.trim(),
          backup_code_3:$('#robuxBackupCode3').value.trim()
        })
      });
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||'Gagal membuat pembayaran.');
      const invoice=data.order.invoice;
      localStorage.setItem('kivopay_last_robux_invoice', invoice);
      const invoices=JSON.parse(localStorage.getItem('kivopay_robux_invoices')||'[]');
      localStorage.setItem('kivopay_robux_invoices',JSON.stringify([invoice,...invoices.filter(x=>x!==invoice)].slice(0,30)));
      sessionStorage.setItem('kivopay_robux_payment_'+invoice,JSON.stringify(data));
      location.href='payment-robux.html?invoice='+encodeURIComponent(invoice);
    } catch(err) { alert(err.message); }
    finally { btn.disabled=false; btn.textContent='Lanjut ke Pembayaran'; }
  });

  const oldLookup=$('#orderLookupBtn');
  oldLookup?.addEventListener('click', async e=>{
    const invoice=$('#orderLookup')?.value.trim();
    if(!invoice?.toUpperCase().startsWith('RBX-')) return;
    e.stopImmediatePropagation();
    const root=$('#orderLookupResult'); root.innerHTML='<p>Memuat pesanan Robux...</p>';
    try{
      const r=await fetch('/api/check-robux-payment?invoice='+encodeURIComponent(invoice),{cache:'no-store'}),d=await r.json();
      if(!r.ok) throw new Error(d.error||'Pesanan tidak ditemukan.');
      const o=d.order,labels={pending:'Menunggu Pembayaran',paid:'Sudah Dibayar',processing:'Diproses',completed:'Selesai',cancelled:'Dibatalkan',failed:'Gagal'};
      root.innerHTML=`<article class="robux-history-card"><div><span class="robux-history-status ${esc(o.status)}">${labels[o.status]||o.status}</span><h3>${esc(o.invoice)}</h3><small>${new Date(o.created_at).toLocaleString('id-ID')}</small></div><dl><dt>Username Roblox</dt><dd>${esc(o.username)}</dd><dt>Metode</dt><dd>${esc(o.method_name)}</dd><dt>Paket</dt><dd>${esc(o.package_label)}</dd><dt>Total</dt><dd>${rupiah(o.payment_amount)}</dd></dl>${o.admin_note?`<p class="robux-admin-note">Catatan admin: ${esc(o.admin_note)}</p>`:''}</article>`;
    }catch(err){root.innerHTML=`<p class="error">${esc(err.message)}</p>`;}
  },true);

  load();
})();
