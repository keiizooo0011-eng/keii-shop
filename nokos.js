(()=>{
  const cfg=window.KIVOPAY_CONFIG||{};
  const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const rp=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));

  let services=[];
  let countries=[];
  let margin=0;
  let selected={service:null,country:null,price:null,operator:null};
\n\n  function initNokosNotice(){\n    const modal=$('#nokosNoticeModal');\n    const closeButton=$('#nokosNoticeClose');\n    const dontShow=$('#nokosNoticeDontShow');\n    if(!modal||!closeButton||!dontShow) return;\n\n    const storageKey='kivopay_nokos_notice_hidden_until';\n    const oneDay=24*60*60*1000;\n    let hiddenUntil=0;\n\n    try{ hiddenUntil=Number(localStorage.getItem(storageKey)||0); }catch(_){ }\n    if(Number.isFinite(hiddenUntil)&&hiddenUntil>Date.now()) return;\n    if(hiddenUntil){\n      try{ localStorage.removeItem(storageKey); }catch(_){ }\n    }\n\n    modal.hidden=false;\n    modal.setAttribute('aria-hidden','false');\n    document.body.classList.add('nokos-notice-open');\n\n    let remaining=7;\n    const updateButton=()=>{\n      if(remaining>0){\n        closeButton.disabled=true;\n        closeButton.textContent=`Mohon baca terlebih dahulu (${remaining})`;\n        return;\n      }\n      closeButton.disabled=false;\n      closeButton.textContent='Saya Sudah Mengerti';\n      closeButton.focus({preventScroll:true});\n    };\n\n    updateButton();\n    const timer=setInterval(()=>{\n      remaining-=1;\n      updateButton();\n      if(remaining<=0) clearInterval(timer);\n    },1000);\n\n    closeButton.addEventListener('click',()=>{\n      if(closeButton.disabled) return;\n      clearInterval(timer);\n      try{\n        if(dontShow.checked) localStorage.setItem(storageKey,String(Date.now()+oneDay));\n        else localStorage.removeItem(storageKey);\n      }catch(_){ }\n      modal.hidden=true;\n      modal.setAttribute('aria-hidden','true');\n      document.body.classList.remove('nokos-notice-open');\n    });\n  }\n\n  initNokosNotice();\n
  function getErrorMessage(value,fallback='Permintaan gagal.'){
    if(value==null||value==='') return fallback;
    if(typeof value==='string'||typeof value==='number'||typeof value==='boolean') return String(value);
    if(value instanceof Error) return getErrorMessage(value.message,fallback);
    if(Array.isArray(value)){
      const messages=value.map(item=>getErrorMessage(item,'')).filter(Boolean);
      return messages.join(' · ')||fallback;
    }
    if(typeof value==='object'){
      for(const key of ['message','error','detail','description','msg','reason']){
        if(value[key]!=null&&value[key]!==value){
          const message=getErrorMessage(value[key],'');
          if(message) return message;
        }
      }
      const primitive=Object.values(value).find(item=>['string','number','boolean'].includes(typeof item));
      if(primitive!=null) return String(primitive);
      try{
        const json=JSON.stringify(value);
        if(json&&json!=='{}') return json;
      }catch(_){ }
    }
    return fallback;
  }

  function normalizeList(value,keys=[]){
    if(Array.isArray(value)) return value;
    if(!value||typeof value!=='object') return [];
    for(const key of keys){
      if(Array.isArray(value[key])) return value[key];
    }
    if(Array.isArray(value.data)) return value.data;
    const vals=Object.values(value);
    if(vals.length&&vals.every(v=>v&&typeof v==='object'&&!Array.isArray(v))) return vals;
    return [];
  }

  async function api(url,opt={}){
    const {data:{session}}=await sb.auth.getSession();
    const response=await fetch(url,{
      ...opt,
      headers:{
        'Content-Type':'application/json',
        ...(session?{Authorization:`Bearer ${session.access_token}`}:{ }),
        ...(opt.headers||{})
      }
    });
    const body=await response.json().catch(()=>({}));
    if(!response.ok||body?.success===false) throw new Error(getErrorMessage(body,`HTTP ${response.status}`));
    return body;
  }

  function setMessage(text,type=''){
    const el=$('#checkoutMessage');
    el.textContent=text||'';
    el.className=type;
  }

  function imageFallback(img,label='?'){
    img.onerror=null;
    img.removeAttribute('src');
    img.classList.add('image-fallback');
    img.alt=label;
  }

  function serviceCard(service,compact=false){
    const code=Number(service.service_code??service.id??service.code);
    const name=service.service_name??service.name??`Aplikasi ${code}`;
    const image=service.service_img??service.image??service.img??'';
    return `<button class="service-card${compact?' compact':''}" data-service-id="${code}">
      <span class="service-icon"><img src="${esc(image)}" alt="${esc(name)}"></span>
      <strong>${esc(name)}</strong>
      ${compact?'<span class="chevron">›</span>':''}
    </button>`;
  }

  async function loadServices(){
    const grid=$('#serviceGrid');
    try{
      const body=await api('/api/nokos-catalog?type=services');
      services=normalizeList(body.data,['services','items','list']).map(item=>({
        ...item,
        service_code:item.service_code??item.id??item.code,
        service_name:item.service_name??item.name??item.title,
        service_img:item.service_img??item.image??item.img??item.icon
      })).filter(item=>item.service_code!=null&&item.service_name);
      margin=Number(body.margin||0);
      renderServices();
    }catch(error){
      grid.innerHTML=`<div class="nokos-error">${esc(getErrorMessage(error))}</div>`;
    }
  }

  function renderServices(){
    const q=($('#serviceSearch').value||'').trim().toLowerCase();
    const filtered=services.filter(service=>String(service.service_name).toLowerCase().includes(q));
    const popularNames=['whatsapp','telegram','facebook','google','gmail','youtube','dana','grab'];
    const popular=filtered.filter(service=>popularNames.some(name=>String(service.service_name).toLowerCase().includes(name))).slice(0,6);
    const remaining=filtered.filter(service=>!popular.includes(service));

    $('#popularSection').hidden=!popular.length||Boolean(q);
    $('#popularGrid').innerHTML=popular.map(service=>serviceCard(service)).join('');
    $('#serviceGrid').innerHTML=remaining.length
      ?remaining.map(service=>serviceCard(service,true)).join('')
      :(!popular.length?'<div class="nokos-empty">Aplikasi tidak ditemukan.</div>':'');

    document.querySelectorAll('[data-service-id]').forEach(button=>{
      button.onclick=()=>chooseService(Number(button.dataset.serviceId));
      const img=button.querySelector('img');
      if(img) img.onerror=()=>imageFallback(img,button.textContent.trim().slice(0,1));
    });
  }

  async function chooseService(id){
    const service=services.find(item=>Number(item.service_code)===Number(id));
    if(!service) return;
    selected={service,country:null,price:null,operator:null};
    $('#appPicker').hidden=true;
    $('#countryPicker').hidden=false;
    $('#selectedService').innerHTML=serviceCard(service,true);
    $('#selectedService [data-service-id]').onclick=showAppPicker;
    const img=$('#selectedService img');
    if(img) img.onerror=()=>imageFallback(img,service.service_name.slice(0,1));
    $('#countryGrid').innerHTML='<div class="nokos-loading"><span class="spinner"></span>Memuat negara dan harga...</div>';
    $('#checkoutSection').hidden=true;
    try{
      const body=await api('/api/nokos-catalog?type=countries&service_id='+encodeURIComponent(id));
      countries=normalizeList(body.data,['countries','items','list']).map(country=>({
        ...country,
        number_id:country.number_id??country.id,
        name:country.name??country.country_name,
        img:country.img??country.image??country.flag,
        prefix:country.prefix??country.phone_code,
        iso_code:country.iso_code??country.iso,
        pricelist:normalizeList(country.pricelist,['prices','providers','items'])
      })).filter(country=>country.number_id!=null&&country.name);
      margin=Number(body.margin??margin);
      renderCountries();
      $('#countryPicker').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){
      $('#countryGrid').innerHTML=`<div class="nokos-error">${esc(getErrorMessage(error))}</div>`;
    }
  }

  function showAppPicker(){
    $('#countryPicker').hidden=true;
    $('#checkoutSection').hidden=true;
    $('#appPicker').hidden=false;
    selected={service:null,country:null,price:null,operator:null};
    $('#appPicker').scrollIntoView({behavior:'smooth',block:'start'});
  }

  function availablePrices(country){
    return normalizeList(country.pricelist,['prices','providers'])
      .filter(price=>price.available!==false&&Number(price.stock??1)>0&&Number.isFinite(Number(price.price)))
      .sort((a,b)=>Number(a.price)-Number(b.price));
  }

  function renderCountries(){
    const query=($('#countrySearch').value||'').trim().toLowerCase();
    const filtered=countries.filter(country=>String(country.name).toLowerCase().includes(query));
    $('#countryGrid').innerHTML=filtered.length?filtered.map((country,index)=>{
      const prices=availablePrices(country);
      if(!prices.length) return '';
      const minPrice=Number(prices[0].price)+margin;
      const countryKey=`country-${country.number_id}-${index}`;
      return `<article class="country-item" data-country-id="${country.number_id}">
        <button class="country-summary" data-toggle="${countryKey}">
          <span class="flag-wrap"><img src="${esc(country.img||'')}" alt="${esc(country.name)}"></span>
          <strong>${esc(country.name)}</strong>
          <span class="country-tags"><b>${esc(country.prefix||'')}</b><b>${esc(String(country.iso_code||'').toUpperCase())}</b><b>Mulai ${rp(minPrice)}</b></span>
          <span class="chevron">⌄</span>
        </button>
        <div class="provider-list" id="${countryKey}" hidden>
          ${prices.map((price,priceIndex)=>{
            const provider=price.provider_id??price.id??priceIndex;
            const rate=Number(price.rate??country.rate??0);
            const stock=Number(price.stock??country.stock_total??0);
            return `<div class="provider-row">
              <div><strong>Server ${esc(String(price.server_id??'2.0'))}</strong><small>ID: ${esc(provider)}${stock?` · Stok ${stock}`:''}</small></div>
              ${rate?`<span class="rate-badge">${rate}%</span>`:''}
              <b>${rp(Number(price.price)+margin)}</b>
              <button class="provider-order" data-country="${country.number_id}" data-provider="${esc(provider)}">Order</button>
            </div>`;
          }).join('')}
          <div class="operator-slot" data-operator-slot="${country.number_id}"></div>
        </div>
      </article>`;
    }).join(''):'<div class="nokos-empty">Negara tidak ditemukan.</div>';

    document.querySelectorAll('.country-summary').forEach(button=>{
      const img=button.querySelector('img');
      if(img) img.onerror=()=>imageFallback(img,'');
      button.onclick=()=>{
        const target=document.getElementById(button.dataset.toggle);
        const wasHidden=target.hidden;
        document.querySelectorAll('.provider-list').forEach(list=>list.hidden=true);
        document.querySelectorAll('.country-summary').forEach(item=>item.classList.remove('open'));
        target.hidden=!wasHidden;
        button.classList.toggle('open',wasHidden);
      };
    });
    document.querySelectorAll('.provider-order').forEach(button=>{
      button.onclick=event=>{
        event.stopPropagation();
        chooseProvider(Number(button.dataset.country),String(button.dataset.provider),button);
      };
    });
  }

  async function chooseProvider(numberId,providerId,button){
    const country=countries.find(item=>Number(item.number_id)===Number(numberId));
    const price=availablePrices(country).find(item=>String(item.provider_id??item.id)===String(providerId));
    if(!country||!price) return;
    selected.country=country;
    selected.price=price;
    selected.operator=null;
    $('#checkoutSection').hidden=true;
    setMessage('');
    document.querySelectorAll('.provider-order').forEach(item=>item.classList.remove('active'));
    button.classList.add('active');
    const slot=document.querySelector(`[data-operator-slot="${CSS.escape(String(numberId))}"]`);
    slot.innerHTML='<div class="nokos-loading small"><span class="spinner"></span>Memuat operator...</div>';
    try{
      const body=await api(`/api/nokos-catalog?type=operators&country=${encodeURIComponent(country.name)}&provider_id=${encodeURIComponent(providerId)}`);
      const operators=normalizeList(body.data,['operators','items','list']).map(item=>({
        ...item,
        id:item.id??item.operator_id,
        name:item.name??item.operator_name,
        image:item.image??item.img??item.icon
      })).filter(item=>item.id!=null&&item.name);
      if(!operators.length) throw new Error('Operator untuk pilihan ini tidak tersedia.');
      slot.innerHTML=`<div class="operator-title">Pilih operator</div><div class="operator-grid">${operators.map(operator=>`<button class="operator-card" data-operator-id="${operator.id}"><img src="${esc(operator.image||'')}" alt=""><span>${esc(operator.name==='any'?'Semua Operator':operator.name)}</span></button>`).join('')}</div>`;
      slot.querySelectorAll('.operator-card').forEach(operatorButton=>{
        const img=operatorButton.querySelector('img');
        if(img) img.onerror=()=>imageFallback(img,'');
        operatorButton.onclick=()=>chooseOperator(operators.find(item=>Number(item.id)===Number(operatorButton.dataset.operatorId)),operatorButton);
      });
      slot.scrollIntoView({behavior:'smooth',block:'center'});
    }catch(error){
      slot.innerHTML=`<div class="nokos-error small">${esc(getErrorMessage(error))}</div>`;
    }
  }

  function chooseOperator(operator,button){
    if(!operator) return;
    document.querySelectorAll('.operator-card').forEach(item=>item.classList.remove('active'));
    button.classList.add('active');
    selected.operator=operator;
    $('#checkoutSection').hidden=false;
    $('#checkoutTitle').textContent=`${selected.service.service_name} · ${selected.country.name}`;
    $('#checkoutMeta').textContent=`${operator.name==='any'?'Semua operator':operator.name} · Stok ${Number(selected.price.stock??selected.country.stock_total??0)}`;
    $('#checkoutPrice').textContent=rp(Number(selected.price.price)+margin);
    setMessage('');
    $('#checkoutSection').scrollIntoView({behavior:'smooth',block:'center'});
  }

  async function order(){
    const button=$('#orderBtn');
    if(!selected.operator){
      setMessage('Pilih operator terlebih dahulu.','error');
      return;
    }
    button.disabled=true;
    button.textContent='Memproses...';
    setMessage('Saldo diperiksa dan nomor sedang dipesan.');
    try{
      const {data:{session}}=await sb.auth.getSession();
      if(!session){
        location.href='login.html?redirect=nokos.html';
        return;
      }
      const body=await api('/api/create-nokos-order',{
        method:'POST',
        body:JSON.stringify({
          service_id:selected.service.service_code,
          number_id:selected.country.number_id,
          provider_id:selected.price.provider_id??selected.price.id,
          operator_id:selected.operator.id
        })
      });
      localStorage.setItem('kivopay_last_nokos',body.order.invoice);
      setMessage('Pesanan berhasil. Membuka riwayat...','success');
      setTimeout(()=>location.href='riwayat-nokos.html?invoice='+encodeURIComponent(body.order.invoice),650);
    }catch(error){
      const message=getErrorMessage(error);
      setMessage(message,'error');
      if(/saldo kivopay tidak cukup/i.test(message)&&confirm('Saldo tidak cukup. Buka halaman deposit?')) location.href='deposit.html';
    }finally{
      button.disabled=false;
      button.textContent='Pesan Sekarang';
    }
  }

  $('#serviceSearch').oninput=renderServices;
  $('#countrySearch').oninput=renderCountries;
  $('#changeServiceBtn').onclick=showAppPicker;
  $('#orderBtn').onclick=order;
  loadServices();
})();
