const BASE = "https://api.jikan.moe/v4";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildUrl(action, query, page) {
  if (action === "search") {
    if (!query) throw new Error("Nama anime wajib diisi.");
    return `${BASE}/anime?q=${encodeURIComponent(query)}&limit=12&page=${page}&sfw=true`;
  }
  if (action === "top") {
    return `${BASE}/top/anime?filter=bypopularity&limit=12&page=${page}&sfw=true`;
  }
  if (action === "season") {
    return `${BASE}/seasons/now?limit=12&page=${page}&sfw=true`;
  }
  throw new Error("Action tidak didukung.");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=180");

  const action = String(req.query.action || "search");
  const query = String(req.query.query || "").trim();
  const page = Math.max(1, Number(req.query.page || 1));

  let url;
  try {
    url = buildUrl(action, query, page);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  try {
    let response;

    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; KivoTools/10.2)"
        },
        signal: AbortSignal.timeout(20000)
      });

      if (response.status !== 429) break;
      await sleep(900 * (attempt + 1));
    }

    const text = await response.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = { error: "Respons sumber anime bukan JSON.", detail: text.slice(0, 300) };
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.message || data?.error || "Sumber anime sedang bermasalah.",
        detail: data
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({
      error: "Gagal terhubung ke sumber anime.",
      detail: error?.message || "Unknown error"
    });
  }
}
