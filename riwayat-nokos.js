(()=>{
  const cfg=window.KIVOPAY_CONFIG||{};
  const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const rp=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
  const dt=v=>v?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(v)):'-';
  const CANCEL_WAIT_MS=2*60*1000;
  let busy=false;

  async function api(url,opt={}){
    const {data:{session}}=await sb.auth.getSession();
    if(!session){location.href='login.html?redirect=riwayat-nokos.html';throw new Error('Sesi tidak ditemukan.');}
    const r=await fetch(url,{...opt,headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`,...(opt.headers||{})}});
    const b=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(typeof b.error==='string'?b.error:'Permintaan gagal.');
    return b;
  }

  const label=s=>({
    creating:'Membuat Pesanan',waiting:'Menunggu OTP',received:'Menunggu OTP',
    completed:'Selesai',canceled:'Dibatalkan',cancel:'Dibatalkan',
    expiring:'Hampir Kedaluwarsa',failed:'Gagal'
  })[String(s||'').toLowerCase()]||String(s||'Menunggu');

  const activeStatus=s=>['creating','waiting','received','expiring'].includes(String(s||'').toLowerCase());

  function remaining(v){
    const ms=new Date(v).getTime()-Date.now();
    if(!Number.isFinite(ms)||ms<=0)return 'Kedaluwarsa';
    const m=Math.floor(ms/60000),s=Math.floor((ms%60000)/1000);
    return `${m}:${String(s).padStart(2,'0')}`;
  }

  function cancelRemaining(createdAt){
    const ms=CANCEL_WAIT_MS-(Date.now()-new Date(createdAt).getTime());
    return Number.isFinite(ms)?Math.max(0,ms):0;
  }

  function cancelText(ms){
    const total=Math.ceil(ms/1000),m=Math.floor(total/60),s=total%60;
    return `Batalkan dalam ${m}:${String(s).padStart(2,'0')}`;
  }

  function render(rows){
    $('#nokosHistory').innerHTML=rows.length?rows.map(o=>{
      const canAct=activeStatus(o.status);
      const cancelMs=cancelRemaining(o.created_at);
      const cancelDisabled=cancelMs>0;
      return `<article class="nokos-order ${esc(String(o.status||'').toLowerCase())}">
        <div class="order-top">
          <div class="order-app">
            <div class="order-app-icon">${o.service_img?`<img src="${esc(o.service_img)}" alt="${esc(o.service_name)}" onerror="this.style.display='none'">`:''}</div>
            <div class="order-app-copy">
              <small class="order-invoice">${esc(o.invoice)}</small>
              <h2>${esc(o.service_name)}</h2>
              <p>${esc(o.country_name)} · ${esc(o.operator_name||'Semua Operator')}</p>
            </div>
          </div>
          <span class="order-status">${esc(label(o.status))}</span>
        </div>

        <div class="order-main-grid">
          <div class="number-box">
            <small>NOMOR VIRTUAL</small>
            <strong>${esc(o.phone_number||'Sedang disiapkan...')}</strong>
            ${o.phone_number?`<button type="button" data-copy="${esc(o.phone_number)}">Salin Nomor</button>`:''}
          </div>
          <div class="otp-box ${o.otp_code?'ready':''}">
            <small>KODE OTP</small>
            <strong>${esc(o.otp_code||'Menunggu kode...')}</strong>
            ${o.otp_message?`<p>${esc(o.otp_message)}</p>`:''}
            ${o.otp_code?`<button type="button" data-copy="${esc(o.otp_code)}">Salin OTP</button>`:''}
          </div>
        </div>

        <div class="order-meta">
          <span><small>Total</small><b>${rp(o.sell_price)}</b></span>
          <span><small>Kedaluwarsa</small><b data-exp="${esc(o.expires_at)}">${remaining(o.expires_at)}</b></span>
          <span><small>Dibuat</small><b>${esc(dt(o.created_at))}</b></span>
        </div>

        <div class="order-actions">
          ${canAct?`<button type="button" data-action="resend" data-invoice="${esc(o.invoice)}">Kirim Ulang OTP</button>
          <button type="button" class="danger" data-action="cancel" data-invoice="${esc(o.invoice)}" data-created="${esc(o.created_at)}" ${cancelDisabled?'disabled':''}>${cancelDisabled?cancelText(cancelMs):'Batalkan Pesanan'}</button>`:''}
          ${o.otp_code&&String(o.status).toLowerCase()!=='completed'?`<button type="button" class="primary" data-action="done" data-invoice="${esc(o.invoice)}">Tandai Selesai</button>`:''}
        </div>
        ${canAct&&cancelDisabled?`<p class="cancel-hint">Pesanan bisa dibatalkan setelah 2 menit sejak dibuat.</p>`:''}
        ${o.note?`<p class="order-note">${esc(o.note)}</p>`:''}
      </article>`;
    }).join(''):'<div class="nokos-empty"><h2>Belum ada pesanan Nokos</h2><p>Pesanan nomor virtual akan tampil di sini.</p><a href="nokos.html">Buka Katalog Nokos</a></div>';

    document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>{
      if(!b.dataset.copy)return;
      navigator.clipboard.writeText(b.dataset.copy).then(()=>{
        const old=b.textContent;b.textContent='Tersalin';setTimeout(()=>b.textContent=old,1300);
      });
    });
    document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>action(b.dataset.invoice,b.dataset.action,b));
    updateTimers();
  }

  function updateTimers(){
    document.querySelectorAll('[data-exp]').forEach(x=>x.textContent=remaining(x.dataset.exp));
    document.querySelectorAll('[data-action="cancel"]').forEach(btn=>{
      const ms=cancelRemaining(btn.dataset.created);
      if(ms>0){btn.disabled=true;btn.textContent=cancelText(ms)}
      else{btn.disabled=false;btn.textContent='Batalkan Pesanan'}
    });
  }

  async function load(){
    if(busy)return;busy=true;
    try{
      const q=new URLSearchParams(location.search).get('invoice');
      const b=await api('/api/nokos-orders'+(q?'?invoice='+encodeURIComponent(q):''));
      render(b.orders||[]);
    }catch(e){$('#nokosHistory').innerHTML=`<div class="nokos-error">${esc(e.message)}</div>`}
    finally{busy=false}
  }

  async function action(invoice,act,btn){
    const names={cancel:'membatalkan',done:'menyelesaikan',resend:'meminta ulang OTP'};
    if(act==='cancel'&&cancelRemaining(btn.dataset.created)>0)return;
    if(act!=='resend'&&!confirm(`Yakin ${names[act]} pesanan ini?`))return;
    btn.disabled=true;
    try{const result=await api('/api/nokos-orders',{method:'POST',body:JSON.stringify({invoice,action:act})});if(act==='cancel'&&result.refunded)alert(`Pesanan dibatalkan. Saldo ${rp(result.refund_amount)} sudah dikembalikan.`);await load()}
    catch(e){alert(e.message)}
    finally{btn.disabled=false}
  }

  $('#refreshHistory').onclick=load;
  load();
  setInterval(()=>{updateTimers();if(!document.hidden)load()},7000);
  setInterval(updateTimers,1000);
})();
