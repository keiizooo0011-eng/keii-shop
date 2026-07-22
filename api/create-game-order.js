import { adminClient, createSanpayQris, uniqueFee, invoiceId } from "./_lib.js";
import { vipRequest } from "./_vipayment.js";
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST") return res.status(405).json({error:"Method tidak diizinkan."});
  try{
    const service=String(req.body?.service||"").trim(), target=String(req.body?.target||"").trim(), zone=String(req.body?.zone||"").trim();
    const customerName=String(req.body?.customer_name||"").trim(), customerContact=String(req.body?.customer_contact||"").trim();
    if(!service||!target||!customerName||!customerContact) return res.status(400).json({error:"Data checkout belum lengkap."});
    const catalog=await vipRequest({type:"services",filter_status:"available"});
    const item=(Array.isArray(catalog.data)?catalog.data:[]).find(x=>String(x.code)===service && String(x.status).toLowerCase()==="available");
    if(!item) return res.status(409).json({error:"Layanan sedang tidak tersedia."});
    const cost=Number(item.price?.special ?? item.price?.premium ?? item.price?.basic ?? item.price ?? 0);
    const markup=Math.max(Number(process.env.VIPAYMENT_MARKUP_FLAT||500),Math.ceil(cost*Number(process.env.VIPAYMENT_MARKUP_PERCENT||5)/100));
    const amount=cost+markup, fee=uniqueFee(), paymentAmount=amount+fee, invoice=invoiceId();
    const expiresAt=new Date(Date.now()+Number(process.env.PAYMENT_EXPIRE_MINUTES||10)*60000).toISOString();
    const payment=await createSanpayQris(paymentAmount,invoice,`Top Up ${item.game} - ${item.name}`);
    const db=adminClient();
    const {data,error}=await db.from("game_orders").insert({invoice,service_code:service,game_name:item.game,service_name:item.name,target,zone:zone||null,cost_price:cost,sell_price:amount,payment_amount:paymentAmount,unique_fee:fee,customer_name:customerName,customer_contact:customerContact,status:"pending",expires_at:expiresAt,payment_reference:payment.transactionId,qr_content:payment.qrContent||null,qr_image:payment.qrImage||null,payment_raw:payment.raw}).select("*").single();
    if(error) throw error;
    return res.status(200).json({order:{invoice:data.invoice,game_name:data.game_name,service_name:data.service_name,target:data.target,zone:data.zone,payment_amount:data.payment_amount,status:data.status,expires_at:data.expires_at,qr_content:data.qr_content,qr_image:data.qr_image}});
  }catch(e){console.error("CREATE GAME ORDER",e);return res.status(500).json({error:e.message||"Gagal membuat pesanan game."});}
}
