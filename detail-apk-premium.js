(()=>{
 const root=document.querySelector('#apkOrderDetailApp'); if(!root)return;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
 const money=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
 const labels={pending:'Menunggu pembayaran',paid:'Menunggu diproses admin',processing:'Sedang diproses',completed:'Pesanan selesai',cancelled:'Dibatalkan',failed:'Gagal'};
 const invoice=new URLSearchParams(location.search).get('invoice')||'';
 const date=v=>v?new Date(v).toLocaleString('id-ID',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}):'-';
 const parseDelivery=s=>{
  const raw=String(s||'').trim(); if(!raw)return [];
  const explicit=[];
  const lines=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const tokens=[];
  lines.forEach(line=>{
   const named=line.match(/^([^:=|]{1,40})\s*[:=]\s*(.+)$/);
   if(named){explicit.push({label:named[1].trim(),value:named[2].trim()});return;}
   line.split('|').map(x=>x.trim()).filter(Boolean).forEach(x=>tokens.push(x));
  });
  const fields=[...explicit];
  const used=new Set(fields.map(x=>x.label.toLowerCase()));
  const labels=['Email','Password','Catatan'];
  tokens.forEach((value,i)=>{
   let label=labels[i]||`Data ${i+1}`;
   if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&!used.has('email'))label='Email';
   else if(/^https?:\/\//i.test(value)&&!used.has('Link'))label='Link';
   while(used.has(label.toLowerCase()))label=`Data ${i+1}`;
   used.add(label.toLowerCase()); fields.push({label,value});
  });
  return fields;
 };
 async function init(){
  if(!invoice){root.innerHTML='<div class="flow-error">Invoice tidak ditemukan.<br><a href="riwayat-apk-premium.html">Kembali ke Riwayat</a></div>';return}
  try{const r=await fetch('/api/check-payment?invoice='+encodeURIComponent(invoice),{cache:'no-store'}),d=await r.json();if(!r.ok||!d.order)throw new Error(d.error||'Pesanan tidak ditemukan.');const o=d.order,status=String(o.status||'pending').toLowerCase(),fields=parseDelivery(o.delivery_content);
   root.innerHTML=`<section class="flow-card order-detail-flow premium-order-detail"><div class="flow-card-head"><div><span class="eyebrow">DETAIL PESANAN APK PREMIUM</span><h1>${esc(o.product_name||'APK Premium')}</h1><p>${esc(o.invoice||invoice)}</p></div><span class="flow-status ${esc(status)}">${esc(labels[status]||status)}</span></div><div class="order-detail-grid"><dl class="flow-detail-list premium-detail-list"><dt>Invoice</dt><dd>${esc(o.invoice||invoice)} <button id="copyDetailInvoice" class="copy-mini">Salin</button></dd><dt>Produk</dt><dd>${esc(o.product_name||'APK Premium')}</dd>${o.customer_email?`<dt>Email Invite</dt><dd>${esc(o.customer_email)}</dd>`:''}<dt>Paket</dt><dd>${esc(o.variant_name||'Paket utama')}</dd><dt>Total</dt><dd class="payment-grand-total">${money(o.payment_amount??o.amount)}</dd><dt>Dibuat</dt><dd>${esc(date(o.created_at))}</dd><dt>Diperbarui</dt><dd>${esc(date(o.updated_at||o.completed_at))}</dd></dl><aside class="order-note-box"><strong>Status pesanan</strong><p>${status==='completed'?'Pesanan telah selesai dan data produk sudah tersedia.':status==='pending'?'Selesaikan pembayaran agar pesanan diproses.':status==='paid'&&o.delivery_mode==='manual'?'Pembayaran sudah diterima. Admin sedang menyiapkan data akun dan akan mengirimkannya melalui halaman ini.':'Status pesanan akan diperbarui otomatis.'}</p><a class="secondary-btn full" href="riwayat-apk-premium.html">Kembali ke Riwayat</a>${status==='pending'?`<a class="secondary-btn full" href="payment-order.html?invoice=${encodeURIComponent(o.invoice||invoice)}">Buka Pembayaran</a>`:''}${o.admin_note?`<div class="order-note-box"><strong>Catatan Admin</strong><p>${esc(o.admin_note)}</p></div>`:''}</aside></div>${status==='completed'?`<section class="delivery-receipt payment-delivery-result"><div class="delivery-data-title"><div><span>DATA PRODUK</span><strong>Informasi yang kamu terima</strong></div><span>${fields.length} data</span></div><div class="delivery-fields">${fields.length?fields.map((f,i)=>`<div class="delivery-field"><div><span>${esc(f.label)}</span><strong>${esc(f.value)}</strong></div><button data-copy-value="${esc(f.value)}">Salin</button></div>`).join(''):'<div class="delivery-empty-information">Belum ada data produk yang ditampilkan.</div>'}</div></section>`:''}</section>`;
   document.querySelector('#copyDetailInvoice')?.addEventListener('click',async e=>{await navigator.clipboard.writeText(o.invoice||invoice);e.currentTarget.textContent='Tersalin ✓'});document.querySelectorAll('[data-copy-value]').forEach(b=>b.onclick=async()=>{await navigator.clipboard.writeText(b.dataset.copyValue);b.textContent='Tersalin ✓'});
  }catch(e){root.innerHTML=`<div class="flow-error">${esc(e.message)}<br><a href="riwayat-apk-premium.html">Kembali ke Riwayat</a></div>`}
 }
 init();
})();