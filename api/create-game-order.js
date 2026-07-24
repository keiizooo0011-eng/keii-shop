import { optionalAuthUser } from './_auth-user.js';
import { adminClient, createSanpayQris, uniqueFee, invoiceId } from "./_lib.js";
import { vipaymentRequest, vipaymentRows, vipaymentService } from "./_vipayment.js";

function isActive(status) {
  return String(status || "available").toLowerCase() === "available";
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

    if (!service || !target || !customerName || !customerContact) {
      return res.status(400).json({ error: "Data checkout belum lengkap." });
    }

    const catalog = await vipaymentRequest("services", { filter_status: "available" });
    const item = vipaymentRows(catalog)
      .map(vipaymentService)
      .find((entry) => entry.code === service && isActive(entry.status));

    if (!item) return res.status(409).json({ error: "Layanan sedang tidak tersedia." });

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
    const fee = uniqueFee();
    const paymentAmount = amount + fee;
    const invoice = invoiceId();
    const expiresAt = new Date(Date.now() + Number(process.env.PAYMENT_EXPIRE_MINUTES || 10) * 60000).toISOString();

    const payment = await createSanpayQris(paymentAmount, invoice, `Top Up ${item.game} - ${item.name}`);
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
        payment_reference: payment.transactionId,
        qr_content: payment.qrContent || null,
        qr_image: payment.qrImage || null,
        payment_raw: payment.raw,
      })
      .select("*")
      .single();

    if (error) throw error;

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
      },
    });
  } catch (error) {
    console.error("CREATE GAME ORDER", error);
    return res.status(500).json({ error: error.message || "Gagal membuat pesanan game." });
  }
}
