const BASE = "https://api.jikan.moe/v4";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=120, s-maxage=300");

  const action = String(req.query.action || "search");
  const query = String(req.query.query || "").trim();
  const page = Math.max(1, Number(req.query.page || 1));

  let url;
  if (action === "search") {
    if (!query) return res.status(400).json({ error: "Nama anime wajib diisi." });
    url = `${BASE}/anime?q=${encodeURIComponent(query)}&limit=12&page=${page}&sfw=true`;
  } else if (action === "top") {
    url = `${BASE}/top/anime?filter=bypopularity&limit=12&page=${page}&sfw=true`;
  } else if (action === "season") {
    url = `${BASE}/seasons/now?limit=12&page=${page}&sfw=true`;
  } else {
    return res.status(400).json({ error: "Action tidak didukung." });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "KivoTools/10.0"
      },
      signal: AbortSignal.timeout(20000)
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(502).json({
      error: "Gagal mengambil data anime.",
      detail: error?.message || "Unknown error"
    });
  }
}
