import { adminClient, createSanpayQris, uniqueFee, invoiceId } from "./_lib.js";
import { panelpediaRequest, panelpediaRows, panelpediaService } from "./_panelpedia.js";

function isActive(status) {
  const value = String(status || "").toLowerCase();
  return !value || value === "aktif" || value === "active" || value === "available";
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method tidak diizinkan." });

  try {
    const service = String(req.body?.service || "").trim();
    const target = String(req.body?.target || "").trim();
    const zone = String(req.body?.zone || "").trim();
    const customerName = String(req.body?.customer_name || "").trim();
    const customerContact = String(req.body?.customer_contact || "").trim();

    if (!service || !target || !customerName || !customerContact) {
      return res.status(400).json({ error: "Data checkout belum lengkap." });
    }

    const catalog = await panelpediaRequest("service");
    const item = panelpediaRows(catalog?.data)
      .map(panelpediaService)
      .find((entry) => entry.code === service && isActive(entry.status));

    if (!item) return res.status(409).json({ error: "Layanan sedang tidak tersedia." });

    const cost = Number(item.price || 0);
    if (!cost) return res.status(409).json({ error: "Harga layanan PanelPedia tidak valid." });

    const lowProfit = Number(process.env.PANELPEDIA_PROFIT_MIN || process.env.VIPAYMENT_PROFIT_MIN || 2000);
    const maxProfit = Number(process.env.PANELPEDIA_PROFIT_MAX || process.env.VIPAYMENT_PROFIT_MAX || 3000);
    const threshold = Number(process.env.PANELPEDIA_PROFIT_THRESHOLD || process.env.VIPAYMENT_PROFIT_THRESHOLD || 10000);
    const markup = cost < threshold ? lowProfit : maxProfit;
    const amount = cost + markup;
    const fee = uniqueFee();
    const paymentAmount = amount + fee;
    const invoice = invoiceId();
    const expiresAt = new Date(Date.now() + Number(process.env.PAYMENT_EXPIRE_MINUTES || 10) * 60000).toISOString();

    const payment = await createSanpayQris(paymentAmount, invoice, `Top Up ${item.game} - ${item.name}`);
    const db = adminClient();
    const { data, error } = await db
      .from("game_orders")
      .insert({
        invoice,
        service_code: service,
        game_name: item.game,
        service_name: item.name,
        target,
        zone: zone || null,
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
