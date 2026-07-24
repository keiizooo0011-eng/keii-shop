(async()=>{
  const entry=document.querySelector('#accountEntry');
  if(!entry||!window.KivoAuth)return;

  const label=entry.querySelector('b');
  const session=await KivoAuth.session();

  if(!session){
    entry.href='login.html?next=account.html';
    if(label)label.textContent='Masuk';
    entry.classList.remove('signed-in');
    entry.setAttribute('aria-label','Masuk ke akun KivoPay');
    return;
  }

  const admin=await KivoAuth.isAdmin(session.user.id);
  entry.href=admin?'admin.html':'account.html';
  if(label)label.textContent=admin?'Panel Admin':'Profil';
  entry.classList.add('signed-in');
  entry.setAttribute('aria-label',admin?'Buka panel admin':'Buka profil akun');
})();
