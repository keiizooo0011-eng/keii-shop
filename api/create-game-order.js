import { optionalAuthUser } from './_auth-user.js';
import { adminClient, createSanpayQris, uniqueFee, invoiceId } from "./_lib.js";
import { vipaymentRequest, vipaymentRows, vipaymentService } from "./_vipayment.js";

function isActive(status) {
  return String(status || "available").toLowerCase() === "available";
}

function categoryOf(name) {
  const n = String(name || "").toLowerCase();
  const streaming = ["iqiyi", "netflix", "spotify", "youtube", "viu", "vidio", "wetv", "disney", "prime video", "hbo", "canva", "capcut", "alight motion", "bstation", "vision+", "mola", "loklok"];
  const voucher = ["voucher", "gift card", "steam wallet", "google play", "itunes", "playstation", "xbox", "garena shells", "razergold", "wallet"];
  if (streaming.some((key) => n.includes(key))) return "streaming";
  if (voucher.some((key) => n.includes(key))) return "voucher";
  return "other";
}

function usesStockValidation(name) {
  return ["streaming", "voucher"].includes(categoryOf(name));
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method tidak diizinkan." });

  try {
    const service = String(req.body?.service || "").trim();
    const target = String(req.body?.target || "").trim();
    const zone = String(req.body?.zone || "").trim();
    const additionalData = String(req.body?.additional_data || "").trim();
    const formData = req.body?.form_data && typeof req.body.form_data === 'object' ? req.body.form_data : {};
    const customerName = String(req.body?.customer_name || "").trim();
    const customerContact = String(req.body?.customer_contact || "").trim();
    const paymentMethod = String(req.body?.payment_method || "qris").toLowerCase() === "balance" ? "balance" : "qris";

    if (!service || !target || !customerName || !customerContact) {
      return res.status(400).json({ error: "Data checkout belum lengkap." });
    }

    const catalog = await vipaymentRequest("services", { filter_status: "available" });
    const item = vipaymentRows(catalog)
      .map(vipaymentService)
      .find((entry) => entry.code === service && isActive(entry.status));

    if (!item) return res.status(409).json({ error: "Layanan sedang tidak tersedia." });
    if (usesStockValidation(item.game) && item.stock !== null && item.stock < 1) {
      return res.status(409).json({ error: "Stok produk sedang habis. Silakan pilih produk lain." });
    }

    const db = adminClient();
    const authUser = await optionalAuthUser(req);
    const { data: gameConfig } = await db.from('game_catalog').select('form_schema').eq('vip_brand', item.game).maybeSingle();
    const schema = Array.isArray(gameConfig?.form_schema) ? gameConfig.form_schema : [];
    for (const field of schema) {
      const value = String(formData[field.key] ?? '').trim();
      if (field.required && !value) return res.status(400).json({ error: `${field.label || field.key} wajib diisi.` });
    }

    const cost = Number(item.price || 0);
    if (!cost) return res.status(409).json({ error: "Harga layanan VIPayment tidak valid." });

    const lowProfit = Number(process.env.VIPAYMENT_PROFIT_MIN || 2000);
    const maxProfit = Number(process.env.VIPAYMENT_PROFIT_MAX || 3000);
    const threshold = Number(process.env.VIPAYMENT_PROFIT_THRESHOLD || 10000);
    const amount = cost + (cost < threshold ? lowProfit : maxProfit);
    const fee = paymentMethod === "balance" ? 0 : uniqueFee();
    const paymentAmount = amount + fee;
    const invoice = invoiceId();
    const expiresAt = new Date(Date.now() + Number(process.env.PAYMENT_EXPIRE_MINUTES || 10) * 60000).toISOString();

    if (paymentMethod === "balance" && !authUser) return res.status(401).json({ error: "Silakan masuk untuk menggunakan Saldo KivoPay." });
    const payment = paymentMethod === "qris" ? await createSanpayQris(paymentAmount, invoice, `Top Up ${item.game} - ${item.name}`) : null;
    const { data, error } = await db
      .from("game_orders")
      .insert({
        invoice,
        service_code: service,
        game_name: item.game,
        service_name: item.name,
        target,
        zone: zone || null,
        additional_data: additionalData || null,
        form_data: formData,
        cost_price: cost,
        sell_price: amount,
        payment_amount: paymentAmount,
        unique_fee: fee,
        customer_name: customerName,
        customer_contact: customerContact,
        status: "pending",
        expires_at: expiresAt,
        payment_reference: payment?.transactionId || null,
        qr_content: payment?.qrContent || null,
        qr_image: payment?.qrImage || null,
        payment_raw: payment?.raw || null,
        payment_method: paymentMethod,
        user_id: authUser?.id || null,
      })
      .select("*")
      .single();

    if (error) throw error;

    if (paymentMethod === "balance") {
      const debit = await db.rpc("wallet_debit", { p_user_id: authUser.id, p_amount: amount, p_reference: `GAME:${invoice}`, p_description: `Top Up ${item.game} - ${item.name}`, p_metadata: { order_id: data.id, invoice } });
      if (debit.error) {
        await db.from("game_orders").update({ status: "cancelled", note: debit.error.message }).eq("id", data.id);
        if (String(debit.error.message || "").includes("INSUFFICIENT_BALANCE")) return res.status(402).json({ error: "Saldo KivoPay tidak cukup.", need_deposit: true });
        throw debit.error;
      }
      try {
        const provider = await vipaymentRequest("order", { service: data.service_code, data_no: data.target, data_zone: data.zone || undefined, post_additional_data: data.additional_data || undefined });
        const pd = provider?.data || {};
        await db.from("game_orders").update({ status: "processing", paid_at: new Date().toISOString(), vip_trxid: String(pd.trxid || ""), vip_status: String(pd.status || "waiting"), note: String(pd.note || provider?.message || "Pesanan sedang diproses."), vip_raw: provider, updated_at: new Date().toISOString() }).eq("id", data.id);
        data.status = "processing"; data.paid_at = new Date().toISOString();
      } catch (providerError) {
        await db.rpc("wallet_refund", { p_user_id: authUser.id, p_amount: amount, p_reference: `REFUND:GAME:${invoice}`, p_description: `Pengembalian ${invoice}`, p_metadata: { reason: providerError.message } });
        await db.from("game_orders").update({ status: "failed", vip_status: "error", note: providerError.message, updated_at: new Date().toISOString() }).eq("id", data.id);
        throw new Error("Pesanan gagal dikirim. Saldo sudah dikembalikan.");
      }
    }

    return res.status(200).json({
      order: {
        invoice: data.invoice,
        game_name: data.game_name,
        service_name: data.service_name,
        target: data.target,
        zone: data.zone,
        payment_amount: data.payment_amount,
        status: data.status,
        expires_at: data.expires_at,
        qr_content: data.qr_content,
        qr_image: data.qr_image,
        payment_method: paymentMethod,
      },
    });
  } catch (error) {
    console.error("CREATE GAME ORDER", error);
    return res.status(500).json({ error: error.message || "Gagal membuat pesanan game." });
  }
}
