import { vipRequest } from "./_vipayment.js";
export default async function handler(req,res){
  res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=600");
  if(req.method!=="GET") return res.status(405).json({error:"Method tidak diizinkan."});
  try{
    const filter=String(req.query?.game||"").trim();
    const r=await vipRequest({type:"services",filter_game:filter,filter_status:"available"});
    const rows=Array.isArray(r.data)?r.data:[];
    const services=rows.filter(x=>String(x.status||"").toLowerCase()==="available").map(x=>({
      code:String(x.code||""), game:String(x.game||"Game"), name:String(x.name||x.service||"Paket"),
      price:Number(x.price?.special ?? x.price?.premium ?? x.price?.basic ?? x.price ?? 0),
      description:String(x.description||""), server:String(x.server||""), status:String(x.status||"")
    }));
    return res.status(200).json({services});
  }catch(e){return res.status(500).json({error:e.message||"Gagal mengambil layanan."});}
}
