import { optionalAuthUser } from './_auth-user.js';
import { adminClient, createSanpayQris, uniqueFee, invoiceId } from './_lib.js';

const publicDeposit = d => ({invoice:d.invoice,amount:d.amount,payment_amount:d.payment_amount,unique_fee:d.unique_fee,status:d.status,expires_at:d.expires_at,paid_at:d.paid_at,created_at:d.created_at,qr_content:d.qr_content||null,qr_image:d.qr_image||null});

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({error:'Method tidak diizinkan.'});
  try{
    const user=await optionalAuthUser(req);
    if(!user) return res.status(401).json({error:'Silakan masuk terlebih dahulu.'});
    const amount=Math.round(Number(req.body?.amount||0));
    if(!Number.isFinite(amount)||amount<10000||amount>2000000||amount%1000!==0)
      return res.status(400).json({error:'Nominal deposit harus Rp10.000–Rp2.000.000 dan kelipatan Rp1.000.'});
    const db=adminClient(), fee=uniqueFee(), paymentAmount=amount+fee, invoice=invoiceId().replace('KIVO-','KIVO-DEP-');
    const expiresAt=new Date(Date.now()+Number(process.env.PAYMENT_EXPIRE_MINUTES||10)*60000).toISOString();
    const {data:deposit,error:insertError}=await db.from('deposits').insert({user_id:user.id,invoice,amount,payment_amount:paymentAmount,unique_fee:fee,status:'pending',expires_at:expiresAt}).select('*').single();
    if(insertError) throw insertError;
    try{
      const payment=await createSanpayQris(paymentAmount,invoice,`Deposit saldo KivoPay ${invoice}`);
      const {data:updated,error:updateError}=await db.from('deposits').update({payment_reference:payment.transactionId,qr_content:payment.qrContent||null,qr_image:payment.qrImage||null,payment_raw:payment.raw,updated_at:new Date().toISOString()}).eq('id',deposit.id).select('*').single();
      if(updateError) throw updateError;
      return res.status(200).json({deposit:publicDeposit(updated)});
    }catch(error){
      await db.from('deposits').update({status:'cancelled',payment_raw:{error:error.message},updated_at:new Date().toISOString()}).eq('id',deposit.id);
      throw error;
    }
  }catch(error){console.error('CREATE DEPOSIT ERROR',error);return res.status(500).json({error:error.message||'Gagal membuat deposit.'});}
}
