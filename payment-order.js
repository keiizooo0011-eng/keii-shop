(() => {
  const root = document.querySelector('#paymentOrderApp');
  if (!root) return;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const rupiah = (n) => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
  const labels = {pending:'Menunggu Pembayaran',processing:'Pembayaran Masuk',completed:'Pesanan Selesai',cancelled:'Dibatalkan',failed:'Gagal'};
  const invoice = new URLSearchParams(location.search).get('invoice') || localStorage.getItem('kivopay_last_order_invoice') || '';
  let stopped = false;

  function parseDelivery(content) {
    return String(content || '').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map((line,i)=>{
      const m=line.match(/^([^:=|]{1,40})\s*[:=|]\s*(.+)$/);
      return m ? {label:m[1].trim(),value:m[2].trim()} : {label:`Data ${i+1}`,value:line};
    });
  }
  async function getOrder(){
    const r=await fetch('/api/check-payment?invoice='+encodeURIComponent(invoice),{cache:'no-store'});
    const raw=await r.text(); let d={};
    try{d=raw?JSON.parse(raw):{};}catch{throw new Error('Respons server pembayaran tidak valid.');}
    if(!r.ok) throw new Error(d.error||'Pesanan tidak ditemukan.');
    return d.order;
  }
  function cachedPayment(){
    try{return JSON.parse(sessionStorage.getItem('kivopay_payment_'+invoice)||'null');}catch{return null;}
  }
  function deliveryMarkup(o){
    const fields=parseDelivery(o.delivery_content);
    const completedAt=o.completed_at||o.updated_at||o.created_at;
    const completedText=completedAt?new Date(completedAt).toLocaleString('id-ID',{
      day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'
    }):'-';
    const total=o.payment_amount??o.amount??0;

    return `<section class="delivery-receipt delivery-receipt-premium payment-delivery-result">
      <div class="delivery-completed-top">
        <div class="delivery-success-icon">✓</div>
        <div class="delivery-receipt-head">
          <span>PESANAN BERHASIL</span>
          <h3>Produk berhasil dikirim</h3>
          <p>Pembayaran terverifikasi dan detail produk tersedia di bawah ini.</p>
        </div>
        <div class="delivery-completed-status">COMPLETED</div>
      </div>

      <div class="delivery-order-meta delivery-order-meta-premium">
        <div><span>Nomor invoice</span><strong>${esc(o.invoice||'-')}</strong></div>
        <div><span>Waktu selesai</span><strong>${esc(completedText)}</strong></div>
        <div><span>Produk</span><strong>${esc(o.product_name||'Produk Digital')}</strong></div>
        <div><span>Paket</span><strong>${esc(o.variant_name||'Paket utama')}</strong></div>
        <div class="delivery-total"><span>Total pembayaran</span><strong>${rupiah(total)}</strong></div>
        <div><span>Status pengiriman</span><strong>Terkirim otomatis</strong></div>
      </div>

      <div class="delivery-data-title">
        <div><span>DETAIL PRODUK</span><strong>Data yang kamu terima</strong></div>
        <span>${fields.length} informasi</span>
      </div>

      <div class="delivery-fields">
        ${fields.length?fields.map((f,i)=>`<div class="delivery-field"><div><span>${esc(f.label)}</span><strong class="delivery-value">${esc(f.value)}</strong></div><button type="button" data-copy="${i}">Salin</button></div>`).join(''):`<div class="delivery-empty-information">Produk berhasil diproses, tetapi tidak ada data tambahan yang perlu ditampilkan.</div>`}
      </div>

      <div class="delivery-security-note"><b>!</b><span>Simpan data ini di tempat aman dan jangan membagikannya kepada siapa pun.</span></div>

      <div class="delivery-receipt-actions">
        <button type="button" id="copyAllDelivery">Salin Semua</button>
        <a class="secondary-btn" href="index.html#orders">Cek Pesanan</a>
      </div>
    </section>`;
  }
  function bindDelivery(o){
    const fields=parseDelivery(o.delivery_content);
    document.querySelectorAll('[data-copy]').forEach(btn=>btn.onclick=async()=>{await navigator.clipboard.writeText(fields[Number(btn.dataset.copy)]?.value||'');btn.textContent='Tersalin ✓';});
    document.querySelector('#copyAllDelivery')?.addEventListener('click',async e=>{await navigator.clipboard.writeText(String(o.delivery_content||''));e.currentTarget.textContent='Tersalin ✓';});
  }
  function drawQr(box,o,cached){
    const image=o.qr_image||cached?.qr_image;
    const content=o.qr_content||cached?.qr_content;
    if(image) box.innerHTML=`<img src="${esc(image)}" crossorigin="anonymous" alt="QRIS pembayaran">`;
    else if(content&&window.QRCode) new QRCode(box,{text:content,width:260,height:260});
    else box.innerHTML='<p>QRIS belum tersedia. Muat ulang halaman atau buat pesanan kembali.</p>';
  }

  function openQrisModal({image,content,total,invoice}){
    document.querySelector('#kivoQrisModal')?.remove();
    const modal=document.createElement('div');
    modal.id='kivoQrisModal';
    modal.className='qris-modal';
    modal.innerHTML=`<div class="qris-modal-backdrop" data-close-qris></div>
      <section class="qris-modal-card" role="dialog" aria-modal="true" aria-labelledby="qrisModalTitle">
        <header class="qris-modal-head"><div><span>PEMBAYARAN AMAN</span><h2 id="qrisModalTitle">QRIS Pembayaran</h2></div><button type="button" class="qris-modal-close" data-close-qris aria-label="Tutup">×</button></header>
        <div class="qris-modal-body">
          <p class="qris-modal-lead">Scan kode berikut menggunakan aplikasi bank atau e-wallet yang mendukung QRIS.</p>
          <div id="qrisModalCode" class="qris-modal-code"></div>
          <div class="qris-modal-tools"><button type="button" id="zoomQrisBtn">Perbesar</button><button type="button" id="downloadModalQris">Download QRIS</button></div>
          <div class="qris-modal-total"><span>Total pembayaran</span><strong>${rupiah(total)}</strong><small>Bayar tepat sesuai nominal agar transaksi terverifikasi otomatis.</small></div>
          <div class="qris-modal-info"><strong>Petunjuk pembayaran</strong><ul><li>Buka aplikasi bank atau e-wallet pilihanmu.</li><li>Pilih menu Scan QRIS, lalu pindai kode di atas.</li><li>Jangan mengubah nominal pembayaran.</li><li>Simpan invoice <b>${esc(invoice)}</b> sebagai bukti transaksi.</li></ul></div>
        </div>
        <footer class="qris-modal-foot"><button type="button" data-close-qris>Tutup</button></footer>
      </section>`;
    document.body.appendChild(modal);
    const box=modal.querySelector('#qrisModalCode');
    if(image) box.innerHTML=`<img src="${esc(image)}" crossorigin="anonymous" alt="QRIS pembayaran">`;
    else if(content&&window.QRCode) new QRCode(box,{text:content,width:300,height:300});
    else box.innerHTML='<p>QRIS belum tersedia. Silakan muat ulang halaman.</p>';
    const close=()=>{modal.classList.add('closing');setTimeout(()=>modal.remove(),180)};
    modal.querySelectorAll('[data-close-qris]').forEach(el=>el.addEventListener('click',close));
    modal.querySelector('#zoomQrisBtn')?.addEventListener('click',e=>{box.classList.toggle('zoomed');e.currentTarget.textContent=box.classList.contains('zoomed')?'Ukuran Normal':'Perbesar';});
    modal.querySelector('#downloadModalQris')?.addEventListener('click',()=>downloadQr(box));
    const onKey=e=>{if(e.key==='Escape'){document.removeEventListener('keydown',onKey);close();}};
    document.addEventListener('keydown',onKey);
    requestAnimationFrame(()=>modal.classList.add('show'));
  }

  function downloadQr(box){
    const image=box.querySelector('img'),canvas=box.querySelector('canvas');
    const href=canvas?canvas.toDataURL('image/png'):image?.src;
    if(!href)return alert('QRIS belum tersedia.');
    const a=document.createElement('a');a.href=href;a.download=`QRIS-${invoice}.png`;a.target='_blank';document.body.appendChild(a);a.click();a.remove();
  }
  function render(o){
    const cached=cachedPayment();
    root.innerHTML=`<section class="flow-card payment-flow-card">
      <div class="flow-card-head"><div><span class="eyebrow">PEMBAYARAN KIVOPAY</span><h1>Selesaikan pembayaran</h1><p>Periksa detail pesanan, lalu tampilkan QRIS saat kamu siap membayar.</p></div><span id="orderStatusBadge" class="flow-status ${esc(o.status)}">${esc(labels[o.status]||o.status)}</span></div>
      <div class="payment-flow-grid">
        <div class="payment-qris-panel qris-reveal-panel"><div class="qris-reveal-icon" aria-hidden="true">▦</div><span class="qris-reveal-kicker">METODE PEMBAYARAN</span><h2>Bayar dengan QRIS</h2><p>Tampilkan kode saat kamu siap membayar. QRIS dapat dipindai melalui aplikasi bank dan e-wallet yang mendukung.</p><button id="showOrderQris" class="primary-btn full qris-open-btn"><span class="qris-open-btn-icon">▦</span><span><b>Tampilkan QRIS</b><small>Buka kode pembayaran</small></span><i>→</i></button><small>Kode QR ditampilkan utuh dan tidak bergerak agar mudah dipindai.</small></div>
        <div class="payment-info-panel"><div class="payment-summary-head"><span>RINGKASAN PESANAN</span><h3>Detail pembayaran</h3><p>Pastikan produk dan nominal sudah sesuai sebelum membayar.</p></div><dl class="flow-detail-list payment-detail-list">
          <div class="payment-detail-row invoice-row"><dt>Nomor invoice</dt><dd><span class="invoice-value">${esc(o.invoice)}</span><button id="copyOrderInvoice" class="copy-mini">Salin</button></dd></div>
          <div class="payment-detail-row"><dt>Produk</dt><dd>${esc(o.product_name)}</dd></div><div class="payment-detail-row"><dt>Paket</dt><dd>${esc(o.variant_name||'Paket utama')}</dd></div>
          <div class="payment-detail-row total-row"><dt>Total pembayaran</dt><dd class="payment-grand-total">${rupiah(o.payment_amount)}</dd></div></dl>
          <div id="paymentOrderStatus" class="payment-live-status ${esc(o.status)}">${esc(labels[o.status]||o.status)}</div>
          <p class="payment-expire">Batas pembayaran: <strong>${o.expires_at?new Date(o.expires_at).toLocaleString('id-ID'):'-'}</strong></p>
          <a class="secondary-btn full" href="index.html#store">Kembali ke Katalog</a>
        </div>
      </div><div id="deliveryResult"></div></section>`;
    const qrImage=o.qr_image||cached?.qr_image; const qrContent=o.qr_content||cached?.qr_content;
    document.querySelector('#copyOrderInvoice').onclick=async()=>{await navigator.clipboard.writeText(o.invoice);document.querySelector('#copyOrderInvoice').textContent='Tersalin ✓';};
    document.querySelector('#showOrderQris').onclick=()=>openQrisModal({image:qrImage,content:qrContent,total:o.payment_amount,invoice:o.invoice});
    if(o.status==='completed') showDelivery(o);
  }
  function showDelivery(o){
    stopped=true;
    const box=document.querySelector('#deliveryResult');
    if(box&&!box.children.length){box.innerHTML=deliveryMarkup(o);bindDelivery(o);}
    const st=document.querySelector('#paymentOrderStatus'); if(st){st.className='payment-live-status completed';st.textContent='Pembayaran berhasil • Data produk terkirim otomatis';}
    const badge=document.querySelector('#orderStatusBadge');if(badge){badge.className='flow-status completed';badge.textContent='Pesanan Selesai';}
  }
  async function poll(){
    if(stopped)return;
    try{
      const o=await getOrder();
      const st=document.querySelector('#paymentOrderStatus');if(st){st.className='payment-live-status '+o.status;st.textContent=labels[o.status]||o.status;}
      const badge=document.querySelector('#orderStatusBadge');if(badge){badge.className='flow-status '+o.status;badge.textContent=labels[o.status]||o.status;}
      if(o.order_type==='panel-pterodactyl' && ['paid','processing','completed'].includes(o.status)){ stopped=true; localStorage.setItem('kivopay_last_panel_invoice',o.invoice); setTimeout(()=>location.href='riwayat-panel.html?invoice='+encodeURIComponent(o.invoice),900); return;}
      if(o.status==='completed'){showDelivery(o);return;}
      if(['cancelled','failed'].includes(o.status)){stopped=true;return;}
    }catch(e){const st=document.querySelector('#paymentOrderStatus');if(st)st.textContent='Mengecek ulang pembayaran...';}
    setTimeout(poll,4000);
  }
  async function init(){
    if(!invoice){root.innerHTML='<div class="flow-error">Invoice tidak ditemukan.<br><a href="index.html#store">Kembali ke Katalog</a></div>';return;}
    try{const o=await getOrder(); if(o.order_type==='panel-pterodactyl' && ['paid','processing','completed'].includes(o.status)){location.replace('riwayat-panel.html?invoice='+encodeURIComponent(o.invoice));return;} render(o);if(!['completed','cancelled','failed'].includes(o.status))poll();}
    catch(e){root.innerHTML=`<div class="flow-error">${esc(e.message)}<br><a href="index.html#store">Kembali</a></div>`;}
  }
  addEventListener('beforeunload',()=>{stopped=true;});
  init();
})();
