import { createClient } from '@supabase/supabase-js';
import { adminClient, env } from './_lib.js';

async function isAdmin(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/, '');
  if (!token) return false;
  const auth = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
  const { data } = await auth.auth.getUser(token);
  const user = data?.user;
  if (!user) return false;
  const db = adminClient();
  const { data: row } = await db.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
  return Boolean(row);
}

function controllerUrl(pathname) {
  const base = env('BOT_CONTROLLER_URL').replace(/\/$/, '');
  if (!base) throw new Error('BOT_CONTROLLER_URL belum diatur.');
  return `${base}${pathname}`;
}

async function controller(pathname, options = {}) {
  const secret = env('BOT_CONTROLLER_SECRET');
  if (!secret) throw new Error('BOT_CONTROLLER_SECRET belum diatur.');
  const response = await fetch(controllerUrl(pathname), {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(Number(options.timeout || 120000))
  });
  return response;
}

export const config = { api: { responseLimit: false } };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!await isAdmin(req)) return res.status(403).json({ error: 'Akses admin ditolak.' });

  try {
    const action = String(req.query?.action || 'list');
    const name = String(req.query?.name || '');
    const jobId = String(req.query?.jobId || '');

    if (req.method === 'GET' && action === 'download') {
      if (!name) return res.status(400).json({ error: 'Nama backup wajib diisi.' });
      const upstream = await controller(`/api/backups/${encodeURIComponent(name)}/download`, { timeout: 180000 });
      if (!upstream.ok) {
        const body = await upstream.json().catch(() => ({}));
        return res.status(upstream.status).json({ error: body.message || 'Gagal mengunduh backup.' });
      }
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^a-zA-Z0-9._-]/g, '_')}"`);
      res.setHeader('Content-Length', buffer.length);
      return res.status(200).send(buffer);
    }

    if (req.method === 'GET' && action === 'status') {
      const upstream = await controller(`/api/backups/jobs/${encodeURIComponent(jobId)}`);
      const body = await upstream.json().catch(() => ({}));
      if (!upstream.ok || body.success === false) return res.status(upstream.status).json({ error: body.message || 'Status backup tidak tersedia.' });
      return res.status(200).json({ ok: true, job: body.data });
    }

    if (req.method === 'GET') {
      const upstream = await controller('/api/backups');
      const body = await upstream.json().catch(() => ({}));
      if (!upstream.ok || body.success === false) return res.status(upstream.status).json({ error: body.message || 'Gagal memuat backup.' });
      return res.status(200).json({ ok: true, backups: body.data || [] });
    }

    if (req.method === 'POST') {
      const upstream = await controller('/api/backups', { method: 'POST' });
      const body = await upstream.json().catch(() => ({}));
      if (!upstream.ok || body.success === false) return res.status(upstream.status).json({ error: body.message || 'Gagal memulai backup.' });
      return res.status(202).json({ ok: true, job: body.data });
    }

    if (req.method === 'DELETE') {
      if (!name) return res.status(400).json({ error: 'Nama backup wajib diisi.' });
      const upstream = await controller(`/api/backups/${encodeURIComponent(name)}`, { method: 'DELETE' });
      const body = await upstream.json().catch(() => ({}));
      if (!upstream.ok || body.success === false) return res.status(upstream.status).json({ error: body.message || 'Gagal menghapus backup.' });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method tidak diizinkan.' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Terjadi kesalahan.' });
  }
}
