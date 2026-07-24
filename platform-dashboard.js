(() => {
  const formatIDR = value => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(value||0));
  const setText=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v};
  async function load(){
    try{
      const auth=window.KivoAuth;
      if(!auth?.db) return;
      const session=await auth.session();
      const user=session?.user;
      if(!user) return;
      const db=auth.db;
      let count=0, completed=0, pending=0, spending=0;
      const candidates=['orders','game_orders','robux_orders'];
      for(const table of candidates){
        try{
          const {data,error}=await db.from(table).select('*').eq('user_id',user.id).limit(100);
          if(error||!Array.isArray(data)) continue;
          count+=data.length;
          for(const row of data){
            const status=String(row.status||row.payment_status||'').toLowerCase();
            if(['completed','success','paid','settlement','delivered'].some(x=>status.includes(x))){completed++;spending+=Number(row.total||row.amount||row.price||0)}
            else if(!['failed','cancelled','expired'].some(x=>status.includes(x))) pending++;
          }
        }catch{}
      }
      setText('kpTotalTransactions',count);
      setText('kpCompletedTransactions',completed);
      setText('kpPendingTransactions',pending);
      setText('kpTotalSpending',formatIDR(spending));
      const name=user.user_metadata?.full_name||user.user_metadata?.username||user.email?.split('@')[0]||'Member';
      setText('kpDashboardGreeting',`Halo, ${name}`);
    }catch(err){console.debug('Kivo dashboard:',err)}
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',load):load();
})();
