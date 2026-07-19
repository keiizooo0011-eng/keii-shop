const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
const modal=$("#modal"), body=$("#panelBody");
const toast=(m)=>{const t=$("#toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),1700)};
$("#close").onclick=()=>modal.classList.remove("show");
modal.onclick=e=>{if(e.target===modal)modal.classList.remove("show")};
function open(html){body.innerHTML=html;modal.classList.add("show")}
function esc(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
async function api(endpoint,params={}){
  const q=new URLSearchParams({endpoint,...params});
  const r=await fetch("/api/siputzx?"+q);
  const data=await r.json().catch(()=>({error:"Respons tidak valid"}));
  if(!r.ok)throw new Error(data.error||"Permintaan gagal");
  return data;
}
function showJson(data,id="result"){const el=$("#"+id);el.textContent=JSON.stringify(data,null,2)}
function loading(id="result"){const el=$("#"+id);el.textContent="Memproses..."}

const forms={
ai:()=>open(`<h2>AI Chat</h2><p class="desc">Tanyakan apa saja. Percakapan saat ini bersifat satu kali per pesan.</p>
<div class="field"><label>Pesan</label><textarea id="prompt" placeholder="Tulis pertanyaan..."></textarea></div>
<div class="field"><label>System prompt</label><input id="system" value="Kamu adalah asisten yang membantu, ramah, dan menjawab dalam Bahasa Indonesia."></div>
<div class="field"><label>Temperature</label><input id="temp" type="number" min="0" max="2" step="0.1" value="0.7"></div>
<div class="actions"><button class="run" id="go">Kirim</button></div><div id="result" class="result">Jawaban akan muncul di sini.</div>`),
translate:()=>open(`<h2>Penerjemah</h2><p class="desc">Terjemahkan teks menggunakan endpoint Siputzx.</p>
<div class="field"><label>Teks</label><textarea id="text"></textarea></div>
<div class="field"><label>Bahasa sumber</label><input id="source" value="en"></div>
<div class="field"><label>Bahasa tujuan</label><input id="target" value="id"></div>
<div class="actions"><button class="run" id="go">Terjemahkan</button></div><div id="result" class="result">Hasil akan muncul di sini.</div>`),
tiktokdl:()=>urlForm("TikTok Downloader","Masukkan URL TikTok.","tiktokdl"),
capcut:()=>urlForm("CapCut Downloader","Masukkan URL CapCut.","capcut"),
snack:()=>urlForm("SnackVideo Downloader","Masukkan URL SnackVideo.","snack"),
tiktokstalk:()=>open(`<h2>TikTok Profile</h2><p class="desc">Masukkan username tanpa tanda @.</p><div class="field"><label>Username</label><input id="username"></div><div class="actions"><button class="run" id="go">Cari</button></div><div id="result" class="result">Data profil akan muncul di sini.</div>`),
weather:()=>open(`<h2>Cuaca</h2><p class="desc">Masukkan nama kecamatan, kota, atau wilayah.</p><div class="field"><label>Lokasi</label><input id="q" placeholder="Pasiran Jaya"></div><div class="actions"><button class="run" id="go">Cari</button></div><div id="result" class="result">Informasi cuaca akan muncul di sini.</div>`),
zodiac:()=>open(`<h2>Zodiak</h2><p class="desc">Pilih zodiak.</p><div class="field"><label>Zodiak</label><select id="zodiac">${["aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces"].map(x=>`<option>${x}</option>`).join("")}</select></div><div class="actions"><button class="run" id="go">Lihat</button></div><div id="result" class="result">Hasil akan muncul di sini.</div>`),
name:()=>open(`<h2>Arti Nama</h2><p class="desc">Masukkan nama yang ingin dicari.</p><div class="field"><label>Nama</label><input id="name"></div><div class="actions"><button class="run" id="go">Cari</button></div><div id="result" class="result">Hasil akan muncul di sini.</div>`),
health:()=>open(`<h2>Potensi Kesehatan</h2><p class="desc">Fitur hiburan berbasis primbon, bukan diagnosis medis.</p><div class="field"><label>Tanggal</label><input id="tgl" type="number" min="1" max="31"></div><div class="field"><label>Bulan</label><input id="bln" type="number" min="1" max="12"></div><div class="field"><label>Tahun</label><input id="thn" type="number" min="1900" max="2100"></div><div class="actions"><button class="run" id="go">Cek</button></div><div class="note">Jangan gunakan hasil ini untuk mengambil keputusan kesehatan. Untuk keluhan nyata, konsultasikan ke tenaga medis.</div><div id="result" class="result">Hasil akan muncul di sini.</div>`),
password:()=>open(`<h2>Password Generator</h2><div class="field"><label>Panjang</label><input id="len" type="number" min="8" max="64" value="18"></div><div class="actions"><button class="run" id="go">Buat</button><button class="secondary" id="copy">Salin</button></div><div id="result" class="result">Password akan muncul di sini.</div>`),
json:()=>open(`<h2>JSON Formatter</h2><div class="field"><label>JSON</label><textarea id="input"></textarea></div><div class="actions"><button class="run" id="format">Format</button><button class="secondary" id="minify">Minify</button></div><div id="result" class="result">Hasil akan muncul di sini.</div>`),
base64:()=>open(`<h2>Base64</h2><div class="field"><label>Teks</label><textarea id="input"></textarea></div><div class="actions"><button class="run" id="encode">Encode</button><button class="secondary" id="decode">Decode</button></div><div id="result" class="result">Hasil akan muncul di sini.</div>`),
case:()=>open(`<h2>Case Converter</h2><div class="field"><label>Teks</label><textarea id="input"></textarea></div><div class="actions"><button class="run" id="upper">UPPER</button><button class="secondary" id="lower">lower</button><button class="secondary" id="title">Title</button></div><div id="result" class="result">Hasil akan muncul di sini.</div>`),
uuid:()=>open(`<h2>UUID Generator</h2><div class="actions"><button class="run" id="go">Buat UUID</button><button class="secondary" id="copy">Salin</button></div><div id="result" class="result">UUID akan muncul di sini.</div>`),
counter:()=>open(`<h2>Word Counter</h2><div class="field"><label>Teks</label><textarea id="input"></textarea></div><div id="result" class="result">Kata: 0\nKarakter: 0\nBaris: 0</div>`)
};
function urlForm(title,desc,type){open(`<h2>${title}</h2><p class="desc">${desc}</p><div class="field"><label>URL</label><input id="url"></div><div class="actions"><button class="run" id="go">Proses</button></div><div class="note">Gunakan hanya untuk konten milik sendiri atau yang kamu punya izin untuk menyimpan.</div><div id="result" class="result">Hasil akan muncul di sini.</div>`);body.dataset.type=type}

$$("[data-open]").forEach(b=>b.onclick=()=>{const key=b.dataset.open;forms[key]();bind(key)});
function bind(key){
  if(key==="ai")$("#go").onclick=async()=>{loading();try{showJson(await api("ai",{prompt:$("#prompt").value,system:$("#system").value,temperature:$("#temp").value}))}catch(e){$("#result").textContent=e.message}};
  if(key==="translate")$("#go").onclick=async()=>{loading();try{showJson(await api("translate",{text:$("#text").value,source:$("#source").value,target:$("#target").value}))}catch(e){$("#result").textContent=e.message}};
  if(["tiktokdl","capcut","snack"].includes(key))$("#go").onclick=async()=>{loading();try{showJson(await api(key,{url:$("#url").value}))}catch(e){$("#result").textContent=e.message}};
  if(key==="tiktokstalk")$("#go").onclick=async()=>{loading();try{showJson(await api("tiktokstalk",{username:$("#username").value}))}catch(e){$("#result").textContent=e.message}};
  if(key==="weather")$("#go").onclick=async()=>{loading();try{showJson(await api("weather",{q:$("#q").value}))}catch(e){$("#result").textContent=e.message}};
  if(key==="zodiac")$("#go").onclick=async()=>{loading();try{showJson(await api("zodiac",{zodiac:$("#zodiac").value}))}catch(e){$("#result").textContent=e.message}};
  if(key==="name")$("#go").onclick=async()=>{loading();try{showJson(await api("name",{name:$("#name").value}))}catch(e){$("#result").textContent=e.message}};
  if(key==="health")$("#go").onclick=async()=>{loading();try{showJson(await api("health",{tgl:$("#tgl").value,bln:$("#bln").value,thn:$("#thn").value}))}catch(e){$("#result").textContent=e.message}};
  if(key==="password"){let pass="";$("#go").onclick=()=>{const chars="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*_-+=";const len=Math.max(8,Math.min(64,+$("#len").value||18));const arr=new Uint32Array(len);crypto.getRandomValues(arr);pass=[...arr].map(n=>chars[n%chars.length]).join("");$("#result").textContent=pass};$("#copy").onclick=()=>navigator.clipboard.writeText(pass).then(()=>toast("Tersalin"))}
  if(key==="json"){const run=min=>{try{$("#result").textContent=JSON.stringify(JSON.parse($("#input").value),null,min?0:2)}catch{$("#result").textContent="JSON tidak valid."}};$("#format").onclick=()=>run(false);$("#minify").onclick=()=>run(true)}
  if(key==="base64"){const v=()=>$("#input").value;$("#encode").onclick=()=>{try{$("#result").textContent=btoa(unescape(encodeURIComponent(v())))}catch{$("#result").textContent="Teks tidak valid."}};$("#decode").onclick=()=>{try{$("#result").textContent=decodeURIComponent(escape(atob(v().trim())))}catch{$("#result").textContent="Base64 tidak valid."}}}
  if(key==="case"){const v=()=>$("#input").value;$("#upper").onclick=()=>$("#result").textContent=v().toUpperCase();$("#lower").onclick=()=>$("#result").textContent=v().toLowerCase();$("#title").onclick=()=>$("#result").textContent=v().toLowerCase().replace(/\b\w/g,c=>c.toUpperCase())}
  if(key==="uuid"){let id="";$("#go").onclick=()=>{$("#result").textContent=id=crypto.randomUUID()};$("#copy").onclick=()=>navigator.clipboard.writeText(id).then(()=>toast("Tersalin"))}
  if(key==="counter")$("#input").oninput=e=>{const t=e.target.value;const words=t.trim()?t.trim().split(/\s+/).length:0;$("#result").textContent=`Kata: ${words}\nKarakter: ${t.length}\nBaris: ${t? t.split(/\n/).length:0}`}
}
$(".search").oninput=e=>filterCards();
$$(".nav-btn").forEach(b=>b.onclick=()=>{$$(".nav-btn").forEach(x=>x.classList.remove("active"));b.classList.add("active");filterCards()});
function filterCards(){const q=$("#search").value.toLowerCase();const cat=$(".nav-btn.active").dataset.filter;$$(".card").forEach(c=>c.classList.toggle("hidden",!(c.dataset.key.includes(q)&&(cat==="all"||c.dataset.cat===cat))))}