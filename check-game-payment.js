import { adminClient, getSanpayMutasi, normalizeAmount, mutasiKey } from "./_lib.js";
import { vipaymentRequest, vipaymentRows } from "./_vipayment.js";

const publicOrder = (order) => ({
  invoice: order.invoice,
  game_name: order.game_name,
  service_name: order.service_name,
  target: order.target,
  zone: order.zone,
  payment_amount: order.payment_amount,
  status: order.status,
  provider_id: order.vip_trxid,
  provider_status: order.vip_status,
  customer_name: order.customer_name,
  customer_contact: order.customer_contact,
  form_data: order.form_data || {},
  paid_at: order.paid_at,
  completed_at: order.completed_at,
  updated_at: order.updated_at,
  note: order.note,
  expires_at: order.expires_at,
  qr_content: order.qr_content,
  qr_image: order.qr_image,
  created_at: order.created_at,
});

function normalizeProviderStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (["sukses", "success", "completed", "complete", "done"].includes(status)) return "completed";
  if (["gagal", "failed", "error", "cancel", "canceled", "cancelled"].includes(status)) return "failed";
  return "processing";
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const invoice = String(req.query?.invoice || req.body?.invoice || "").trim();
  if (!invoice) return res.status(400).json({ error: "Invoice wajib diisi." });

  try {
    const db = adminClient();
    let { data: order, error } = await db.from("game_orders").select("*").eq("invoice", invoice).maybeSingle();
    if (error) throw error;
    if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });

    if (order.status === "pending" && new Date(order.expires_at).getTime() <= Date.now()) {
      await db.from("game_orders").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", order.id);
      order.status = "expired";
    }

    if (order.status === "pending") {
      const mutations = await getSanpayMutasi();
      const mutation = mutations.find((entry) => normalizeAmount(entry.amount) === Number(order.payment_amount));
      if (mutation) {
        await db.from("game_orders").update({
          status: "paid",
          paid_at: new Date().toISOString(),
          mutation_key: mutasiKey(mutation),
          mutation_data: mutation,
          updated_at: new Date().toISOString(),
        }).eq("id", order.id);

        try {
          const provider = await vipaymentRequest("order", {
            service: order.service_code,
            data_no: order.target,
            data_zone: order.zone || undefined,
            post_additional_data: order.additional_data || undefined,
          });
          const data = provider?.data || {};
          await db.from("game_orders").update({
            status: "processing",
            vip_trxid: String(data.trxid || ""),
            vip_status: String(data.status || "waiting"),
            note: String(data.note || provider?.message || "Pesanan sedang diproses."),
            vip_raw: provider,
            updated_at: new Date().toISOString(),
          }).eq("id", order.id);
        } catch (providerError) {
          await db.from("game_orders").update({
            status: "failed",
            vip_status: "error",
            note: providerError.message,
            updated_at: new Date().toISOString(),
          }).eq("id", order.id);
        }
      }
    }

    ({ data: order, error } = await db.from("game_orders").select("*").eq("id", order.id).single());
    if (error) throw error;

    if (order.status === "processing" && order.vip_trxid) {
      try {
        const provider = await vipaymentRequest("status", { trxid: order.vip_trxid });
        const data = vipaymentRows(provider)[0] || {};
        const providerStatus = String(data.status || order.vip_status || "waiting");
        const status = normalizeProviderStatus(providerStatus);
        const note = String(data.note || provider?.message || order.note || "");
        await db.from("game_orders").update({
          status,
          vip_status: providerStatus,
          note,
          vip_raw: provider,
          completed_at: status === "completed" ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        }).eq("id", order.id);
        order = { ...order, status, vip_status: providerStatus, note };
      } catch (statusError) {
        console.error("VIPAYMENT STATUS", statusError);
      }
    }

    return res.status(200).json({ order: publicOrder(order) });
  } catch (error) {
    console.error("CHECK GAME PAYMENT", error);
    return res.status(500).json({ error: error.message || "Gagal mengecek transaksi." });
  }
}
