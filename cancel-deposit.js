import { optionalAuthUser } from './_auth-user.js';
import { adminClient, getSanpayMutasi, mutationMatchesOrder, mutasiKey } from './_lib.js';

const publicDeposit=d=>({invoice:d.invoice,amount:d.amount,payment_amount:d.payment_amount,unique_fee:d.unique_fee,status:d.status,expires_at:d.expires_at,paid_at:d.paid_at,created_at:d.created_at,qr_content:d.qr_content||null,qr_image:d.qr_image||null});

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method tidak diizinkan.'});
  try{
    const user=await optionalAuthUser(req);if(!user)return res.status(401).json({error:'Silakan masuk terlebih dahulu.'});
    const invoice=String(req.body?.invoice||'').trim();if(!invoice)return res.status(400).json({error:'Invoice wajib diisi.'});
    const db=adminClient();
    let {data:deposit,error}=await db.from('deposits').select('*').eq('invoice',invoice).eq('user_id',user.id).maybeSingle();
    if(error)throw error;if(!deposit)return res.status(404).json({error:'Deposit tidak ditemukan.'});
    if(deposit.status!=='pending')return res.status(409).json({error:`Deposit sudah berstatus ${deposit.status} dan tidak dapat dibatalkan.`});

    // Cek mutasi sekali lagi agar pembayaran yang sudah masuk tidak ikut dibatalkan.
    const mutations=await getSanpayMutasi();
    const match=mutations.find(m=>mutationMatchesOrder(m,deposit));
    if(match){
      const done=await db.rpc('complete_paid_deposit',{p_deposit_id:deposit.id,p_mutation_key:mutasiKey(match),p_mutation_data:match});
      if(done.error)throw done.error;
      const fresh=await db.from('deposits').select('*').eq('id',deposit.id).single();if(fresh.error)throw fresh.error;
      return res.status(409).json({error:'Pembayaran sudah terdeteksi. Deposit tidak dapat dibatalkan.',deposit:publicDeposit(fresh.data)});
    }

    const {data:cancelled,error:cancelError}=await db.from('deposits').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',deposit.id).eq('status','pending').select('*').maybeSingle();
    if(cancelError)throw cancelError;if(!cancelled)return res.status(409).json({error:'Status deposit sudah berubah. Silakan refresh halaman.'});
    return res.status(200).json({message:'Deposit berhasil dibatalkan.',deposit:publicDeposit(cancelled)});
  }catch(error){console.error('CANCEL DEPOSIT ERROR',error);return res.status(500).json({error:error.message||'Gagal membatalkan deposit.'});}
}
