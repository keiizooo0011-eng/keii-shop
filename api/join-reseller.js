import crypto from 'node:crypto';
import { optionalAuthUser } from './_auth-user.js';
import { adminClient } from './_lib.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST') return res.status(405).json({error:'Method tidak diizinkan.'});
 const user=await optionalAuthUser(req); if(!user)return res.status(401).json({error:'Silakan masuk terlebih dahulu.'});
 try{
  const db=adminClient();
  const {data:existing}=await db.from('reseller_memberships').select('*').eq('user_id',user.id).maybeSingle();
  if(existing?.status==='active') return res.status(409).json({error:'Akun kamu sudah menjadi reseller.'});
  const {data:settings,error:se}=await db.from('reseller_settings').select('*').eq('id','main').single(); if(se)throw se;
  if(!settings.is_open)return res.status(403).json({error:'Pendaftaran reseller sedang ditutup.'});
  const price=Number(settings.join_price||0);
  const ref=`RESELLER-JOIN:${user.id}:${Date.now()}`;
  const debit=await db.rpc('wallet_debit',{p_user_id:user.id,p_amount:price,p_reference:ref,p_description:'Pendaftaran KivoPay Reseller',p_metadata:{type:'reseller_join'}});
  if(debit.error){
   if(String(debit.error.message||'').includes('INSUFFICIENT_BALANCE'))return res.status(402).json({error:'Saldo KivoPay tidak cukup.',need_deposit:true});
   throw debit.error;
  }
  const code=`KVP-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const payload={user_id:user.id,status:'active',reseller_code:code,joined_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  const query=existing?db.from('reseller_memberships').update(payload).eq('user_id',user.id):db.from('reseller_memberships').insert(payload);
  const {data,error}=await query.select('*').single();
  if(error){await db.rpc('wallet_refund',{p_user_id:user.id,p_amount:price,p_reference:`REFUND:${ref}`,p_description:'Pengembalian pendaftaran reseller',p_metadata:{reason:error.message}});throw error;}
  return res.json({membership:data,balance_after:debit.data?.balance});
 }catch(e){return res.status(500).json({error:e.message||'Gagal bergabung sebagai reseller.'});}
}
