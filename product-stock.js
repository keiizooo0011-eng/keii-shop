import { adminClient } from "./_lib.js";

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store, max-age=0");
  if(req.method!=="GET") return res.status(405).json({error:"Method tidak diizinkan."});
  try{
    const db=adminClient();
    const {data,error}=await db.from("stock_items")
      .select("product_id,variant_name,status")
      .in("status",["available","reserved"]);
    if(error) throw error;
    const products={};
    for(const item of data||[]){
      const pid=String(item.product_id);
      if(!products[pid]) products[pid]={available:0,reserved:0,variants:{}};
      const variant=String(item.variant_name||"Paket utama");
      if(!products[pid].variants[variant]) products[pid].variants[variant]={available:0,reserved:0};
      products[pid][item.status]=(products[pid][item.status]||0)+1;
      products[pid].variants[variant][item.status]=(products[pid].variants[variant][item.status]||0)+1;
    }
    return res.status(200).json({products});
  }catch(e){
    console.error("PRODUCT STOCK ERROR",e);
    return res.status(500).json({error:e.message||"Gagal memuat stok."});
  }
}
