import { vipaymentRequest, vipaymentRows, vipaymentService, vipaymentErrorPayload } from "./_vipayment.js";

function sellPrice(cost) {
  const value = Number(cost || 0);
  const low = Number(process.env.VIPAYMENT_PROFIT_MIN || 2000);
  const high = Number(process.env.VIPAYMENT_PROFIT_MAX || 3000);
  const threshold = Number(process.env.VIPAYMENT_PROFIT_THRESHOLD || 10000);
  return value + (value < threshold ? low : high);
}

function isActive(status) {
  return String(status || "available").toLowerCase() === "available";
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  if (req.method !== "GET") return res.status(405).json({ error: "Method tidak diizinkan." });

  try {
    const filter = String(req.query?.game || "").trim();
    const provider = await vipaymentRequest("services", {
      filter_game: filter || undefined,
      filter_status: "available",
    });
    const services = vipaymentRows(provider)
      .map(vipaymentService)
      .filter((item) => item.code && isActive(item.status))
      .map((item) => ({ ...item, sell_price: sellPrice(item.price) }));

    return res.status(200).json({ services });
  } catch (error) {
    const detail = vipaymentErrorPayload(error);
    console.error("[VIPayment service error]", detail);
    return res.status(502).json({
      error: detail.message || "Gagal mengambil layanan VIPayment.",
      debug: detail.debug,
    });
  }
}
