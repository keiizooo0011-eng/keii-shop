(()=>{
  const cfg=window.KIVOPAY_CONFIG||{};
  const ready=window.supabase&&cfg.supabaseUrl&&cfg.supabaseAnonKey;
  const db=ready?window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey):null;
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const fmt=d=>new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short'}).format(new Date(d));
  const STORAGE_KEY='kivopay_support_tickets';
  let files=[];
  let supportSettings={reply_mode:'template',auto_reply_when_offline:true};
  let agents=[];

  function saved(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]')}catch{return[]}}
  function saveTicket(item){const list=saved().filter(x=>x.code!==item.code);list.unshift(item);localStorage.setItem(STORAGE_KEY,JSON.stringify(list.slice(0,20)))}
  function message(text,type=''){const el=$('#ticketFormMessage');el.textContent=text;el.className='ticket-message '+type}
  function uid(){return crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`}

  async function loadSettings(){
    if(!db)return;
    try{
      const {data}=await db.from('site_settings').select('key,value').in('key',['customer_service_agents','support_ticket_settings']);
      for(const row of data||[]){if(row.key==='customer_service_agents'&&Array.isArray(row.value))agents=row.value;if(row.key==='support_ticket_settings'&&row.value)supportSettings={...supportSettings,...row.value}}
    }catch(e){console.warn(e)}
    const online=agents.filter(a=>a.status==='online').length;
    const state=$('#ticketServiceState');
    if(state){state.classList.toggle('online',online>0);state.querySelector('span').textContent=online?`${online} Customer Service sedang online. Tiket tetap dapat digunakan untuk dokumentasi kendala.`:'Seluruh Customer Service sedang offline. Tiket akan menerima respons awal otomatis.'}
  }

  $('#ticketEvidence')?.addEventListener('change',e=>{
    const incoming=[...e.target.files].filter(f=>/^image\/(jpeg|png|webp)$/.test(f.type)&&f.size<=5*1024*1024);
    files=[...files,...incoming].slice(0,4); renderPreview(); e.target.value='';
  });
  function renderPreview(){const root=$('#ticketPreview');root.innerHTML=files.map((f,i)=>`<figure><img src="${URL.createObjectURL(f)}" alt="Bukti ${i+1}"><button type="button" data-remove-file="${i}">×</button></figure>`).join('');root.querySelectorAll('[data-remove-file]').forEach(b=>b.onclick=()=>{files.splice(Number(b.dataset.removeFile),1);renderPreview()})}

  async function uploadEvidence(code,token){
    const urls=[];
    for(let i=0;i<files.length;i++){
      const f=files[i], ext=(f.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
      const path=`support-tickets/${token}/${code}-${Date.now()}-${i}.${ext}`;
      const {error}=await db.storage.from(cfg.storageBucket||'keiishop').upload(path,f,{cacheControl:'3600',upsert:false,contentType:f.type});
      if(error)throw error;
      const {data}=db.storage.from(cfg.storageBucket||'keiishop').getPublicUrl(path); urls.push(data.publicUrl);
    }
    return urls;
  }

  $('#ticketForm')?.addEventListener('submit',async e=>{
    e.preventDefault(); if(!db){message('Supabase belum dikonfigurasi.','error');return}
    const btn=$('#submitTicketBtn');btn.disabled=true;message('Menyiapkan tiket dan mengunggah bukti...');
    try{
      const token=uid();
      const payload={
        p_access_token:token,p_customer_name:$('#ticketName').value.trim(),p_whatsapp:$('#ticketWhatsapp').value.trim(),p_email:$('#ticketEmail').value.trim()||null,
        p_invoice:$('#ticketInvoice').value.trim()||null,p_transaction_id:$('#ticketTransactionId').value.trim()||null,p_category:$('#ticketCategory').value,p_description:$('#ticketDescription').value.trim(),p_evidence_urls:[]
      };
      const {data:created,error}=await db.rpc('create_support_ticket',payload); if(error)throw error;
      const ticket=Array.isArray(created)?created[0]:created; if(!ticket?.ticket_code)throw new Error('Nomor tiket gagal dibuat.');
      const urls=await uploadEvidence(ticket.ticket_code,token);
      if(urls.length){const {error:uerr}=await db.rpc('update_support_ticket_evidence',{p_ticket_code:ticket.ticket_code,p_access_token:token,p_evidence_urls:urls});if(uerr)throw uerr}
      saveTicket({code:ticket.ticket_code,token});
      e.target.reset();files=[];renderPreview();
      message(`Tiket ${ticket.ticket_code} berhasil dibuat. Respons awal sudah tersedia di riwayat tiket.`,`success`);
      $('#lookupCode').value=ticket.ticket_code; await renderSaved(); await openTicket(ticket.ticket_code,token);
    }catch(err){console.error(err);message(err.message||'Tiket gagal dibuat.','error')}finally{btn.disabled=false}
  });

  async function getTicket(code,token){const {data,error}=await db.rpc('get_support_ticket',{p_ticket_code:code,p_access_token:token});if(error)throw error;return Array.isArray(data)?data[0]:data}
  async function openTicket(code,token){
    const detail=$('#ticketDetail');detail.hidden=false;detail.innerHTML='<div class="ticket-list-empty">Memuat percakapan...</div>';
    try{
      const t=await getTicket(code,token);if(!t)throw new Error('Tiket tidak ditemukan atau kode akses tidak sesuai.');
      const evidence=Array.isArray(t.evidence_urls)?t.evidence_urls:[];const msgs=Array.isArray(t.messages)?t.messages:[];
      detail.innerHTML=`<div class="ticket-detail-head"><div><small>NOMOR TIKET</small><h3>${esc(t.ticket_code)}</h3></div><span class="ticket-status">${esc(t.status)}</span></div><div class="ticket-meta"><div><small>JENIS KENDALA</small><strong>${esc(t.category)}</strong></div><div><small>DIBUAT</small><strong>${fmt(t.created_at)}</strong></div><div><small>INVOICE</small><strong>${esc(t.invoice||'-')}</strong></div><div><small>ID TRANSAKSI</small><strong>${esc(t.transaction_id||'-')}</strong></div></div>${evidence.length?`<div class="ticket-evidence">${evidence.map(u=>`<img src="${esc(u)}" data-view-image="${esc(u)}" alt="Bukti tiket">`).join('')}</div>`:''}<div class="ticket-thread">${msgs.map(m=>`<div class="ticket-bubble ${m.sender_type==='customer'?'customer':''}">${esc(m.message)}<small>${m.sender_type==='customer'?'Anda':'KivoPay Support'} · ${fmt(m.created_at)}</small></div>`).join('')||'<div class="ticket-list-empty">Belum ada pesan.</div>'}</div>${t.status!=='ditutup'?`<form class="ticket-reply"><textarea rows="3" maxlength="1500" placeholder="Tambahkan pesan atau informasi baru..."></textarea><button type="submit">Kirim Pesan Tambahan</button></form>`:''}`;
      detail.querySelectorAll('[data-view-image]').forEach(img=>img.onclick=()=>viewImage(img.dataset.viewImage));
      detail.querySelector('.ticket-reply')?.addEventListener('submit',async e=>{e.preventDefault();const text=e.currentTarget.querySelector('textarea').value.trim();if(!text)return;const {error}=await db.rpc('add_support_ticket_message',{p_ticket_code:code,p_access_token:token,p_message:text});if(error)return alert(error.message);await openTicket(code,token)});
    }catch(err){detail.innerHTML=`<div class="ticket-list-empty">${esc(err.message)}</div>`}
  }

  async function renderSaved(){const root=$('#ticketList');const list=saved();if(!list.length){root.innerHTML='<div class="ticket-list-empty">Belum ada tiket tersimpan di perangkat ini.</div>';return}root.innerHTML=list.map(x=>`<button class="ticket-list-item" data-code="${esc(x.code)}"><span><strong>${esc(x.code)}</strong><small>Tekan untuk membuka perkembangan laporan</small></span><b>→</b></button>`).join('');root.querySelectorAll('[data-code]').forEach(b=>b.onclick=()=>{const x=list.find(i=>i.code===b.dataset.code);openTicket(x.code,x.token)})}
  $('#lookupTicketBtn')?.addEventListener('click',()=>{const code=$('#lookupCode').value.trim().toUpperCase();const x=saved().find(i=>i.code===code);if(!x){$('#ticketDetail').hidden=false;$('#ticketDetail').innerHTML='<div class="ticket-list-empty">Tiket ini belum tersimpan di perangkat. Buka tiket dari perangkat yang digunakan saat membuat laporan.</div>';return}openTicket(x.code,x.token)});
  function viewImage(url){const v=$('#ticketImageViewer');v.hidden=false;v.querySelector('img').src=url} $('#ticketImageViewer button')?.addEventListener('click',()=>$('#ticketImageViewer').hidden=true);$('#ticketImageViewer')?.addEventListener('click',e=>{if(e.target.id==='ticketImageViewer')e.currentTarget.hidden=true});
  loadSettings();renderSaved();
})();
