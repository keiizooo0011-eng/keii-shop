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
    return `<section class="delivery-receipt payment-delivery-result">
      <div class="delivery-success-icon">✓</div>
      <div class="delivery-receipt-head"><span>PESANAN BERHASIL</span><h3>Data produk sudah dikirim otomatis</h3><p>Simpan data berikut di tempat yang aman.</p></div>
      <div class="delivery-fields">${fields.map((f,i)=>`<div class="delivery-field"><div><span>${esc(f.label)}</span><strong class="delivery-value">${esc(f.value)}</strong></div><button type="button" data-copy="${i}">Salin</button></div>`).join('')}</div>
      <div class="delivery-receipt-actions"><button type="button" id="copyAllDelivery">Salin Semua</button><a class="secondary-btn" href="index.html#orders">Cek Pesanan</a></div>
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
  function downloadQr(box){
    const image=box.querySelector('img'),canvas=box.querySelector('canvas');
    const href=canvas?canvas.toDataURL('image/png'):image?.src;
    if(!href)return alert('QRIS belum tersedia.');
    const a=document.createElement('a');a.href=href;a.download=`QRIS-${invoice}.png`;a.target='_blank';document.body.appendChild(a);a.click();a.remove();
  }
  function render(o){
    const cached=cachedPayment();
    root.innerHTML=`<section class="flow-card payment-flow-card">
      <div class="flow-card-head"><div><span class="eyebrow">PEMBAYARAN KIVOPAY</span><h1>Scan QRIS</h1><p>Bayar tepat sesuai nominal agar pesanan terdeteksi otomatis.</p></div><span id="orderStatusBadge" class="flow-status ${esc(o.status)}">${esc(labels[o.status]||o.status)}</span></div>
      <div class="payment-flow-grid">
        <div class="payment-qris-panel"><div id="paymentOrderQris" class="qris-box large"></div><button id="downloadOrderQris" class="secondary-btn full">Download QRIS</button></div>
        <div class="payment-info-panel"><dl class="flow-detail-list">
          <dt>Invoice</dt><dd>${esc(o.invoice)} <button id="copyOrderInvoice" class="copy-mini">Salin</button></dd>
          <dt>Produk</dt><dd>${esc(o.product_name)}</dd><dt>Paket</dt><dd>${esc(o.variant_name||'Paket utama')}</dd>
          <dt>Total</dt><dd class="payment-grand-total">${rupiah(o.payment_amount)}</dd></dl>
          <div id="paymentOrderStatus" class="payment-live-status ${esc(o.status)}">${esc(labels[o.status]||o.status)}</div>
          <p class="payment-expire">Batas pembayaran: <strong>${o.expires_at?new Date(o.expires_at).toLocaleString('id-ID'):'-'}</strong></p>
          <a class="secondary-btn full" href="index.html#store">Kembali ke Katalog</a>
        </div>
      </div><div id="deliveryResult"></div></section>`;
    const qbox=document.querySelector('#paymentOrderQris'); drawQr(qbox,o,cached);
    document.querySelector('#copyOrderInvoice').onclick=async()=>{await navigator.clipboard.writeText(o.invoice);document.querySelector('#copyOrderInvoice').textContent='Tersalin ✓';};
    document.querySelector('#downloadOrderQris').onclick=()=>downloadQr(qbox);
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
      if(o.status==='completed'){showDelivery(o);return;}
      if(['cancelled','failed'].includes(o.status)){stopped=true;return;}
    }catch(e){const st=document.querySelector('#paymentOrderStatus');if(st)st.textContent='Mengecek ulang pembayaran...';}
    setTimeout(poll,4000);
  }
  async function init(){
    if(!invoice){root.innerHTML='<div class="flow-error">Invoice tidak ditemukan.<br><a href="index.html#store">Kembali ke Katalog</a></div>';return;}
    try{const o=await getOrder();render(o);if(!['completed','cancelled','failed'].includes(o.status))poll();}
    catch(e){root.innerHTML=`<div class="flow-error">${esc(e.message)}<br><a href="index.html#store">Kembali</a></div>`;}
  }
  addEventListener('beforeunload',()=>{stopped=true;});
  init();
})();
