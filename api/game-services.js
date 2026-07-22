import { panelpediaRequest, panelpediaRows, panelpediaService, panelpediaErrorPayload } from "./_panelpedia.js";

function sellPrice(cost) {
  const value = Number(cost || 0);
  const low = Number(process.env.PANELPEDIA_PROFIT_MIN || process.env.VIPAYMENT_PROFIT_MIN || 2000);
  const high = Number(process.env.PANELPEDIA_PROFIT_MAX || process.env.VIPAYMENT_PROFIT_MAX || 3000);
  const threshold = Number(process.env.PANELPEDIA_PROFIT_THRESHOLD || process.env.VIPAYMENT_PROFIT_THRESHOLD || 10000);
  return value + (value < threshold ? low : high);
}

function isActive(status) {
  const value = String(status || "").toLowerCase();
  return !value || value === "aktif" || value === "active" || value === "available";
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  if (req.method !== "GET") return res.status(405).json({ error: "Method tidak diizinkan." });

  try {
    const filter = String(req.query?.game || "").trim().toLowerCase();
    const result = await panelpediaRequest("service");
    const services = panelpediaRows(result?.data)
      .map(panelpediaService)
      .filter((item) => item.code && isActive(item.status))
      .filter((item) => !filter || `${item.game} ${item.name}`.toLowerCase().includes(filter))
      .map((item) => ({ ...item, sell_price: sellPrice(item.price) }));

    return res.status(200).json({ services });
  } catch (error) {
    const detail = panelpediaErrorPayload(error);
    console.error("[PanelPedia service error]", detail);
    return res.status(502).json({
      error: detail.message || "Gagal mengambil layanan PanelPedia.",
      debug: detail,
    });
  }
}
