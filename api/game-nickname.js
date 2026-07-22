import { vipRequest } from "./_vipayment.js";
export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Method tidak diizinkan."});
  try{
    const {code,target,zone}=req.body||{};
    if(!code||!target) return res.status(400).json({error:"Kode game dan ID wajib diisi."});
    const r=await vipRequest({type:"get-nickname",code:String(code),target:String(target),additional_target:String(zone||"")});
    return res.status(200).json({nickname:r.data||"",country:r.country||null,message:r.message||"Success"});
  }catch(e){return res.status(400).json({error:e.message||"Nickname tidak ditemukan."});}
}
