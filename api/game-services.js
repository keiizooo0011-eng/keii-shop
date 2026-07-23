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
    const exactGame = String(req.query?.game || "").trim();
    const search = String(req.query?.search || "").trim().toLowerCase();
    const limit = Math.min(Math.max(Number(req.query?.limit || 0), 0), 200);

    // VIPayment filter_game cenderung membutuhkan nama game yang persis.
    // Untuk pencarian admin, ambil katalog aktif lalu filter lokal agar kata seperti "ML" tetap ditemukan.
    const provider = await vipaymentRequest("services", exactGame && !search ? {
      filter_game: exactGame,
      filter_status: "available",
    } : {
      filter_status: "available",
    });

    let services = vipaymentRows(provider)
      .map(vipaymentService)
      .filter((item) => item.code && isActive(item.status))
      .map((item) => ({ ...item, sell_price: sellPrice(item.price) }));

    if (search) {
      services = services.filter((item) =>
        [item.game, item.name, item.code].join(" ").toLowerCase().includes(search)
      );
    }
    if (limit) services = services.slice(0, limit);

    return res.status(200).json({ services, total: services.length });
  } catch (error) {
    const detail = vipaymentErrorPayload(error);
    console.error("[VIPayment service error]", detail);
    return res.status(502).json({
      error: detail.message || "Gagal mengambil layanan VIPayment.",
      debug: detail.debug,
    });
  }
}
