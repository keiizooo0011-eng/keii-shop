import { optionalAuthUser } from './_auth-user.js';
import { adminClient, createSanpayQris, uniqueFee, invoiceId, publicOrder } from "./_lib.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method tidak diizinkan." });

  try {
    const db = adminClient();
    const authUser = await optionalAuthUser(req);
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
    const variant = variants[variantIndex] || { name: "Paket utama", price: product.price };
    const variantName = String(variant.name || "Paket utama").trim();
    const baseAmount = Number(variant.price ?? product.price);

    // Stok lama V17 sering tersimpan sebagai "Paket utama". Cek stok paket
    // yang dipilih dahulu, lalu fallback hanya ke "Paket utama" (bukan paket lain).
    const compatibleNames = variantName.toLowerCase() === "paket utama"
      ? [variantName]
      : [variantName, "Paket utama"];

    const { count, error: stockError } = await db.from("stock_items")
      .select("id", { count: "exact", head: true })
      .eq("product_id", product.id)
      .eq("status", "available")
      .in("variant_name", compatibleNames);
    if (stockError) throw stockError;
    if (!Number(count || 0)) {
      return res.status(409).json({ error: "Stok paket ini sedang habis." });
    }

    const fee = uniqueFee();
    const paymentAmount = baseAmount + fee;
    const invoice = invoiceId();
    const expiresAt = new Date(Date.now() + Number(process.env.PAYMENT_EXPIRE_MINUTES || 10) * 60000).toISOString();

    const { data: order, error: oe } = await db.from("orders").insert({
      invoice,
      product_id: product.id,
      product_name: product.name,
      variant_name: variantName,
      amount: baseAmount,
      payment_amount: paymentAmount,
      unique_fee: fee,
      customer_name: customerName,
      customer_contact: customerContact,
      user_id: authUser?.id || null,
      status: "pending",
      expires_at: expiresAt
    }).select("*").single();
    if (oe) throw oe;

    try {
      const payment = await createSanpayQris(
        paymentAmount,
        invoice,
        `Order ${product.name} - ${variantName}`
      );

      const reserved = await db.rpc("reserve_order_stock", { p_order_id: order.id });
      if (reserved.error) {
        const message = String(reserved.error.message || "");
        await db.from("orders").update({
          status: "cancelled",
          payment_raw: { error: message },
          updated_at: new Date().toISOString()
        }).eq("id", order.id);
        if (message.includes("STOCK_EMPTY")) {
          return res.status(409).json({ error: "Stok paket ini baru saja habis." });
        }
        throw reserved.error;
      }

      const { error: ue } = await db.from("orders").update({
        payment_reference: payment.transactionId,
        qr_content: payment.qrContent || null,
        qr_image: payment.qrImage || null,
        payment_raw: payment.raw
      }).eq("id", order.id);
      if (ue) throw ue;

      return res.status(200).json({
        order: publicOrder({
          ...order,
          payment_amount: paymentAmount,
          qr_content: payment.qrContent,
          qr_image: payment.qrImage
        }),
        qr_content: payment.qrContent,
        qr_image: payment.qrImage,
        expires_at: expiresAt
      });
    } catch (error) {
      try { await db.rpc("release_order_stock", { p_order_id: order.id }); } catch {}
      await db.from("orders").update({
        status: "cancelled",
        payment_raw: { error: error.message },
        updated_at: new Date().toISOString()
      }).eq("id", order.id);
      throw error;
    }
  } catch (error) {
    console.error("CREATE ORDER ERROR", error);
    return res.status(500).json({ error: error.message || "Gagal membuat pembayaran." });
  }
}
