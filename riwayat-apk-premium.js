(async()=>{
 const list=document.querySelector('#orderHistoryList'),msg=document.querySelector('#historyMessage'),form=document.querySelector('#invoiceHistoryForm'),input=document.querySelector('#invoiceHistoryInput');
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
 const money=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
 const statusLabel={pending:'Menunggu pembayaran',paid:'Menunggu data admin',processing:'Sedang diproses',completed:'Selesai',cancelled:'Dibatalkan',failed:'Gagal'};
 const date=v=>v?new Date(v).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'-';
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
 const isApk=o=>{const category=String(o.category||o.product_category||o.service_type||'').toLowerCase();const name=String(o.product_name||o.service_name||'').toLowerCase();return category==='apk-premium'||category==='apk_premium'||(!category&&!/(sewa\s*bot|bot\s*(wa|whatsapp|telegram))/i.test(name));};
 const snapshots=()=>{try{return JSON.parse(localStorage.getItem('kivopay_order_snapshots')||'[]').filter(isApk)}catch{return[]}};
 const invoices=()=>{try{return JSON.parse(localStorage.getItem('kivopay_order_invoices')||'[]').filter(Boolean)}catch{return[]}};
 function save(o){if(!o?.invoice)return;try{const all=JSON.parse(localStorage.getItem('kivopay_order_snapshots')||'[]').filter(Boolean);localStorage.setItem('kivopay_order_snapshots',JSON.stringify([o,...all.filter(x=>x?.invoice!==o.invoice)].slice(0,100)));const ids=invoices();localStorage.setItem('kivopay_order_invoices',JSON.stringify([o.invoice,...ids.filter(x=>x!==o.invoice)].slice(0,100)));}catch{}}
 function card(o){
  const invoice=o.invoice||o.order_id||o.reference||'-',status=String(o.status||o.payment_status||'pending').toLowerCase(),fields=parseDelivery(o.delivery_content);
  const delivery=fields.length&&status==='completed'?`<section class="history-delivery"><div class="history-delivery-head"><div><small>DATA PRODUK</small><strong>Informasi produk lengkap</strong></div><span>${fields.length} data</span></div><div class="history-delivery-grid">${fields.map((f,i)=>`<div class="history-delivery-field"><span>${esc(f.label)}</span><strong>${esc(f.value)}</strong><button type="button" data-copy-value="${esc(f.value)}">Salin</button></div>`).join('')}</div><a class="history-detail-primary" href="detail-apk-premium.html?invoice=${encodeURIComponent(invoice)}">Buka detail lengkap</a></section>`:'';
  return `<article class="history-card"><div class="history-card-top"><div><small>${esc(invoice)}</small><h3>${esc(o.product_name||o.service_name||'APK Premium')}</h3></div><span class="history-status ${esc(status)}">${esc(statusLabel[status]||status)}</span></div><div class="history-meta"><span><b>Paket</b>${esc(o.variant_name||o.package_name||'Paket utama')}</span><span><b>Total</b>${money(o.payment_amount??o.amount)}</span><span><b>Tanggal</b>${esc(date(o.created_at||o.updated_at))}</span></div><div class="history-actions"><a href="detail-apk-premium.html?invoice=${encodeURIComponent(invoice)}">Lihat Detail</a><button type="button" data-copy="${esc(invoice)}">Salin Invoice</button></div>${delivery}</article>`
 }
 function bind(){document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{await navigator.clipboard.writeText(b.dataset.copy);b.textContent='Tersalin ✓'});document.querySelectorAll('[data-copy-value]').forEach(b=>b.onclick=async()=>{await navigator.clipboard.writeText(b.dataset.copyValue);b.textContent='Tersalin ✓'})}
 function render(rows,label='pesanan APK Premium tersimpan'){const unique=[...new Map(rows.filter(isApk).map(o=>[(o.invoice||o.order_id),o])).values()].sort((a,b)=>new Date(b.created_at||b.updated_at||0)-new Date(a.created_at||a.updated_at||0));if(!unique.length){list.innerHTML='';msg.textContent='Belum ada pesanan APK Premium yang tersimpan.';return;}list.innerHTML=unique.map(card).join('');msg.textContent=`${unique.length} ${label}. Riwayat tetap tersedia meski halaman ditutup.`;bind();}
 async function fetchInvoice(inv){const r=await fetch('/api/check-payment?invoice='+encodeURIComponent(inv),{cache:'no-store'}),d=await r.json().catch(()=>({}));if(!r.ok||!d.order)throw new Error(d.error||'Invoice tidak ditemukan');if(!isApk(d.order))throw new Error('Invoice tersebut bukan pesanan APK Premium.');save(d.order);return d.order}
 async function byInvoice(inv){msg.textContent='Mencari invoice...';try{const order=await fetchInvoice(inv);render([order],'pesanan ditemukan');}catch(e){msg.textContent=e.message||'Invoice tidak ditemukan.'}}
 async function load(){msg.textContent='Menyinkronkan riwayat pesanan...';const local=snapshots();let account=[];try{const session=await KivoAuth.session();if(session){const {data,error}=await KivoAuth.db.from('orders').select('*').eq('user_id',session.user.id).order('created_at',{ascending:false}).limit(100);if(!error)account=(data||[]).filter(isApk);}}catch{}
 const missing=invoices().filter(inv=>![...local,...account].some(o=>o.invoice===inv)).slice(0,30);
 const fetched=(await Promise.allSettled(missing.map(fetchInvoice))).filter(x=>x.status==='fulfilled').map(x=>x.value);
 render([...account,...fetched,...local]);}
 form.onsubmit=e=>{e.preventDefault();const inv=input.value.trim();if(inv)byInvoice(inv)};
 document.querySelector('#refreshHistory').onclick=load;
 const q=new URLSearchParams(location.search).get('invoice');if(q){input.value=q;await byInvoice(q)}else await load();
})();
