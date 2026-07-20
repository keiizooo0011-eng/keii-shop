
import { adminClient } from "./_lib.js";

const clean = value => String(value || "").trim();

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method tidak diizinkan." });
  }

  try {
    const db = adminClient();
    const invoice = clean(req.body?.invoice).toUpperCase();
    const contact = clean(req.body?.contact);
    const rating = Number(req.body?.rating);
    const review = clean(req.body?.review).slice(0, 500);

    if (!invoice || !contact || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Data rating belum lengkap." });
    }

    const { data: order, error: orderError } = await db
      .from("orders")
      .select("id,product_id,invoice,customer_name,customer_contact,status")
      .eq("invoice", invoice)
      .maybeSingle();

    if (orderError) throw orderError;
    if (!order) return res.status(404).json({ error: "Invoice tidak ditemukan." });
    if (order.status !== "completed") {
      return res.status(409).json({ error: "Rating hanya dapat diberikan setelah pesanan selesai." });
    }

    const normalizedStored = clean(order.customer_contact).replace(/\s+/g, "");
    const normalizedInput = contact.replace(/\s+/g, "");
    if (normalizedStored !== normalizedInput) {
      return res.status(403).json({ error: "Kontak tidak cocok dengan pesanan." });
    }

    const { data, error } = await db
      .from("product_ratings")
      .upsert({
        order_id: order.id,
        product_id: order.product_id,
        invoice: order.invoice,
        customer_name: order.customer_name,
        rating,
        review,
        is_visible: true,
        updated_at: new Date().toISOString()
      }, { onConflict: "order_id" })
      .select("id,rating,review,created_at")
      .single();

    if (error) throw error;
    return res.status(200).json({ rating: data });
  } catch (error) {
    console.error("SUBMIT RATING ERROR", error);
    return res.status(500).json({ error: error.message || "Gagal menyimpan rating." });
  }
}
