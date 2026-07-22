import { adminClient } from "./_lib.js";
export default async function handler(req,res){
  res.setHeader("Cache-Control","s-maxage=120, stale-while-revalidate=300");
  try{const db=adminClient();const {data,error}=await db.from("game_catalog").select("*").eq("is_active",true).order("sort_order",{ascending:true});if(error)throw error;return res.status(200).json({games:data||[]});}catch(e){return res.status(200).json({games:[]});}
}
