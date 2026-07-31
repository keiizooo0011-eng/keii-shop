import { optionalAuthUser } from './_auth-user.js';
import { adminClient } from './_lib.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET') return res.status(405).json({error:'Method tidak diizinkan.'});
 const user=await optionalAuthUser(req); if(!user)return res.status(401).json({error:'Silakan masuk terlebih dahulu.'});
 try{
  const db=adminClient();
  const [{data:settings},{data:membership},profileByUser]=await Promise.all([
   db.from('reseller_settings').select('*').eq('id','main').maybeSingle(),
   db.from('reseller_memberships').select('*').eq('user_id',user.id).maybeSingle(),
   db.from('profiles').select('balance').eq('user_id',user.id).maybeSingle()
  ]);
  let profile=profileByUser?.data||null;
  if(!profile){const fallback=await db.from('profiles').select('balance').eq('id',user.id).maybeSingle();profile=fallback.data||null;}
  return res.json({settings:settings||{is_open:true,join_price:50000},membership:membership||null,balance:Number(profile?.balance||0)});
 }catch(e){return res.status(500).json({error:e.message||'Gagal memuat status reseller.'});}
}
