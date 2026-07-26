import { adminClient } from "./_lib.js";

function maskName(value) {
  const first = String(value || "Pelanggan").trim().split(/\s+/)[0] || "Pelanggan";
  if (first.length <= 1) return `${first.toUpperCase()}***`;
  if (first.length === 2) return `${first[0].toUpperCase()}***`;
  return `${first.slice(0, 2).replace(/^./, c => c.toUpperCase())}${"*".repeat(Math.min(4, Math.max(2, first.length - 2)))}`;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "public, s-maxage=8, stale-while-revalidate=20");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ ok:false, message:"Method tidak didukung." });

  try {
    const db = adminClient();
    const { data, error } = await db
      .from("orders")
      .select("id,customer_name,product_name,variant_name,amount,payment_amount,status,created_at")
      .in("status", ["paid", "processing", "completed"])
      .order("created_at", { ascending:false })
      .limit(12);

    if (error) throw error;

    const orders = (data || []).map(order => ({
      id: order.id,
      customer_name: maskName(order.customer_name),
      product_name: order.product_name || "Produk Digital",
      variant_name: order.variant_name || "Paket utama",
      amount: Number(order.payment_amount || order.amount || 0),
      status: order.status,
      created_at: order.created_at
    }));

    return res.status(200).json({ ok:true, orders });
  } catch (error) {
    console.error("live-orders:", error);
    return res.status(500).json({ ok:false, message:"Aktivitas transaksi belum dapat dimuat." });
  }
}
