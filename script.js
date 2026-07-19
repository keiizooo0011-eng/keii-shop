const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
const modal=$("#modal"), body=$("#panelBody");

const toast=(m)=>{
  const t=$("#toast");
  t.textContent=m;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"),1700);
};

function closeModal(){
  modal.classList.remove("animate-in");
  setTimeout(()=>modal.classList.remove("show"),180);
}
$("#close").onclick=closeModal;
modal.onclick=e=>{if(e.target===modal)closeModal()};

function open(html){
  body.innerHTML=html;
  modal.classList.add("show");
  requestAnimationFrame(()=>modal.classList.add("animate-in"));
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
    chatMessages=chatMessages.filter(m=>
      m &&
      typeof m.text==="string" &&
      m.text.trim() &&
      m.text.trim()!=="Mengetik..." && m.text.trim()!=="__typing__"
    );
    saveChat();
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
      <div class="bubble">
        <div class="bubble-text">${m.text==="__typing__" ? '<span class="typing-dots"><i></i><i></i><i></i></span>' : esc(m.text)}</div>
        <div class="bubble-meta">
          <span>${esc(m.time || "")}</span>
          ${m.role==="user" ? '<span class="ticks">✓✓</span>' : ""}
        </div>
      </div>
    </div>`).join("");
  box.scrollTop=box.scrollHeight;
}


function humanLabel(key=""){
  const map={
    uniqueId:"Username",nickname:"Nama",signature:"Bio",avatarLarger:"Foto profil",
    avatarMedium:"Foto profil",avatarThumb:"Foto profil",followerCount:"Pengikut",
    followingCount:"Mengikuti",heartCount:"Total suka",videoCount:"Jumlah video",
    friendCount:"Teman",diggCount:"Disukai",verified:"Terverifikasi",
    temperature:"Suhu",temp:"Suhu",humidity:"Kelembapan",wind:"Angin",
    weather:"Kondisi",condition:"Kondisi",location:"Lokasi",city:"Kota",
    country:"Negara",forecast:"Prakiraan",date:"Tanggal",time:"Waktu",
    result:"Hasil",meaning:"Arti",arti:"Arti",name:"Nama",nama:"Nama",
    love:"Asmara",career:"Karier",finance:"Keuangan",health:"Kesehatan",
    lucky_number:"Angka keberuntungan",lucky_color:"Warna keberuntungan",
    description:"Deskripsi",message:"Pesan",response:"Jawaban",text:"Teks"
  };
  if(map[key]) return map[key];
  return String(key)
    .replace(/([a-z])([A-Z])/g,"$1 $2")
    .replace(/[_-]+/g," ")
    .replace(/\b\w/g,c=>c.toUpperCase());
}

function prettyNumber(value){
  const n=Number(value);
  if(!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat("id-ID",{
    notation:Math.abs(n)>=1000?"compact":"standard",
    maximumFractionDigits:1
  }).format(n);
}

function formatValue(value){
  if(typeof value==="boolean") return value ? "Ya" : "Tidak";
  if(typeof value==="number") return prettyNumber(value);
  return String(value ?? "-");
}

function isImageUrl(value){
  return typeof value==="string" &&
    /^https?:\/\//i.test(value) &&
    (/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(value) ||
     /avatar|image|photo|thumb|cover|cdn/i.test(value));
}

function renderFriendlyObject(data,title="Hasil"){
  const payload=getPayload(data);
  if(payload===null || payload===undefined){
    $("#result").innerHTML='<div class="friendly-empty">Data tidak ditemukan.</div>';
    return;
  }

  if(typeof payload!=="object"){
    $("#result").innerHTML=`<div class="friendly-card"><h3>${esc(title)}</h3><p class="friendly-main">${esc(formatValue(payload))}</p></div>`;
    return;
  }

  const rows=[];
  const images=[];

  function walk(obj,prefix="",depth=0){
    if(depth>4 || obj===null || obj===undefined) return;

    if(Array.isArray(obj)){
      if(obj.every(v=>["string","number","boolean"].includes(typeof v))){
        rows.push({label:prefix || "Data",value:obj.map(formatValue).join(", ")});
      }else{
        obj.slice(0,20).forEach((item,i)=>walk(item,`${prefix} ${i+1}`.trim(),depth+1));
      }
      return;
    }

    for(const [key,value] of Object.entries(obj)){
      if(["status","timestamp","success"].includes(key)) continue;
      const label=prefix ? `${prefix} · ${humanLabel(key)}` : humanLabel(key);

      if(isImageUrl(value)){
        images.push({label,url:value});
      }else if(value && typeof value==="object"){
        walk(value,label,depth+1);
      }else if(value!=="" && value!==null && value!==undefined){
        rows.push({label,value:formatValue(value)});
      }
    }
  }

  walk(payload);

  let html='<div class="friendly-wrap">';

  if(images.length){
    const best=images.find(x=>/avatar|foto profil/i.test(x.label)) || images[0];
    html+=`<div class="friendly-profile-image">
      <img src="${esc(best.url)}" alt="${esc(best.label)}" referrerpolicy="no-referrer">
    </div>`;
  }

  html+=`<div class="friendly-card"><h3>${esc(title)}</h3>`;

  if(!rows.length){
    html+='<p class="friendly-empty">Tidak ada informasi teks yang dapat ditampilkan.</p>';
  }else{
    html+='<div class="friendly-list">';
    rows.slice(0,80).forEach(row=>{
      const long=String(row.value).length>90;
      html+=`<div class="friendly-row${long?" friendly-row-long":""}">
        <span class="friendly-label">${esc(row.label)}</span>
        <span class="friendly-value">${esc(row.value)}</span>
      </div>`;
    });
    html+='</div>';
  }

  html+='</div></div>';
  $("#result").innerHTML=html;
}

function renderTikTokProfile(data){
  const payload=getPayload(data) || {};
  const user=payload.user || payload.author || payload.profile || payload;
  const stats=payload.stats || payload.statistics || user.stats || {};

  const avatar=findFirst(user,["avatarLarger","avatarMedium","avatarThumb","avatar","profilePicture"]);
  const username=findFirst(user,["uniqueId","username","userName"]);
  const nickname=findFirst(user,["nickname","name","displayName"]);
  const bio=findFirst(user,["signature","bio","description"]);
  const verified=findFirst(user,["verified","isVerified"]);

  const followers=findFirst(stats,["followerCount","followers","follower"]);
  const following=findFirst(stats,["followingCount","following"]);
  const likes=findFirst(stats,["heartCount","likes","diggCount"]);
  const videos=findFirst(stats,["videoCount","videos"]);

  let html='<div class="profile-card">';
  if(avatar){
    html+=`<img class="profile-avatar" src="${esc(avatar)}" alt="Foto profil" referrerpolicy="no-referrer">`;
  }
  html+=`<div class="profile-main">
    <h3>${esc(nickname || username || "Profil TikTok")}${verified===true ? ' <span class="verified-badge">✓</span>' : ""}</h3>
    ${username?`<p class="profile-username">@${esc(username)}</p>`:""}
    ${bio?`<p class="profile-bio">${esc(bio)}</p>`:""}
  </div>`;

  const items=[
    ["Pengikut",followers],["Mengikuti",following],["Total suka",likes],["Video",videos]
  ].filter(x=>x[1]!=="" && x[1]!==undefined && x[1]!==null);

  if(items.length){
    html+='<div class="profile-stats">';
    items.forEach(([label,value])=>{
      html+=`<div><strong>${esc(prettyNumber(value))}</strong><span>${esc(label)}</span></div>`;
    });
    html+='</div>';
  }

  if(username){
    html+=`<button type="button" class="copy-profile-btn" id="copyProfile">Salin username</button>`;
  }

  html+='</div>';
  $("#result").innerHTML=html;

  const copy=$("#copyProfile");
  if(copy){
    copy.onclick=()=>navigator.clipboard.writeText("@"+username).then(()=>toast("Username tersalin"));
  }
}

function showFriendlyError(error){
  $("#result").innerHTML=`<div class="error-card"><strong>Permintaan gagal</strong><p>${esc(error.message || error)}</p></div>`;
}

const forms={
  ai:()=>open(`
    <div class="chat-head">
      <div><h2>AI Chat</h2><p class="desc">Percakapan tersimpan di perangkat ini.</p></div>
      <button id="clearChat" class="clear-chat">Hapus chat</button>
    </div>
    <div id="chatMessages" class="chat-messages"></div>
    <div class="chat-compose">
      <textarea id="prompt" rows="1" placeholder="Tulis pesan..."></textarea>
      <button class="run send-btn" id="go" aria-label="Kirim pesan" title="Kirim">➤</button>
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

      chatMessages.push({role:"user",text:prompt,time:new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})});
      input.value="";
      input.style.height="auto";
      renderChat();

      chatMessages.push({role:"assistant",text:"__typing__",time:""});
      renderChat();

      try{
        const history=chatMessages
          .filter(m=>m.text!=="Mengetik..." && m.text!=="__typing__")
          .slice(-10)
          .map(m=>`${m.role==="user"?"Pengguna":"Asisten"}: ${m.text}`)
          .join("\n");

        const data=await api("ai",{
          prompt:`${history}\nAsisten:`,
          system:"Kamu adalah asisten yang ramah, membantu, dan selalu menjawab dalam Bahasa Indonesia.",
          temperature:"0.7"
        });

        chatMessages[chatMessages.length-1]={
          role:"assistant",
          text:String(extractAIText(data)),
          time:new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})
        };
        saveChat();
        renderChat();
      }catch(e){
        chatMessages[chatMessages.length-1]={
          role:"assistant",
          text:`Maaf, terjadi error: ${e.message}`,
          time:new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})
        };
        renderChat();
      }
    };

    $("#go").onclick=send;

    const promptBox=$("#prompt");
    const grow=()=>{
      promptBox.style.height="auto";
      promptBox.style.height=Math.min(promptBox.scrollHeight,140)+"px";
    };
    promptBox.addEventListener("input",grow);

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
        if(text){
          $("#result").innerHTML=`<div class="translation-card"><span>Hasil terjemahan</span><p>${esc(text)}</p></div>`;
        }else{
          renderFriendlyObject(data,"Hasil Terjemahan");
        }
      }catch(e){showFriendlyError(e)}
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

  if(key==="tiktokstalk")$("#go").onclick=async()=>{
    loading();
    try{renderTikTokProfile(await api("tiktokstalk",{username:$("#username").value.trim()}))}
    catch(e){showFriendlyError(e)}
  };

  if(key==="weather")$("#go").onclick=async()=>{
    loading();
    try{renderFriendlyObject(await api("weather",{q:$("#q").value.trim()}),"Informasi Cuaca")}
    catch(e){showFriendlyError(e)}
  };

  if(key==="zodiac")$("#go").onclick=async()=>{
    loading();
    try{renderFriendlyObject(await api("zodiac",{zodiac:$("#zodiac").value}),"Ramalan Zodiak")}
    catch(e){showFriendlyError(e)}
  };

  if(key==="name")$("#go").onclick=async()=>{
    loading();
    try{renderFriendlyObject(await api("name",{name:$("#name").value.trim()}),"Arti Nama")}
    catch(e){showFriendlyError(e)}
  };

  if(key==="health")$("#go").onclick=async()=>{
    loading();
    try{renderFriendlyObject(await api("health",{
      tgl:$("#tgl").value,bln:$("#bln").value,thn:$("#thn").value
    }),"Potensi Kesehatan")}
    catch(e){showFriendlyError(e)}
  };

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


function initWelcome(){
  const overlay=$("#welcomeOverlay");
  const textEl=$("#welcomeText");
  const closeBtn=$("#welcomeClose");
  if(!overlay || !textEl || !closeBtn) return;

  const message="Haloo, selamat datang di Kivo Tools! Semoga semua fitur di sini bermanfaat dan membantu kalian. Salam hangat dari keii official.";

  const hasSeenWelcome=sessionStorage.getItem("kivo_welcome_seen")==="1";
  if(hasSeenWelcome){ overlay.remove(); return; }
  let timer;
  let index=0;

  const closeWelcome=()=>{
    clearInterval(timer);
    sessionStorage.setItem("kivo_welcome_seen","1");
    overlay.classList.add("welcome-hide");
    setTimeout(()=>overlay.remove(),450);
  };

  overlay.classList.add("welcome-show");
  overlay.setAttribute("aria-hidden","false");

  timer=setInterval(()=>{
    textEl.textContent=message.slice(0,index++);
    if(index>message.length){
      clearInterval(timer);
      closeBtn.classList.add("welcome-button-show");
    }
  },28);

  closeBtn.onclick=closeWelcome;
  overlay.onclick=e=>{
    if(e.target===overlay && index>message.length) closeWelcome();
  };
}

document.addEventListener("DOMContentLoaded",initWelcome);


function initRotatingHeroText(){
  const target=$("#rotatingText");
  if(!target) return;

  const messages=[
    "Cepat, ringan, dan mudah digunakan.",
    "AI Chat, downloader, translate, dan fitur lainnya.",
    "Tidak perlu berpindah-pindah website.",
    "Dibuat supaya kebutuhan digital terasa lebih praktis.",
    "Terima kasih sudah menggunakan Kivo Tools."
  ];

  let current=0;
  setInterval(()=>{
    target.classList.add("rotating-out");
    setTimeout(()=>{
      current=(current+1)%messages.length;
      target.textContent=messages[current];
      target.classList.remove("rotating-out");
      target.classList.add("rotating-in");
      setTimeout(()=>target.classList.remove("rotating-in"),450);
    },300);
  },4000);
}

document.addEventListener("DOMContentLoaded",initRotatingHeroText);




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


// Kivo Tools v6 animations
const revealObserver=new IntersectionObserver(entries=>{
  entries.forEach(entry=>{
    if(entry.isIntersecting){
      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    }
  });
},{threshold:.12});

document.querySelectorAll(".reveal,.reveal-card").forEach((el,index)=>{
  el.style.setProperty("--delay",`${Math.min(index%8,7)*70}ms`);
  revealObserver.observe(el);
});

document.querySelectorAll(".card").forEach(card=>{
  card.addEventListener("pointermove",e=>{
    if(window.matchMedia("(hover:hover)").matches){
      const r=card.getBoundingClientRect();
      const x=(e.clientX-r.left)/r.width-.5;
      const y=(e.clientY-r.top)/r.height-.5;
      card.style.transform=`perspective(700px) rotateX(${-y*4}deg) rotateY(${x*5}deg) translateY(-5px)`;
    }
  });
  card.addEventListener("pointerleave",()=>card.style.transform="");
});
