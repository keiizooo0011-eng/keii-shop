(()=>{
  'use strict';
  const KEY_THEME='kivopay_theme';
  const KEY_NOTIFS='kivopay_notifications';
  const KEY_SNAPSHOT='kivopay_order_snapshot';
  const isAdmin=document.body.classList.contains('admin-body')||location.pathname.endsWith('/admin.html')||location.pathname.endsWith('admin.html');
  const escapeHtml=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
  const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}};
  const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));

  function applyTheme(theme){
    const next=theme==='light'?'light':'dark';
    document.documentElement.dataset.theme=next;
    document.body.classList.toggle('kivo-light',next==='light');
    document.documentElement.style.colorScheme=next;
    localStorage.setItem(KEY_THEME,next);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',next==='light'?'#f4f5fb':'#0a0710');
    document.querySelectorAll('[data-kivo-theme]').forEach(b=>b.classList.toggle('active',b.dataset.kivoTheme===next));
  }

  function permissionLabel(){
    if(!('Notification' in window)) return ['Tidak didukung','unsupported'];
    if(Notification.permission==='granted') return ['Aktif','active'];
    if(Notification.permission==='denied') return ['Diblokir','blocked'];
    return ['Belum aktif','idle'];
  }

  function notifications(){return read(KEY_NOTIFS,[])}
  function addNotification(title,body,type='info',url=''){
    const list=notifications();
    const item={id:Date.now()+Math.random(),title,body,type,url,read:false,time:new Date().toISOString()};
    list.unshift(item); write(KEY_NOTIFS,list.slice(0,50)); renderNotifications();
    if('Notification' in window&&Notification.permission==='granted'&&document.visibilityState!=='visible'){
      const n=new Notification(title,{body,icon:'icons/icon-192.png',badge:'icons/icon-192.png',tag:title+body});
      if(url)n.onclick=()=>{window.focus();location.href=url};
    }
    return item;
  }
  window.KivoNotify=addNotification;

  function shell(){
    const host=document.createElement('div');host.className='kivo-control-host';
    host.innerHTML=`
      <div class="kivo-theme-switch" aria-label="Pilihan tema">
        <button type="button" data-kivo-theme="light" title="Mode terang"><span>☀</span><small>Terang</small></button>
        <button type="button" data-kivo-theme="dark" title="Mode gelap"><span>☾</span><small>Gelap</small></button>
      </div>
      <button class="kivo-notif-trigger" id="kivoNotifTrigger" type="button" aria-label="Notifikasi"><span>♧</span><b id="kivoNotifBadge" hidden>0</b></button>
      <button class="kivo-install-trigger" id="kivoInstallTrigger" type="button" hidden>＋ Install</button>`;
    document.body.appendChild(host);

    const panel=document.createElement('div');panel.id='kivoNotifPanel';panel.className='kivo-notif-overlay';panel.setAttribute('aria-hidden','true');
    panel.innerHTML=`<section class="kivo-notif-panel">
      <div class="kivo-notif-head"><div><span class="kivo-bell">♧</span><h2>Notifikasi</h2></div><button type="button" data-close-notif>×</button></div>
      <div class="kivo-notif-browser">
        <div class="kivo-notif-state"><span><i id="kivoNotifDot"></i><b id="kivoNotifState">Belum aktif</b></span><small>Browser</small></div>
        <div class="kivo-notif-actions"><button type="button" id="kivoNotifBrowserBtn" class="secondary">↔ Browser</button><button type="button" id="kivoNotifToggleBtn" class="primary">Aktifkan</button></div>
        <p id="kivoNotifHelp">Aktifkan agar status pembayaran dan pesanan dapat muncul dari bawaan browser.</p>
      </div>
      <div class="kivo-notif-list-head"><strong>Aktivitas terbaru</strong><button type="button" id="kivoNotifReadAll">Tandai dibaca</button></div>
      <div id="kivoNotifList" class="kivo-notif-list"></div>
    </section>`;
    document.body.appendChild(panel);

    host.querySelectorAll('[data-kivo-theme]').forEach(b=>b.onclick=()=>applyTheme(b.dataset.kivoTheme));
    const open=()=>{panel.classList.add('open');panel.setAttribute('aria-hidden','false');renderNotifications();};
    const close=()=>{panel.classList.remove('open');panel.setAttribute('aria-hidden','true');};
    document.querySelector('#kivoNotifTrigger').onclick=open;
    panel.querySelector('[data-close-notif]').onclick=close;
    panel.onclick=e=>{if(e.target===panel)close()};
    document.querySelector('#kivoNotifBrowserBtn').onclick=async()=>{
      if(!('Notification' in window)) return;
      if(Notification.permission==='default') await Notification.requestPermission();
      updatePermissionUI();
      if(Notification.permission==='granted') addNotification('Notifikasi KivoPay aktif','Update pembayaran dan pesanan siap dikirim melalui browser.','success');
    };
    document.querySelector('#kivoNotifToggleBtn').onclick=async()=>{
      if(!('Notification' in window)) return updatePermissionUI();
      if(Notification.permission!=='granted') await Notification.requestPermission();
      updatePermissionUI();
      if(Notification.permission==='granted') addNotification('Notifikasi berhasil diaktifkan','KivoPay akan memberi kabar saat ada perubahan penting.','success');
    };
    document.querySelector('#kivoNotifReadAll').onclick=()=>{const l=notifications().map(x=>({...x,read:true}));write(KEY_NOTIFS,l);renderNotifications();};
  }

  function updatePermissionUI(){
    const [label,state]=permissionLabel();
    const txt=document.querySelector('#kivoNotifState'),dot=document.querySelector('#kivoNotifDot'),btn=document.querySelector('#kivoNotifToggleBtn'),help=document.querySelector('#kivoNotifHelp');
    if(txt)txt.textContent=label;if(dot)dot.dataset.state=state;
    if(btn){btn.textContent=state==='active'?'Aktif':'Aktifkan';btn.disabled=state==='active'||state==='blocked'||state==='unsupported'}
    if(help&&state==='blocked')help.textContent='Izin diblokir. Buka pengaturan situs di browser untuk mengaktifkannya kembali.';
  }

  function renderNotifications(){
    const list=notifications(),box=document.querySelector('#kivoNotifList'),badge=document.querySelector('#kivoNotifBadge');
    const unread=list.filter(x=>!x.read).length;
    if(badge){badge.hidden=!unread;badge.textContent=unread>9?'9+':unread}
    if(!box)return;
    box.innerHTML=list.length?list.map(n=>`<button type="button" class="kivo-notif-item ${n.read?'':'unread'}" data-notif-id="${n.id}"><span class="type-${escapeHtml(n.type)}">${n.type==='success'?'✓':n.type==='warning'?'!':'•'}</span><div><strong>${escapeHtml(n.title)}</strong><p>${escapeHtml(n.body)}</p><small>${new Date(n.time).toLocaleString('id-ID')}</small></div></button>`).join(''):'<div class="kivo-notif-empty">Belum ada notifikasi baru.</div>';
    box.querySelectorAll('[data-notif-id]').forEach(el=>el.onclick=()=>{const id=Number(el.dataset.notifId);const all=notifications();const n=all.find(x=>x.id===id);write(KEY_NOTIFS,all.map(x=>x.id===id?{...x,read:true}:x));renderNotifications();if(n?.url)location.href=n.url;});
  }

  function watchOrderChanges(){
    const scan=()=>{
      const raw=localStorage.getItem('kivopay_robux_history')||localStorage.getItem('robux_order_history');
      if(!raw)return;
      let orders=[];try{orders=JSON.parse(raw)||[]}catch{return}
      const prev=read(KEY_SNAPSHOT,{}),next={};
      orders.forEach(o=>{
        const invoice=o.invoice||o.order_id||o.reference; if(!invoice)return;
        const status=String(o.status||o.payment_status||'pending').toLowerCase();next[invoice]=status;
        if(prev[invoice]&&prev[invoice]!==status){
          const map={paid:['Pembayaran berhasil',`Pesanan ${invoice} sudah dibayar.`],processing:['Pesanan sedang diproses',`Admin sedang memproses ${invoice}.`],completed:['Pesanan selesai',`Pesanan ${invoice} sudah selesai. Silakan cek detailnya.`],cancelled:['Pesanan dibatalkan',`Pesanan ${invoice} dibatalkan.`]};
          const m=map[status]||['Status pesanan berubah',`${invoice} sekarang berstatus ${status}.`];addNotification(m[0],m[1],status==='completed'||status==='paid'?'success':status==='cancelled'?'warning':'info',`order-robux.html?invoice=${encodeURIComponent(invoice)}`);
        }
      });write(KEY_SNAPSHOT,next);
    }; scan();setInterval(scan,15000);
  }

  function initPwa(){
    if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
    let promptEvent=null;const btn=document.querySelector('#kivoInstallTrigger');
    addEventListener('beforeinstallprompt',e=>{e.preventDefault();promptEvent=e;if(btn)btn.hidden=false;});
    if(btn)btn.onclick=async()=>{if(!promptEvent)return;promptEvent.prompt();await promptEvent.userChoice;promptEvent=null;btn.hidden=true;};
  }

  document.addEventListener('DOMContentLoaded',()=>{
    applyTheme(localStorage.getItem(KEY_THEME)||localStorage.getItem('kivopay_admin_theme')||'dark');
    shell();updatePermissionUI();renderNotifications();watchOrderChanges();initPwa();
    if(!notifications().length)addNotification(isAdmin?'Panel admin siap':'Selamat datang di KivoPay',isAdmin?'Kelola produk, Robux, pesanan, dan notifikasi dari satu tempat.':'Tema, notifikasi browser, dan riwayat pesanan sudah siap digunakan.','info');
  });
})();
