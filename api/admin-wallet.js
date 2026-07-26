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
async function listAuthUsers(db){
  const users=[];
  for(let page=1;page<=10;page++){
    const{data,error}=await db.auth.admin.listUsers({page,perPage:200});
    if(error)throw error;
    users.push(...(data?.users||[]));
    if((data?.users||[]).length<200)break;
  }
  return users;
}
function profileName(p={},auth={}){
  return p.full_name||p.display_name||p.username||auth?.user_metadata?.full_name||auth?.user_metadata?.username||auth?.email?.split('@')[0]||'Pengguna KivoPay';
}
export default async function handler(req,res){
  try{
    const{db,adminUser}=await requireAdmin(req);
    if(req.method==='GET'){
      // Akun pengguna adalah data utama. Query tambahan tidak boleh membuat dropdown gagal.
      const profilesResult=await db.from('profiles').select('user_id,display_name,full_name,username,balance,created_at').order('balance',{ascending:false}).limit(1000);
      if(profilesResult.error)throw profilesResult.error;
      const profiles=profilesResult.data||[];

      let authUsers=[];
      let authWarning='';
      try{authUsers=await listAuthUsers(db)}catch(error){authWarning=error.message||'Daftar Auth tidak dapat dimuat.'}
      const authMap=new Map(authUsers.map(u=>[u.id,u]));
      const profileMap=new Map(profiles.map(p=>[p.user_id,p]));
      const ids=new Set([...authMap.keys(),...profileMap.keys()]);
      const users=Array.from(ids).map(userId=>{
        const auth=authMap.get(userId)||{};
        const p=profileMap.get(userId)||{};
        return{
          user_id:userId,
          ...p,
          balance:Number(p.balance||0),
          email:auth.email||'',
          username:p.username||auth?.user_metadata?.username||'',
          display_name:profileName(p,auth)
        };
      }).sort((a,b)=>b.balance-a.balance||String(a.display_name).localeCompare(String(b.display_name)));

      let deposits=[],transactions=[];
      const warnings=[];
      const depositsResult=await db.from('deposits').select('id,user_id,invoice,amount,payment_amount,unique_fee,status,created_at,paid_at,expires_at').order('created_at',{ascending:false}).limit(150);
      if(depositsResult.error)warnings.push(`Riwayat deposit: ${depositsResult.error.message}`);else deposits=depositsResult.data||[];
      const transactionsResult=await db.from('wallet_transactions').select('id,user_id,reference,type,amount,balance_after,description,metadata,created_at').order('created_at',{ascending:false}).limit(200);
      if(transactionsResult.error)warnings.push(`Audit saldo: ${transactionsResult.error.message}`);else transactions=transactionsResult.data||[];
      if(authWarning)warnings.push(`Akun Auth: ${authWarning}`);

      const decorate=row=>{
        const auth=authMap.get(row.user_id)||{};
        const p=profileMap.get(row.user_id)||{};
        return{...row,email:auth.email||'',display_name:profileName(p,auth)};
      };
      const completed=deposits.filter(x=>x.status==='completed');
      return json(res,200,{ok:true,
        warnings,
        stats:{
          total_balance:profiles.reduce((n,p)=>n+Number(p.balance||0),0),
          total_deposit:completed.reduce((n,d)=>n+Number(d.amount||0),0),
          completed_deposits:completed.length,
          pending_deposits:deposits.filter(x=>x.status==='pending').length
        },
        users,
        deposits:deposits.map(decorate),
        transactions:transactions.map(decorate)
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
      const{data:existingProfile,error:profileLookupError}=await db.from('profiles').select('user_id').eq('user_id',userId).maybeSingle();
      if(profileLookupError)throw profileLookupError;
      if(!existingProfile){
        const{data:authUserData,error:authUserError}=await db.auth.admin.getUserById(userId);
        if(authUserError)throw authUserError;
        const authUser=authUserData?.user;
        const fallbackName=authUser?.user_metadata?.full_name||authUser?.user_metadata?.username||authUser?.email?.split('@')[0]||'Pengguna KivoPay';
        const{error:profileError}=await db.from('profiles').insert({user_id:userId,display_name:fallbackName,full_name:fallbackName,username:authUser?.user_metadata?.username||null,balance:0});
        if(profileError)throw profileError;
      }
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
