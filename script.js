const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
const modal=$("#modal"), body=$("#panelBody");

const toast=(m)=>{
  const t=$("#toast");
  t.textContent=m;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"),1700);
};

$("#close").onclick=()=>modal.classList.remove("show");
modal.onclick=e=>{if(e.target===modal)modal.classList.remove("show")};

function open(html){
  body.innerHTML=html;
  modal.classList.add("show");
}

function esc(value=""){
  return String(value).replace(/[&<>"']/g,m=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

async function api(endpoint,params={}){
  const q=new URLSearchParams({endpoint,...params});
  const r=await fetch("/api/siputzx?"+q);
  const text=await r.text();
  let data;
  try{data=JSON.parse(text)}
  catch{throw new Error("Respons API bukan JSON yang valid.")}

  if(!r.ok){
    throw new Error(data?.error || data?.message || "Permintaan gagal.");
  }
  return data;
}

function loading(id="result"){
  const el=$("#"+id);
  if(el) el.innerHTML='<div class="loader-line"></div><span class="loading-text">Memproses...</span>';
}

function getPayload(data){
  if(data && typeof data==="object" && "data" in data) return data.data;
  return data;
}

function findFirst(obj, keys){
  if(!obj || typeof obj!=="object") return "";
  for(const key of keys){
    if(obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
  }
  for(const value of Object.values(obj)){
    if(value && typeof value==="object"){
      const found=findFirst(value,keys);
      if(found) return found;
    }
  }
  return "";
}

function collectMedia(obj, found={videos:[],images:[],audios:[],links:[]}){
  if(!obj || typeof obj!=="object") return found;
  for(const [key,val] of Object.entries(obj)){
    if(typeof val==="string" && /^https?:\/\//i.test(val)){
      const k=key.toLowerCase();
      const url=val;
      if(/video|nowm|no_watermark|watermark|play/.test(k) || /\.(mp4|mov|webm)(\?|$)/i.test(url)){
        if(!found.videos.includes(url)) found.videos.push(url);
      }else if(/image|photo|cover|thumbnail|avatar/.test(k) || /\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)){
        if(!found.images.includes(url)) found.images.push(url);
      }else if(/music|audio|sound/.test(k) || /\.(mp3|m4a|aac|wav)(\?|$)/i.test(url)){
        if(!found.audios.includes(url)) found.audios.push(url);
      }else{
        if(!found.links.includes(url)) found.links.push(url);
      }
    }else if(Array.isArray(val)){
      val.forEach(v=>{
        if(typeof v==="string" && /^https?:\/\//i.test(v)){
          if(/\.(jpg|jpeg|png|webp)(\?|$)/i.test(v)) found.images.push(v);
          else if(/\.(mp4|mov|webm)(\?|$)/i.test(v)) found.videos.push(v);
          else found.links.push(v);
        }else if(v && typeof v==="object") collectMedia(v,found);
      });
    }else if(val && typeof val==="object"){
      collectMedia(val,found);
    }
  }
  found.videos=[...new Set(found.videos)];
  found.images=[...new Set(found.images)];
  found.audios=[...new Set(found.audios)];
  found.links=[...new Set(found.links)];
  return found;
}

function renderDownloader(data){
  const payload=getPayload(data) || {};
  const title=findFirst(payload,["title","caption","desc","description","name"]) || "Media berhasil ditemukan";
  const author=findFirst(payload,["author","nickname","username","creator"]);
  const cover=findFirst(payload,["cover","thumbnail","image","avatar"]);
  const media=collectMedia(payload);

  const preferredVideo =
    findFirst(payload,["no_watermark_link","nowm","no_watermark","video_no_watermark","play","video","watermark_link"]) ||
    media.videos[0];

  const preferredAudio =
    findFirst(payload,["music_link","music","audio","sound"]) ||
    media.audios[0];

  const imageList=media.images.slice(0,12);

  let html=`<div class="media-result">
    <div class="media-meta">
      <h3>${esc(title)}</h3>
      ${author?`<p>${esc(typeof author==="object" ? JSON.stringify(author) : author)}</p>`:""}
    </div>`;

  if(cover && /^https?:\/\//.test(String(cover))){
    html+=`<img class="result-cover" src="${esc(cover)}" alt="Preview" referrerpolicy="no-referrer">`;
  }

  if(preferredVideo){
    html+=`
      <video class="result-video" controls playsinline preload="metadata" src="${esc(preferredVideo)}"></video>
      <a class="download-btn" href="${esc(preferredVideo)}" target="_blank" rel="noopener noreferrer" download>Download Video</a>`;
  }

  if(imageList.length){
    html+=`<div class="image-grid">`;
    imageList.forEach((url,i)=>{
      html+=`<div class="image-item">
        <img src="${esc(url)}" alt="Gambar ${i+1}" referrerpolicy="no-referrer">
        <a href="${esc(url)}" target="_blank" rel="noopener noreferrer" download>Download</a>
      </div>`;
    });
    html+=`</div>`;
  }

  if(preferredAudio){
    html+=`<audio controls src="${esc(preferredAudio)}"></audio>
      <a class="download-btn secondary-download" href="${esc(preferredAudio)}" target="_blank" rel="noopener noreferrer" download>Download Audio</a>`;
  }

  if(!preferredVideo && !imageList.length && !preferredAudio){
    html+=`<div class="empty-media">Media langsung tidak ditemukan. Data mentah tersedia di bawah.</div>`;
  }

  html+=`<details class="raw-details"><summary>Lihat data lengkap</summary><pre>${esc(JSON.stringify(data,null,2))}</pre></details></div>`;
  $("#result").innerHTML=html;
}

function extractAIText(data){
  const payload=getPayload(data);
  if(typeof payload==="string") return payload;
  return (
    findFirst(payload,["response","answer","result","message","text","content","output"]) ||
    "AI tidak mengirim jawaban."
  );
}

let chatMessages=[];
function saveChat(){
  localStorage.setItem("kivo_ai_chat",JSON.stringify(chatMessages.slice(-30)));
}
function loadChat(){
  try{
    chatMessages=JSON.parse(localStorage.getItem("kivo_ai_chat")||"[]");
    if(!Array.isArray(chatMessages)) chatMessages=[];
  }catch{chatMessages=[]}
}
function renderChat(){
  const box=$("#chatMessages");
  if(!box) return;
  if(!chatMessages.length){
    box.innerHTML='<div class="chat-empty">Mulai percakapan baru.</div>';
    return;
  }
  box.innerHTML=chatMessages.map(m=>`
    <div class="chat-row ${m.role}">
      <div class="bubble">${esc(m.text)}</div>
    </div>`).join("");
  box.scrollTop=box.scrollHeight;
}

const forms={
  ai:()=>open(`
    <div class="chat-head">
      <div><h2>AI Chat</h2><p class="desc">Percakapan tersimpan di perangkat ini.</p></div>
      <button id="clearChat" class="clear-chat">Hapus chat</button>
    </div>
    <div id="chatMessages" class="chat-messages"></div>
    <div class="chat-compose">
      <textarea id="prompt" rows="2" placeholder="Tulis pesan..."></textarea>
      <button class="run send-btn" id="go">Kirim</button>
    </div>`),

  translate:()=>open(`<h2>Penerjemah</h2><p class="desc">Terjemahkan teks menggunakan endpoint Siputzx.</p>
    <div class="field"><label>Teks</label><textarea id="text"></textarea></div>
    <div class="field"><label>Bahasa sumber</label><input id="source" value="en"></div>
    <div class="field"><label>Bahasa tujuan</label><input id="target" value="id"></div>
    <div class="actions"><button class="run" id="go">Terjemahkan</button></div>
    <div id="result" class="result readable">Hasil akan muncul di sini.</div>`),

  tiktokdl:()=>urlForm("TikTok Downloader","Masukkan URL TikTok.","tiktokdl"),
  capcut:()=>urlForm("CapCut Downloader","Masukkan URL CapCut.","capcut"),
  snack:()=>urlForm("SnackVideo Downloader","Masukkan URL SnackVideo.","snack"),

  tiktokstalk:()=>open(`<h2>TikTok Profile</h2><p class="desc">Masukkan username tanpa tanda @.</p>
    <div class="field"><label>Username</label><input id="username"></div>
    <div class="actions"><button class="run" id="go">Cari</button></div>
    <div id="result" class="result">Data profil akan muncul di sini.</div>`),

  weather:()=>open(`<h2>Cuaca</h2><p class="desc">Masukkan nama kecamatan, kota, atau wilayah.</p>
    <div class="field"><label>Lokasi</label><input id="q" placeholder="Pasiran Jaya"></div>
    <div class="actions"><button class="run" id="go">Cari</button></div>
    <div id="result" class="result">Informasi cuaca akan muncul di sini.</div>`),

  zodiac:()=>open(`<h2>Zodiak</h2><p class="desc">Pilih zodiak.</p>
    <div class="field"><label>Zodiak</label><select id="zodiac">${["aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces"].map(x=>`<option>${x}</option>`).join("")}</select></div>
    <div class="actions"><button class="run" id="go">Lihat</button></div>
    <div id="result" class="result">Hasil akan muncul di sini.</div>`),

  name:()=>open(`<h2>Arti Nama</h2><p class="desc">Masukkan nama yang ingin dicari.</p>
    <div class="field"><label>Nama</label><input id="name"></div>
    <div class="actions"><button class="run" id="go">Cari</button></div>
    <div id="result" class="result">Hasil akan muncul di sini.</div>`),

  health:()=>open(`<h2>Potensi Kesehatan</h2><p class="desc">Fitur hiburan berbasis primbon, bukan diagnosis medis.</p>
    <div class="field"><label>Tanggal</label><input id="tgl" type="number" min="1" max="31"></div>
    <div class="field"><label>Bulan</label><input id="bln" type="number" min="1" max="12"></div>
    <div class="field"><label>Tahun</label><input id="thn" type="number" min="1900" max="2100"></div>
    <div class="actions"><button class="run" id="go">Cek</button></div>
    <div class="note">Jangan gunakan hasil ini untuk mengambil keputusan kesehatan.</div>
    <div id="result" class="result">Hasil akan muncul di sini.</div>`),

  password:()=>open(`<h2>Password Generator</h2><div class="field"><label>Panjang</label><input id="len" type="number" min="8" max="64" value="18"></div><div class="actions"><button class="run" id="go">Buat</button><button class="secondary" id="copy">Salin</button></div><div id="result" class="result">Password akan muncul di sini.</div>`),
  json:()=>open(`<h2>JSON Formatter</h2><div class="field"><label>JSON</label><textarea id="input"></textarea></div><div class="actions"><button class="run" id="format">Format</button><button class="secondary" id="minify">Minify</button></div><div id="result" class="result">Hasil akan muncul di sini.</div>`),
  base64:()=>open(`<h2>Base64</h2><div class="field"><label>Teks</label><textarea id="input"></textarea></div><div class="actions"><button class="run" id="encode">Encode</button><button class="secondary" id="decode">Decode</button></div><div id="result" class="result">Hasil akan muncul di sini.</div>`),
  case:()=>open(`<h2>Case Converter</h2><div class="field"><label>Teks</label><textarea id="input"></textarea></div><div class="actions"><button class="run" id="upper">UPPER</button><button class="secondary" id="lower">lower</button><button class="secondary" id="title">Title</button></div><div id="result" class="result">Hasil akan muncul di sini.</div>`),
  uuid:()=>open(`<h2>UUID Generator</h2><div class="actions"><button class="run" id="go">Buat UUID</button><button class="secondary" id="copy">Salin</button></div><div id="result" class="result">UUID akan muncul di sini.</div>`),
  counter:()=>open(`<h2>Word Counter</h2><div class="field"><label>Teks</label><textarea id="input"></textarea></div><div id="result" class="result">Kata: 0\nKarakter: 0\nBaris: 0</div>`)
};

function urlForm(title,desc,type){
  open(`<h2>${title}</h2><p class="desc">${desc}</p>
    <div class="field"><label>URL</label><input id="url"></div>
    <div class="actions"><button class="run" id="go">Proses</button></div>
    <div class="note">Gunakan hanya untuk konten milik sendiri atau yang kamu punya izin untuk menyimpan.</div>
    <div id="result" class="result readable">Hasil akan muncul di sini.</div>`);
  body.dataset.type=type;
}

$$("[data-open]").forEach(b=>b.onclick=()=>{
  const key=b.dataset.open;
  forms[key]();
  bind(key);
});

function bind(key){
  if(key==="ai"){
    loadChat();
    renderChat();

    $("#clearChat").onclick=()=>{
      chatMessages=[];
      saveChat();
      renderChat();
    };

    const send=async()=>{
      const input=$("#prompt");
      const prompt=input.value.trim();
      if(!prompt) return;

      chatMessages.push({role:"user",text:prompt});
      input.value="";
      renderChat();

      chatMessages.push({role:"assistant",text:"Mengetik..."});
      renderChat();

      try{
        const history=chatMessages
          .filter(m=>m.text!=="Mengetik...")
          .slice(-10)
          .map(m=>`${m.role==="user"?"Pengguna":"Asisten"}: ${m.text}`)
          .join("\n");

        const data=await api("ai",{
          prompt:`${history}\nAsisten:`,
          system:"Kamu adalah asisten yang ramah, membantu, dan selalu menjawab dalam Bahasa Indonesia.",
          temperature:"0.7"
        });

        chatMessages[chatMessages.length-1]={role:"assistant",text:String(extractAIText(data))};
        saveChat();
        renderChat();
      }catch(e){
        chatMessages[chatMessages.length-1]={role:"assistant",text:`Maaf, terjadi error: ${e.message}`};
        renderChat();
      }
    };

    $("#go").onclick=send;
    $("#prompt").addEventListener("keydown",e=>{
      if(e.key==="Enter" && !e.shiftKey){
        e.preventDefault();
        send();
      }
    });
  }

  if(key==="translate"){
    $("#go").onclick=async()=>{
      loading();
      try{
        const data=await api("translate",{text:$("#text").value,source:$("#source").value,target:$("#target").value});
        const payload=getPayload(data);
        const text=typeof payload==="string" ? payload : findFirst(payload,["translatedText","translation","result","text"]);
        $("#result").textContent=text || JSON.stringify(data,null,2);
      }catch(e){$("#result").textContent=e.message}
    };
  }

  if(["tiktokdl","capcut","snack"].includes(key)){
    $("#go").onclick=async()=>{
      loading();
      try{
        const data=await api(key,{url:$("#url").value});
        renderDownloader(data);
      }catch(e){$("#result").textContent=e.message}
    };
  }

  if(key==="tiktokstalk")$("#go").onclick=async()=>{loading();try{$("#result").textContent=JSON.stringify(await api("tiktokstalk",{username:$("#username").value}),null,2)}catch(e){$("#result").textContent=e.message}};
  if(key==="weather")$("#go").onclick=async()=>{loading();try{$("#result").textContent=JSON.stringify(await api("weather",{q:$("#q").value}),null,2)}catch(e){$("#result").textContent=e.message}};
  if(key==="zodiac")$("#go").onclick=async()=>{loading();try{$("#result").textContent=JSON.stringify(await api("zodiac",{zodiac:$("#zodiac").value}),null,2)}catch(e){$("#result").textContent=e.message}};
  if(key==="name")$("#go").onclick=async()=>{loading();try{$("#result").textContent=JSON.stringify(await api("name",{name:$("#name").value}),null,2)}catch(e){$("#result").textContent=e.message}};
  if(key==="health")$("#go").onclick=async()=>{loading();try{$("#result").textContent=JSON.stringify(await api("health",{tgl:$("#tgl").value,bln:$("#bln").value,thn:$("#thn").value}),null,2)}catch(e){$("#result").textContent=e.message}};

  if(key==="password"){
    let pass="";
    $("#go").onclick=()=>{
      const chars="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*_-+=";
      const len=Math.max(8,Math.min(64,+$("#len").value||18));
      const arr=new Uint32Array(len);
      crypto.getRandomValues(arr);
      pass=[...arr].map(n=>chars[n%chars.length]).join("");
      $("#result").textContent=pass;
    };
    $("#copy").onclick=()=>navigator.clipboard.writeText(pass).then(()=>toast("Tersalin"));
  }

  if(key==="json"){
    const run=min=>{try{$("#result").textContent=JSON.stringify(JSON.parse($("#input").value),null,min?0:2)}catch{$("#result").textContent="JSON tidak valid."}};
    $("#format").onclick=()=>run(false);
    $("#minify").onclick=()=>run(true);
  }

  if(key==="base64"){
    const v=()=>$("#input").value;
    $("#encode").onclick=()=>{try{$("#result").textContent=btoa(unescape(encodeURIComponent(v())))}catch{$("#result").textContent="Teks tidak valid."}};
    $("#decode").onclick=()=>{try{$("#result").textContent=decodeURIComponent(escape(atob(v().trim())))}catch{$("#result").textContent="Base64 tidak valid."}};
  }

  if(key==="case"){
    const v=()=>$("#input").value;
    $("#upper").onclick=()=>$("#result").textContent=v().toUpperCase();
    $("#lower").onclick=()=>$("#result").textContent=v().toLowerCase();
    $("#title").onclick=()=>$("#result").textContent=v().toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
  }

  if(key==="uuid"){
    let id="";
    $("#go").onclick=()=>{$("#result").textContent=id=crypto.randomUUID()};
    $("#copy").onclick=()=>navigator.clipboard.writeText(id).then(()=>toast("Tersalin"));
  }

  if(key==="counter"){
    $("#input").oninput=e=>{
      const t=e.target.value;
      const words=t.trim()?t.trim().split(/\s+/).length:0;
      $("#result").textContent=`Kata: ${words}\nKarakter: ${t.length}\nBaris: ${t?t.split(/\n/).length:0}`;
    };
  }
}

$("#search").oninput=filterCards;
$$(".nav-btn").forEach(b=>b.onclick=()=>{
  $$(".nav-btn").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");
  filterCards();
});

function filterCards(){
  const q=$("#search").value.toLowerCase();
  const cat=$(".nav-btn.active").dataset.filter;
  $$(".card").forEach(c=>{
    c.classList.toggle("hidden",!(c.dataset.key.includes(q)&&(cat==="all"||c.dataset.cat===cat)));
  });
}
