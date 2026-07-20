import { adminClient } from "./_lib.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method !== "GET") return res.status(405).json({ error: "Method tidak diizinkan." });

  try {
    const db = adminClient();
    const [{ data: ratings, error: ratingError }, { data: messages, error: chatError }] = await Promise.all([
      db.from("product_ratings")
        .select("id,customer_name,rating,review,created_at,products(name)")
        .eq("is_visible", true)
        .order("created_at", { ascending: false })
        .limit(20),
      db.from("chat_messages")
        .select("id,guest_id,nickname,message,created_at,is_visible")
        .eq("is_visible", true)
        .order("created_at", { ascending: false })
        .limit(50)
    ]);

    if (ratingError) throw ratingError;
    if (chatError) throw chatError;
    return res.status(200).json({ ratings: ratings || [], messages: (messages || []).reverse() });
  } catch (error) {
    console.error("COMMUNITY FEED ERROR", error);
    return res.status(500).json({ error: error.message || "Komunitas gagal dimuat." });
  }
}
