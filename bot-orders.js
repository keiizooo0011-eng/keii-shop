import { optionalAuthUser } from './_auth-user.js';
import { adminClient } from './_lib.js';
import { botController } from './_bot-controller.js';

const finalStatus = new Set(['expired','deleted','failed']);
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await optionalAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Silakan login.' });
  const db = adminClient();
  try {
    if (req.method === 'GET') {
      const invoice = String(req.query?.invoice || '').trim();
      let query = db.from('bot_orders').select('*').eq('user_id', user.id).order('created_at', { ascending:false });
      if (invoice) query = query.eq('invoice', invoice).limit(1);
      else query = query.limit(100);
      const { data, error } = await query;
      if (error) throw error;
      const rows = [];
      for (const row of data || []) {
        let next = row;
        if (row.session_id && !finalStatus.has(row.status)) {
          try {
            const session = await botController(`/api/sessions/${encodeURIComponent(row.session_id)}`);
            const update = { status: session.status || row.status, pairing_code: session.pairingCode || row.pairing_code, connected_at: session.connectedAt || row.connected_at, last_seen_at: session.lastSeenAt || row.last_seen_at, expires_at: session.expiresAt || row.expires_at, controller_data: session, updated_at: new Date().toISOString() };
            const result = await db.from('bot_orders').update(update).eq('id', row.id).select('*').single();
            if (!result.error) next = result.data;
          } catch {}
        }
        rows.push(next);
      }
      return res.status(200).json({ ok:true, orders: rows });
    }
    if (req.method === 'POST') {
      const invoice = String(req.body?.invoice || '').trim();
      const action = String(req.body?.action || '').trim();
      const { data: order, error } = await db.from('bot_orders').select('*').eq('invoice', invoice).eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      if (!order) return res.status(404).json({ error:'Pesanan tidak ditemukan.' });
      if (!['restart','pairing'].includes(action)) return res.status(400).json({ error:'Aksi tidak tersedia.' });
      const session = await botController(`/api/sessions/${encodeURIComponent(order.session_id)}/${action}`, { method:'POST', body: action === 'pairing' ? { phone: order.phone } : {} });
      const { data: fresh } = await db.from('bot_orders').update({ status: session.status || order.status, pairing_code: session.pairingCode || null, controller_data: session, updated_at:new Date().toISOString() }).eq('id', order.id).select('*').single();
      return res.status(200).json({ ok:true, order:fresh || order });
    }
    return res.status(405).json({ error:'Method tidak diizinkan.' });
  } catch (error) { return res.status(500).json({ error:error.message }); }
}
