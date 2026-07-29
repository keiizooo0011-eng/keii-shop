import { optionalAuthUser } from './_auth-user.js';
import { adminClient } from './_lib.js';
import { botController } from './_bot-controller.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await optionalAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Silakan login.' });
  const invoice = String(req.method === 'GET' ? req.query?.invoice : req.body?.invoice || '').trim();
  if (!invoice) return res.status(400).json({ error: 'Invoice wajib diisi.' });
  const db = adminClient();
  try {
    const { data: order, error } = await db.from('bot_orders').select('*').eq('invoice', invoice).eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    if (!order?.session_id) return res.status(404).json({ error: 'Session bot tidak ditemukan.' });
    if (['expired','deleted','failed'].includes(order.status)) return res.status(400).json({ error: 'Bot ini sudah tidak aktif.' });

    const base = `/api/sessions/${encodeURIComponent(order.session_id)}/plugins`;
    if (req.method === 'GET') {
      const plugins = await botController(base);
      return res.status(200).json({ ok: true, order: { invoice: order.invoice, bot_name: order.bot_name, phone: order.phone, status: order.status }, plugins });
    }
    if (req.method === 'POST') {
      const pluginId = String(req.body?.plugin_id || '').trim();
      const installed = req.body?.installed !== false;
      if (!pluginId) return res.status(400).json({ error: 'Plugin tidak valid.' });
      const result = await botController(`${base}/${encodeURIComponent(pluginId)}`, { method: 'POST', body: { installed } });
      return res.status(200).json({ ok: true, result });
    }
    return res.status(405).json({ error: 'Method tidak diizinkan.' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Gagal memproses plugin.' });
  }
}
