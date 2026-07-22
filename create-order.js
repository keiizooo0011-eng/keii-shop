
import { adminClient, createSanpayQris, uniqueFee, invoiceId, publicOrder } from "./_lib.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method tidak diizinkan." });

  try {
    const db = adminClient();
    const productId = String(req.body?.product_id || "").trim();
    const variantIndex = Number(req.body?.variant_index || 0);
    const customerName = String(req.body?.customer_name || "").trim();
    const customerContact = String(req.body?.customer_contact || "").trim();
    if (!productId || !customerName || !customerContact) {
      return res.status(400).json({ error: "Data checkout belum lengkap." });
    }

    const { data: product, error: pe } = await db.from("products").select("*")
      .eq("id", productId).eq("is_active", true).maybeSingle();
    if (pe) throw pe;
    if (!product) return res.status(404).json({ error: "Produk tidak ditemukan." });

    const variants = Array.isArray(product.variants) ? product.variants : [];
    const variant = variants[variantIndex] || { name:"Paket utama", price:product.price };
    const variantName = String(variant.name || "Paket utama");
    const baseAmount = Number(variant.price ?? product.price);

    // Cek stok varian lebih dulu. Jika stok lama belum diberi nama varian yang sama,
    // gunakan stok tersedia milik produk agar angka stok kartu dan checkout tetap sinkron.
    const { count: exactCount, error: exactError } = await db.from("stock_items")
      .select("id", { count:"exact", head:true })
      .eq("product_id", product.id).eq("variant_name", variantName).eq("status","available");
    if (exactError) throw exactError;

    let availableCount = Number(exactCount || 0);
    if (availableCount <= 0) {
      const { count: productCount, error: productStockError } = await db.from("stock_items")
        .select("id", { count:"exact", head:true })
        .eq("product_id", product.id).eq("status","available");
      if (productStockError) throw productStockError;
      availableCount = Number(productCount || 0);
    }
    if (availableCount <= 0) return res.status(409).json({ error: "Stok produk ini sedang habis." });

    const fee = uniqueFee();
    const paymentAmount = baseAmount + fee;
    const invoice = invoiceId();
    const expiresAt = new Date(Date.now() + Number(process.env.PAYMENT_EXPIRE_MINUTES || 10) * 60000).toISOString();

    const { data: order, error: oe } = await db.from("orders").insert({
      invoice, product_id:product.id, product_name:product.name, variant_name:variantName,
      amount:baseAmount, payment_amount:paymentAmount, unique_fee:fee,
      customer_name:customerName, customer_contact:customerContact,
      status:"pending", expires_at:expiresAt
    }).select("*").single();
    if (oe) throw oe;

    // Kunci satu stok khusus untuk invoice ini sebelum QRIS dibuat.
    const reserved = await db.rpc("reserve_order_stock", { p_order_id: order.id });
    if (reserved.error) {
      await db.from("orders").update({status:"cancelled",updated_at:new Date().toISOString()}).eq("id",order.id);
      const msg = String(reserved.error.message || "");
      if (msg.includes("STOCK_EMPTY")) return res.status(409).json({error:"Stok paket ini baru saja habis."});
      throw reserved.error;
    }

    try {
      const payment = await createSanpayQris(paymentAmount, invoice, `Order ${product.name} - ${variantName}`);
      const { error: ue } = await db.from("orders").update({
        payment_reference:payment.transactionId,
        qr_content:payment.qrContent || null,
        qr_image:payment.qrImage || null,
        payment_raw:payment.raw
      }).eq("id",order.id);
      if (ue) throw ue;

      return res.status(200).json({
        order:publicOrder({...order,payment_amount:paymentAmount}),
        qr_content:payment.qrContent, qr_image:payment.qrImage, expires_at:expiresAt
      });
    } catch (e) {
      await db.rpc("release_order_stock", { p_order_id: order.id });
      await db.from("orders").update({status:"cancelled",payment_raw:{error:e.message},updated_at:new Date().toISOString()}).eq("id",order.id);
      throw e;
    }
  } catch (e) {
    console.error("CREATE ORDER ERROR", e);
    return res.status(500).json({ error:e.message || "Gagal membuat pembayaran." });
  }
}
