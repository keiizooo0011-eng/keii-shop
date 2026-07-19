const BASE = "https://api.siputzx.my.id";

const routes = {
  translate: { path: "/api/tools/translate", params: ["text","source","target"] },
  tiktokstalk: { path: "/api/stalk/tiktok", params: ["username"] },
  zodiac: { path: "/api/primbon/zodiak", params: ["zodiac"] },
  name: { path: "/api/primbon/artinama", params: ["name"], rename: {name:"nama"} },
  health: { path: "/api/primbon/cek_potensi_penyakit", params: ["tgl","bln","thn"] },
  weather: { path: "/api/info/cuaca", params: ["q"] },
  snack: { path: "/api/d/snackvideo", params: ["url"] },
  tiktokdl: { path: "/api/d/tiktok/v2", params: ["url"] },
  capcut: { path: "/api/d/capcut", params: ["url"] },
  ai: { path: "/api/ai/gptoss120b", params: ["prompt","system","temperature"] }
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const { endpoint } = req.query;
  const cfg = routes[endpoint];
  if (!cfg) return res.status(400).json({ error: "Endpoint tidak diizinkan." });

  const qs = new URLSearchParams();
  for (const key of cfg.params) {
    const value = req.query[key];
    if (value === undefined || value === "") continue;
    qs.set((cfg.rename && cfg.rename[key]) || key, String(value));
  }

  try {
    const response = await fetch(`${BASE}${cfg.path}?${qs.toString()}`, {
      headers: { "Accept": "application/json", "User-Agent": "KivoTools/2.0" }
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(502).json({ error: "Gagal menghubungi layanan API.", detail: error.message });
  }
}
