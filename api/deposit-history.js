import { optionalAuthUser } from './_auth-user.js';
import { adminClient } from './_lib.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{const user=await optionalAuthUser(req);if(!user)return res.status(401).json({error:'Silakan masuk terlebih dahulu.'});const db=adminClient();const {data,error}=await db.from('deposits').select('invoice,amount,payment_amount,unique_fee,status,expires_at,paid_at,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(50);if(error)throw error;const {data:profile}=await db.from('profiles').select('balance').eq('user_id',user.id).maybeSingle();return res.status(200).json({balance:Number(profile?.balance||0),deposits:data||[]});}catch(error){return res.status(500).json({error:error.message||'Gagal memuat riwayat deposit.'});}
}
