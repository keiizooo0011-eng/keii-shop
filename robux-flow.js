(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const rupiah = (n) => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
  const statusLabels = {pending:'Menunggu Pembayaran',paid:'Pembayaran Berhasil',processing:'Sedang Diproses',completed:'Selesai',cancelled:'Dibatalkan',failed:'Gagal'};
  const terminal = ['paid','processing','completed','cancelled','failed'];

  function rememberInvoice(invoice) {
    if (!invoice) return;
    localStorage.setItem('kivopay_last_robux_invoice', invoice);
    const list = JSON.parse(localStorage.getItem('kivopay_robux_invoices') || '[]');
    const next = [invoice, ...list.filter((x) => x !== invoice)].slice(0, 30);
    localStorage.setItem('kivopay_robux_invoices', JSON.stringify(next));
  }

  async function getOrder(invoice) {
    const r = await fetch('/api/check-robux-payment?invoice=' + encodeURIComponent(invoice), {cache:'no-store'});
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Pesanan tidak ditemukan.');
    return d.order;
  }

  function getInvoice() {
    return new URLSearchParams(location.search).get('invoice') || localStorage.getItem('kivopay_last_robux_invoice') || '';
  }

  function renderTimeline(order) {
    const s = order.status;
    const paid = ['paid','processing','completed'].includes(s);
    const processing = ['processing','completed'].includes(s);
    const completed = s === 'completed';
    const failed = ['cancelled','failed'].includes(s);
    return `<div class="robux-timeline">
      <div class="${paid?'done':s==='pending'?'active':''}"><i>1</i><span><strong>Pembayaran</strong><small>${paid?'Berhasil diterima':'Menunggu pembayaran'}</small></span></div>
      <div class="${processing?'done':paid?'active':''}"><i>2</i><span><strong>Diproses admin</strong><small>${processing?'Pesanan sedang dikerjakan':paid?'Menunggu antrean admin':'Belum dimulai'}</small></span></div>
      <div class="${completed?'done':failed?'failed':''}"><i>3</i><span><strong>${failed?'Pesanan dibatalkan':'Pesanan selesai'}</strong><small>${completed?'Top up telah diselesaikan':failed?'Hubungi CS bila diperlukan':'Belum selesai'}</small></span></div>
    </div>`;
  }

  async function initPayment() {
    const root = $('#paymentRobuxApp');
    if (!root) return;
    const invoice = getInvoice();
    if (!invoice) { root.innerHTML = '<div class="flow-error">Invoice pembayaran tidak ditemukan.<br><a href="robux.html">Kembali ke Top Up Robux</a></div>'; return; }
    rememberInvoice(invoice);
    let stopped = false, redirectTimer = null;

    const render = (o) => {
      root.innerHTML = `<section class="flow-card payment-flow-card">
        <div class="flow-card-head"><div><span class="eyebrow">PEMBAYARAN ROBUX</span><h1>Scan QRIS</h1><p>Bayar tepat sesuai total agar terdeteksi otomatis.</p></div><span class="flow-status ${esc(o.status)}">${esc(statusLabels[o.status] || o.status)}</span></div>
        <div class="payment-flow-grid">
          <div class="payment-qris-panel"><div id="paymentQrisBox" class="qris-box large"></div><button id="downloadPaymentQris" class="secondary-btn">Download QRIS</button></div>
          <div class="payment-info-panel">
            <dl class="flow-detail-list"><dt>Invoice</dt><dd>${esc(o.invoice)} <button id="copyPaymentInvoice" class="copy-mini">Salin</button></dd><dt>Metode</dt><dd>${esc(o.method_name)}</dd><dt>Paket</dt><dd>${esc(o.package_label)}</dd><dt>Username</dt><dd>${esc(o.username)}</dd><dt>Total</dt><dd class="payment-grand-total">${rupiah(o.payment_amount)}</dd></dl>
            <div id="paymentLiveStatus" class="payment-live-status ${esc(o.status)}">${esc(statusLabels[o.status] || o.status)}</div>
            <p class="payment-expire">Batas pembayaran: <strong>${o.expires_at ? new Date(o.expires_at).toLocaleString('id-ID') : '-'}</strong></p>
            <a class="secondary-btn full" href="order-robux.html?invoice=${encodeURIComponent(o.invoice)}">Lihat Detail Pesanan</a>
          </div>
        </div>
        <div id="paymentSuccessRedirect" class="payment-success-redirect" hidden></div>
      </section>`;
      const qbox = $('#paymentQrisBox');
      if (o.qr_image) qbox.innerHTML = `<img src="${esc(o.qr_image)}" crossorigin="anonymous" alt="QRIS pembayaran">`;
      else if (o.qr_content && window.QRCode) new QRCode(qbox,{text:o.qr_content,width:260,height:260});
      else qbox.innerHTML = '<p>QRIS belum tersedia. Coba muat ulang halaman.</p>';
      $('#copyPaymentInvoice').onclick = async () => { await navigator.clipboard.writeText(o.invoice); $('#copyPaymentInvoice').textContent='Tersalin ✓'; };
      $('#downloadPaymentQris').onclick = () => downloadQris(qbox,o.invoice);
    };

    try {
      let order = await getOrder(invoice);
      render(order);
      const poll = async () => {
        if (stopped) return;
        try {
          order = await getOrder(invoice);
          const status = $('#paymentLiveStatus');
          if (status) { status.className = 'payment-live-status ' + order.status; status.textContent = statusLabels[order.status] || order.status; }
          const badge = $('.flow-status');
          if (badge) { badge.className = 'flow-status ' + order.status; badge.textContent = statusLabels[order.status] || order.status; }
          if (['paid','processing','completed'].includes(order.status)) {
            showSuccessRedirect(invoice);
            return;
          }
          if (['cancelled','failed'].includes(order.status)) return;
        } catch (_) {}
        setTimeout(poll, 4000);
      };
      poll();
    } catch (e) { root.innerHTML = `<div class="flow-error">${esc(e.message)}<br><a href="robux.html">Kembali</a></div>`; }

    function showSuccessRedirect(inv) {
      if (redirectTimer) return;
      const box = $('#paymentSuccessRedirect');
      if (!box) return;
      let seconds = 10;
      box.hidden = false;
      const draw = () => box.innerHTML = `<div class="success-icon">✓</div><div><strong>Pembayaran sukses!</strong><p>Kamu akan dipindahkan otomatis ke detail pesanan dalam <b>${seconds} detik</b>.</p></div><a href="order-robux.html?invoice=${encodeURIComponent(inv)}">Lihat Sekarang</a>`;
      draw();
      redirectTimer = setInterval(() => {
        seconds -= 1; draw();
        if (seconds <= 0) { clearInterval(redirectTimer); location.href = 'order-robux.html?invoice=' + encodeURIComponent(inv); }
      },1000);
    }
    addEventListener('beforeunload',()=>{stopped=true;if(redirectTimer)clearInterval(redirectTimer)});
  }

  function downloadQris(box,invoice){
    const image=box.querySelector('img'), canvas=box.querySelector('canvas'); let href='';
    if(canvas) href=canvas.toDataURL('image/png'); else if(image) href=image.src;
    if(!href) return alert('QRIS belum tersedia.');
    const a=document.createElement('a'); a.href=href; a.download=`QRIS-${invoice}.png`; a.target='_blank'; document.body.appendChild(a); a.click(); a.remove();
  }

  async function initOrderDetail() {
    const root = $('#orderRobuxApp');
    if (!root) return;
    const invoice = getInvoice();
    if (!invoice) { root.innerHTML='<div class="flow-error">Invoice tidak ditemukan.</div>'; return; }
    rememberInvoice(invoice);
    const render = async () => {
      try {
        const o = await getOrder(invoice);
        root.innerHTML = `<section class="flow-card order-detail-flow">
          <div class="flow-card-head"><div><span class="eyebrow">DETAIL PESANAN ROBUX</span><h1>${esc(o.invoice)}</h1><p>${new Date(o.created_at).toLocaleString('id-ID')}</p></div><span class="flow-status ${esc(o.status)}">${esc(statusLabels[o.status]||o.status)}</span></div>
          ${renderTimeline(o)}
          <div class="order-detail-grid"><dl class="flow-detail-list"><dt>Username Roblox</dt><dd>${esc(o.username)}</dd><dt>Nomor WhatsApp</dt><dd>${esc(o.whatsapp)}</dd><dt>Metode</dt><dd>${esc(o.method_name)}</dd><dt>Paket</dt><dd>${esc(o.package_label)}</dd><dt>Jumlah Robux</dt><dd>${Number(o.robux_amount||0).toLocaleString('id-ID')} R$</dd><dt>Total Pembayaran</dt><dd>${rupiah(o.payment_amount)}</dd></dl>
          <div class="order-note-box"><strong>Catatan Admin</strong><p>${esc(o.admin_note || 'Belum ada catatan dari admin.')}</p><a class="secondary-btn full" href="riwayat-robux.html">Lihat Semua Riwayat</a></div></div>
        </section>`;
        if (!['completed','cancelled','failed'].includes(o.status)) setTimeout(render,5000);
      } catch(e) { root.innerHTML=`<div class="flow-error">${esc(e.message)}</div>`; }
    };
    render();
  }

  async function initHistory() {
    const root = $('#historyRobuxApp');
    if (!root) return;
    const invoices = JSON.parse(localStorage.getItem('kivopay_robux_invoices') || '[]');
    if (!invoices.length) { root.innerHTML='<div class="flow-empty"><strong>Belum ada riwayat Robux</strong><p>Pesanan yang dibuat dari perangkat ini akan muncul di sini.</p><a href="robux.html">Top Up Sekarang</a></div>'; return; }
    root.innerHTML='<div class="robux-history-list"><p>Memuat riwayat...</p></div>';
    const orders = (await Promise.all(invoices.map(async inv => { try{return await getOrder(inv)}catch{return null} }))).filter(Boolean);
    if (!orders.length) { root.innerHTML='<div class="flow-empty">Riwayat tidak dapat dimuat.</div>'; return; }
    root.innerHTML = `<div class="history-toolbar"><div><strong>${orders.length} Pesanan</strong><small>Tersimpan di perangkat ini</small></div><a href="robux.html">+ Top Up Lagi</a></div><div class="robux-history-list">${orders.map(o=>`<a class="robux-history-item" href="order-robux.html?invoice=${encodeURIComponent(o.invoice)}"><div><span class="flow-status ${esc(o.status)}">${esc(statusLabels[o.status]||o.status)}</span><h3>${esc(o.package_label)}</h3><small>${esc(o.invoice)} • ${new Date(o.created_at).toLocaleDateString('id-ID')}</small></div><div><strong>${rupiah(o.payment_amount)}</strong><small>${esc(o.username)}</small><b>→</b></div></a>`).join('')}</div>`;
  }

  initPayment(); initOrderDetail(); initHistory();
})();
