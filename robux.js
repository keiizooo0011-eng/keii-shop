(() => {
  const cfg = window.KIVOPAY_CONFIG || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const rupiah = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
  let methods = [], packages = [], selectedMethod = null, selectedPackage = null, paymentStopped = false;

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
    ['#robuxBackupCode1','#robuxBackupCode2','#robuxBackupCode3'].forEach(id => $(id).required = login);
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
      localStorage.setItem('kivopay_last_robux_invoice', data.order.invoice);
      showPayment(data);
    } catch(err) { alert(err.message); }
    finally { btn.disabled=false; btn.textContent='Lanjut ke Pembayaran'; }
  });

  function ensureModal(){
    let modal=$('#robuxPaymentModal');
    if(modal) return modal;
    modal=document.createElement('div'); modal.id='robuxPaymentModal'; modal.className='robux-payment-modal';
    modal.innerHTML='<div class="robux-payment-card" id="robuxPaymentCard"></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{if(e.target===modal){paymentStopped=true;modal.classList.remove('open')}});
    return modal;
  }

  function showPayment(data){
    paymentStopped=false;
    const modal=ensureModal(), card=modal.querySelector('#robuxPaymentCard'), o=data.order;
    card.innerHTML=`
      <button class="robux-payment-close" type="button">×</button>
      <span class="eyebrow">PEMBAYARAN TOP UP ROBUX</span><h2>Scan QRIS</h2>
      <p>Bayar sesuai nominal agar pembayaran dapat terdeteksi otomatis.</p>
      <div class="robux-pay-detail"><span>Invoice</span><strong>${esc(o.invoice)}</strong><span>Metode</span><strong>${esc(o.method_name)}</strong><span>Paket</span><strong>${esc(o.package_label)}</strong><span>Username</span><strong>${esc(o.username)}</strong></div>
      <div id="robuxQrisBox" class="qris-box"></div>
      <div class="payment-total"><span>Total pembayaran</span><strong>${rupiah(o.payment_amount)}</strong></div>
      <div id="robuxPaymentStatus" class="payment-status pending">Menunggu pembayaran...</div>
      <div class="payment-actions"><button id="copyRobuxInvoice">Salin Invoice</button><button id="downloadRobuxQris">Download QRIS</button></div>
      <small>Simpan invoice untuk mengecek status pesanan.</small>`;
    modal.classList.add('open');
    card.querySelector('.robux-payment-close').onclick=()=>{paymentStopped=true;modal.classList.remove('open')};
    card.querySelector('#copyRobuxInvoice').onclick=async()=>{await navigator.clipboard.writeText(o.invoice);card.querySelector('#copyRobuxInvoice').textContent='Tersalin ✓'};
    const qbox=card.querySelector('#robuxQrisBox');
    if(data.qr_image) qbox.innerHTML=`<img src="${esc(data.qr_image)}" crossorigin="anonymous" alt="QRIS pembayaran">`;
    else if(data.qr_content && window.QRCode) new QRCode(qbox,{text:data.qr_content,width:230,height:230});
    else qbox.innerHTML='<p>QRIS tidak dapat ditampilkan. Hubungi admin.</p>';
    card.querySelector('#downloadRobuxQris').onclick=()=>downloadQris(qbox,o.invoice);
    pollPayment(o.invoice,card);
  }

  async function downloadQris(box,invoice){
    const image=box.querySelector('img'),canvas=box.querySelector('canvas'); let href='';
    if(canvas) href=canvas.toDataURL('image/png'); else if(image) href=image.src;
    if(!href) return alert('QRIS belum tersedia.');
    const a=document.createElement('a');a.href=href;a.download=`QRIS-${invoice}.png`;a.target='_blank';document.body.appendChild(a);a.click();a.remove();
  }

  async function pollPayment(invoice,card){
    if(paymentStopped||!document.body.contains(card)) return;
    try{
      const r=await fetch('/api/check-robux-payment?invoice='+encodeURIComponent(invoice),{cache:'no-store'}); const d=await r.json();
      if(!r.ok) throw new Error(d.error||'Gagal cek pembayaran.');
      const s=card.querySelector('#robuxPaymentStatus'); if(!s)return;
      s.className='payment-status '+d.order.status;
      const labels={pending:'Menunggu pembayaran...',paid:'Pembayaran berhasil • Menunggu diproses admin',processing:'Pesanan sedang diproses admin',completed:'Pesanan selesai',cancelled:'Pembayaran kedaluwarsa / dibatalkan',failed:'Pesanan gagal'};
      s.textContent=labels[d.order.status]||d.order.status;
      if(['paid','processing','completed','cancelled','failed'].includes(d.order.status)) return;
    }catch(e){const s=card.querySelector('#robuxPaymentStatus');if(s)s.textContent='Mengecek ulang pembayaran...';}
    setTimeout(()=>pollPayment(invoice,card),5000);
  }

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
