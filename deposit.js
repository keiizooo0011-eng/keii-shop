(()=>{
 const rupiah=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
 const input=document.querySelector('#depositAmount'),form=document.querySelector('#depositForm'),message=document.querySelector('#depositMessage'),submit=document.querySelector('#createDepositBtn');
 let session=null, polling=false;
 const parseAmount=()=>Number(String(input.value||'').replace(/[^0-9]/g,''));
 function renderSummary(){const amount=parseAmount();document.querySelector('#summaryAmount').textContent=rupiah(amount);document.querySelector('#summaryTotal').textContent=rupiah(amount);}
 document.querySelectorAll('[data-amount]').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('[data-amount]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');input.value=Number(btn.dataset.amount).toLocaleString('id-ID');renderSummary();});
 input.addEventListener('input',()=>{const value=parseAmount();input.value=value?value.toLocaleString('id-ID'):'';document.querySelectorAll('[data-amount]').forEach(x=>x.classList.toggle('active',Number(x.dataset.amount)===value));renderSummary();});
 async function headers(json=false){return KivoAuth.authHeaders(json?{'Content-Type':'application/json'}:{});}
 async function api(url,options={}){const response=await fetch(url,{cache:'no-store',...options,headers:{...(await headers(!!options.body)),...(options.headers||{})}});const raw=await response.text();let data={};try{data=raw?JSON.parse(raw):{};}catch{}if(!response.ok)throw new Error(data.error||'Terjadi kesalahan pada server.');return data;}
 async function loadBalance(){try{const data=await api('/api/deposit-history');document.querySelector('#depositBalance').textContent=rupiah(data.balance);document.querySelector('#balanceHint').textContent='Bisa dipakai untuk pembayaran di KivoPay.';}catch(e){document.querySelector('#balanceHint').textContent='Saldo belum dapat dimuat.';}}
 function openPayment(deposit){location.href='payment-deposit.html?invoice='+encodeURIComponent(deposit.invoice);}
 form.onsubmit=async e=>{e.preventDefault();const amount=parseAmount();message.className='deposit-message';message.textContent='';if(amount<2000||amount>2000000||amount%1000!==0){message.textContent='Nominal harus Rp2.000–Rp2.000.000 dan kelipatan Rp1.000.';return;}submit.disabled=true;submit.querySelector('span').textContent='Membuat QRIS...';try{const data=await api('/api/create-deposit',{method:'POST',body:JSON.stringify({amount})});message.className='deposit-message success';message.textContent='Invoice berhasil dibuat.';openPayment(data.deposit);}catch(err){message.textContent=err.message;}finally{submit.disabled=false;submit.querySelector('span').textContent='Buat Deposit';}};
 (async()=>{session=await KivoAuth.session();if(!session)return location.replace('login.html');loadBalance();})();
})();
