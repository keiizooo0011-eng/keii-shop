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
    const customerEmail = String(req.body?.customer_email || "").trim().toLowerCase();
    const paymentMethod = String(req.body?.payment_method || "qris").toLowerCase() === "balance" ? "balance" : "qris";
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

    const isManualPanel = product.category === "panel-pterodactyl";
    const apkMode = String(product.delivery_mode || "automatic");
    const isManualApk = product.category === "apk-premium" && ["manual", "invite"].includes(apkMode);
    const isInviteApk = product.category === "apk-premium" && apkMode === "invite";
    if (isInviteApk && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return res.status(400).json({ error: "Email aktif wajib diisi untuk produk invite." });
    }
    const isManualDelivery = isManualPanel || isManualApk;

    // Stok lama V17 sering tersimpan sebagai "Paket utama". Cek stok paket
    // yang dipilih dahulu, lalu fallback hanya ke "Paket utama" (bukan paket lain).
    const compatibleNames = variantName.toLowerCase() === "paket utama"
      ? [variantName]
      : [variantName, "Paket utama"];

    const { count, error: stockError } = isManualDelivery ? { count: Number(product.stock || 0), error: null } : await db.from("stock_items")
      .select("id", { count: "exact", head: true })
      .eq("product_id", product.id)
      .eq("status", "available")
      .in("variant_name", compatibleNames);
    if (stockError) throw stockError;
    if (!Number(count || 0)) {
      return res.status(409).json({ error: "Stok paket ini sedang habis." });
    }

    const fee = paymentMethod === "balance" ? 0 : uniqueFee();
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
      customer_email: customerEmail || null,
      user_id: authUser?.id || null,
      status: "pending",
      order_type: isManualPanel ? "panel-pterodactyl" : product.category,
      delivery_mode: isInviteApk ? "invite" : isManualApk ? "manual" : "automatic",
      payment_method: paymentMethod,
      expires_at: expiresAt
    }).select("*").single();
    if (oe) throw oe;

    let balanceDebited = false;
    try {
      if (paymentMethod === "balance") {
        if (!authUser) throw new Error("Silakan masuk untuk menggunakan Saldo KivoPay.");
        const reserved = isManualDelivery ? { error: null } : await db.rpc("reserve_order_stock", { p_order_id: order.id });
        if (reserved.error) throw reserved.error;
        const debit = await db.rpc("wallet_debit", {
          p_user_id: authUser.id, p_amount: baseAmount, p_reference: `ORDER:${invoice}`,
          p_description: `Pembayaran ${product.name}`, p_metadata: { order_id: order.id, invoice }
        });
        if (debit.error) {
          if (!isManualDelivery) try { await db.rpc("release_order_stock", { p_order_id: order.id }); } catch {}
          if (String(debit.error.message || "").includes("INSUFFICIENT_BALANCE")) return res.status(402).json({ error: "Saldo KivoPay tidak cukup.", need_deposit: true });
          throw debit.error;
        }
        balanceDebited = true;
        if (isManualDelivery) {
          const consumed = await db.rpc("complete_manual_balance_order", { p_order_id: order.id });
          if (consumed.error) throw consumed.error;
        } else {
          const { data: stock } = await db.from("stock_items").select("*").eq("order_id", order.id).eq("status", "reserved").maybeSingle();
          if (!stock) throw new Error("Stok pesanan tidak berhasil diamankan.");
          await db.from("stock_items").update({ status: "sold", sold_at: new Date().toISOString() }).eq("id", stock.id);
          await db.from("orders").update({ status: "completed", paid_at: new Date().toISOString(), delivered_at: new Date().toISOString(), delivery_content: stock.content, updated_at: new Date().toISOString() }).eq("id", order.id);
          await db.from("products").update({ stock: Math.max(Number(product.stock || 0) - 1, 0), updated_at: new Date().toISOString() }).eq("id", product.id);
        }
        const { data: fresh } = await db.from("orders").select("*").eq("id", order.id).single();
        return res.status(200).json({ order: publicOrder(fresh || order), payment_method: "balance", balance_after: debit.data?.balance });
      }
      const payment = await createSanpayQris(
        paymentAmount,
        invoice,
        `Order ${product.name} - ${variantName}`
      );

      const reserved = isManualDelivery ? { error: null } : await db.rpc("reserve_order_stock", { p_order_id: order.id });
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
      if (balanceDebited && authUser) {
        try { await db.rpc("wallet_refund", { p_user_id: authUser.id, p_amount: baseAmount, p_reference: `REFUND:ORDER:${invoice}`, p_description: `Pengembalian ${invoice}`, p_metadata: { reason: error.message } }); } catch {}
      }
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
