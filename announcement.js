(() => {
  const root=document.querySelector('#kivoAnnouncement'); if(!root)return;
  const cfg=window.KIVOPAY_CONFIG||{};
  if(!window.supabase||!cfg.supabaseUrl||!cfg.supabaseAnonKey)return;
  const db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const labels={info:'INFORMASI',promo:'PROMO',maintenance:'MAINTENANCE',restock:'RESTOCK'};
  const icons={info:'i',promo:'%',maintenance:'!',restock:'↻'};
  const safeUrl=url=>{if(!url)return'';try{const u=new URL(url,location.href);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return''}};
  async function load(){
    const {data,error}=await db.from('site_announcements').select('*').eq('id','main').eq('is_active',true).maybeSingle();
    if(error||!data)return;
    if(data.expires_at&&new Date(data.expires_at).getTime()<=Date.now())return;
    const url=safeUrl(data.button_url);
    root.className=`kivo-announcement type-${data.type||'info'}`;
    root.innerHTML=`<div class="kivo-announcement-icon">${icons[data.type]||'i'}</div><div class="kivo-announcement-copy"><small>${labels[data.type]||'INFORMASI'} KIVOPAY</small><h2>${esc(data.title)}</h2><p>${esc(data.body)}</p>${data.button_text&&url?`<a href="${esc(url)}">${esc(data.button_text)} <span>→</span></a>`:''}</div><button class="kivo-announcement-close" type="button" aria-label="Tutup pengumuman">×</button>`;
    root.hidden=false;
    root.querySelector('.kivo-announcement-close')?.addEventListener('click',()=>{root.hidden=true;});
  }
  load();
})();
