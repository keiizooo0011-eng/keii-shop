import { adminClient, createSanpayQris, uniqueFee } from './_lib.js';
import crypto from 'node:crypto';

const clean = (v, max=200) => String(v ?? '').trim().slice(0,max);
const invoiceId = () => `RBX-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({error:'Method tidak diizinkan.'});
  try{
    const db=adminClient();
    const methodId=clean(req.body?.method_id,60), packageId=clean(req.body?.package_id,60);
    const username=clean(req.body?.username,40), whatsapp=clean(req.body?.whatsapp,20);
    if(!methodId||!packageId||!username||!whatsapp) return res.status(400).json({error:'Username Roblox, nomor WhatsApp, metode, dan paket wajib diisi.'});

    const [{data:method,error:me},{data:pack,error:pe}] = await Promise.all([
      db.from('robux_methods').select('*').eq('id',methodId).eq('is_active',true).maybeSingle(),
      db.from('robux_packages').select('*').eq('id',packageId).eq('method_id',methodId).eq('is_active',true).maybeSingle()
    ]);
    if(me) throw me; if(pe) throw pe;
    if(!method||!pack) return res.status(404).json({error:'Metode atau paket Robux tidak tersedia.'});

    const isLogin=method.form_type==='login';
    const password=clean(req.body?.password,120);
    const backupCodes=[clean(req.body?.backup_code_1,80),clean(req.body?.backup_code_2,80),clean(req.body?.backup_code_3,80)];
    if(isLogin && (!password || backupCodes.some(x=>!x))) return res.status(400).json({error:'Via Login wajib mengisi password dan 3 backup code.'});

    const fee=uniqueFee(), amount=Number(pack.price||0), paymentAmount=amount+fee;
    const invoice=invoiceId();
    const expiresAt=new Date(Date.now()+Number(process.env.PAYMENT_EXPIRE_MINUTES||10)*60000).toISOString();
    const {data:order,error:oe}=await db.from('robux_orders').insert({
      invoice,method_id:method.id,package_id:pack.id,method_name:method.name,package_label:pack.label,
      robux_amount:pack.robux_amount,amount,payment_amount:paymentAmount,unique_fee:fee,
      username,whatsapp,password:isLogin?password:null,backup_codes:isLogin?backupCodes:[],
      status:'pending',expires_at:expiresAt
    }).select('*').single();
    if(oe) throw oe;

    try{
      const payment=await createSanpayQris(paymentAmount,invoice,`Top Up ${pack.label} - ${method.name}`);
      const {error:ue}=await db.from('robux_orders').update({
        payment_reference:payment.transactionId,qr_content:payment.qrContent||null,qr_image:payment.qrImage||null,payment_raw:payment.raw
      }).eq('id',order.id);
      if(ue) throw ue;
      return res.status(200).json({order:publicRobux(order),qr_content:payment.qrContent,qr_image:payment.qrImage,expires_at:expiresAt});
    }catch(e){
      await db.from('robux_orders').update({status:'cancelled',payment_raw:{error:e.message}}).eq('id',order.id);
      throw e;
    }
  }catch(e){
    console.error('CREATE ROBUX ORDER ERROR',e);
    return res.status(500).json({error:e.message||'Gagal membuat pembayaran Robux.'});
  }
}

function publicRobux(o){return {invoice:o.invoice,method_name:o.method_name,package_label:o.package_label,robux_amount:o.robux_amount,amount:o.amount,payment_amount:o.payment_amount,username:o.username,whatsapp:o.whatsapp,status:o.status,expires_at:o.expires_at,paid_at:o.paid_at,created_at:o.created_at};}
