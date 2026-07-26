import { optionalAuthUser } from './_auth-user.js';
import { adminClient, getSanpayMutasi, mutationMatchesOrder, mutasiKey } from './_lib.js';
const publicDeposit=d=>({invoice:d.invoice,amount:d.amount,payment_amount:d.payment_amount,unique_fee:d.unique_fee,status:d.status,expires_at:d.expires_at,paid_at:d.paid_at,created_at:d.created_at,qr_content:d.qr_content||null,qr_image:d.qr_image||null});
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    const user=await optionalAuthUser(req); if(!user)return res.status(401).json({error:'Silakan masuk terlebih dahulu.'});
    const invoice=String(req.query?.invoice||req.body?.invoice||'').trim(); if(!invoice)return res.status(400).json({error:'Invoice wajib diisi.'});
    const db=adminClient(); let {data:deposit,error}=await db.from('deposits').select('*').eq('invoice',invoice).eq('user_id',user.id).maybeSingle();
    if(error)throw error; if(!deposit)return res.status(404).json({error:'Deposit tidak ditemukan.'});
    if(deposit.status==='pending'&&new Date(deposit.expires_at).getTime()<=Date.now()){
      const expired=await db.rpc('expire_pending_deposit',{p_deposit_id:deposit.id}); if(expired.error)throw expired.error;
      const fresh=await db.from('deposits').select('*').eq('id',deposit.id).single(); if(fresh.error)throw fresh.error; deposit=fresh.data;
    }
    if(deposit.status==='pending'){
      const mutations=await getSanpayMutasi(); const match=mutations.find(m=>mutationMatchesOrder(m,deposit));
      if(match){const done=await db.rpc('complete_paid_deposit',{p_deposit_id:deposit.id,p_mutation_key:mutasiKey(match),p_mutation_data:match});if(done.error)throw done.error;const fresh=await db.from('deposits').select('*').eq('id',deposit.id).single();if(fresh.error)throw fresh.error;deposit=fresh.data;}
    }
    return res.status(200).json({deposit:publicDeposit(deposit)});
  }catch(error){console.error('CHECK DEPOSIT ERROR',error);return res.status(500).json({error:error.message||'Gagal mengecek deposit.'});}
}
