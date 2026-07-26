import { adminClient, authClient } from './_lib.js';

function json(res,status,body){res.status(status).setHeader('Content-Type','application/json');return res.end(JSON.stringify(body))}
async function requireAdmin(req){
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token)throw new Error('Sesi admin tidak ditemukan.');
  const verifier=authClient();
  const{data:userData,error:userError}=await verifier.auth.getUser(token);
  const db=adminClient();
  if(userError||!userData?.user)throw new Error('Sesi admin tidak valid.');
  const{data:admin}=await db.from('admin_users').select('user_id').eq('user_id',userData.user.id).maybeSingle();
  if(!admin)throw new Error('Akses hanya untuk admin.');
  return{db,adminUser:userData.user};
}
async function authUsersMap(db){
  const users=[];
  for(let page=1;page<=10;page++){
    const{data,error}=await db.auth.admin.listUsers({page,perPage:200});
    if(error)throw error;
    users.push(...(data.users||[]));
    if((data.users||[]).length<200)break;
  }
  return new Map(users.map(u=>[u.id,u]));
}
export default async function handler(req,res){
  try{
    const{db,adminUser}=await requireAdmin(req);
    if(req.method==='GET'){
      const [authMapResult,profilesResult,depositsResult,transactionsResult]=await Promise.all([
        authUsersMap(db),
        db.from('profiles').select('user_id,display_name,full_name,username,balance,created_at').order('balance',{ascending:false}).limit(500),
        db.from('deposits').select('id,user_id,invoice,amount,pay_amount,status,created_at,paid_at,expires_at').order('created_at',{ascending:false}).limit(150),
        db.from('wallet_transactions').select('id,user_id,reference,type,amount,balance_after,description,metadata,created_at').order('created_at',{ascending:false}).limit(200)
      ]);
      const authMap=authMapResult;
      if(profilesResult.error)throw profilesResult.error;
      if(depositsResult.error)throw depositsResult.error;
      if(transactionsResult.error)throw transactionsResult.error;
      const profiles=profilesResult.data||[],deposits=depositsResult.data||[],transactions=transactionsResult.data||[];
      const decorate=(row)=>{const auth=authMap.get(row.user_id);const p=profiles.find(x=>x.user_id===row.user_id)||{};return{...row,email:auth?.email||'',display_name:p.full_name||p.display_name||p.username||auth?.user_metadata?.full_name||'Pengguna KivoPay'}};
      const completed=deposits.filter(x=>x.status==='completed');
      return json(res,200,{ok:true,
        stats:{total_balance:profiles.reduce((n,p)=>n+Number(p.balance||0),0),total_deposit:completed.reduce((n,d)=>n+Number(d.amount||0),0),completed_deposits:completed.length,pending_deposits:deposits.filter(x=>x.status==='pending').length},
        users:profiles.map(p=>{const auth=authMap.get(p.user_id);return{...p,balance:Number(p.balance||0),email:auth?.email||'',display_name:p.full_name||p.display_name||p.username||auth?.user_metadata?.full_name||'Pengguna KivoPay'}}),
        deposits:deposits.map(decorate),transactions:transactions.map(decorate)
      });
    }
    if(req.method==='POST'){
      const body=req.body||{};
      const userId=String(body.user_id||'');
      const operation=String(body.operation||'');
      const amount=Math.trunc(Number(body.amount||0));
      const reason=String(body.reason||'').trim();
      if(!userId)return json(res,400,{ok:false,message:'Pilih akun pengguna.'});
      if(!['add','subtract'].includes(operation))return json(res,400,{ok:false,message:'Jenis perubahan saldo tidak valid.'});
      if(!Number.isSafeInteger(amount)||amount<1000||amount>100000000)return json(res,400,{ok:false,message:'Nominal harus antara Rp1.000 dan Rp100.000.000.'});
      if(reason.length<5)return json(res,400,{ok:false,message:'Alasan perubahan saldo minimal 5 karakter.'});
      const reference=`ADMIN-${operation.toUpperCase()}-${Date.now()}-${userId.slice(0,8)}`;
      const{data,error}=await db.rpc('admin_adjust_wallet',{p_user_id:userId,p_amount:amount,p_operation:operation,p_reference:reference,p_reason:reason,p_admin_user_id:adminUser.id});
      if(error)throw error;
      return json(res,200,{ok:true,message:operation==='add'?'Saldo berhasil ditambahkan.':'Saldo berhasil dikurangi.',result:data,reference});
    }
    res.setHeader('Allow','GET, POST');
    return json(res,405,{ok:false,message:'Method tidak didukung.'});
  }catch(error){
    const message=error.message||'Terjadi kesalahan.';
    const status=/admin|sesi/i.test(message)?401:/INSUFFICIENT_BALANCE/i.test(message)?400:500;
    return json(res,status,{ok:false,message:message.replace('INSUFFICIENT_BALANCE','Saldo pengguna tidak mencukupi.')});
  }
}
