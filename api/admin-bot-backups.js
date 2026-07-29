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

    if (req.method === 'GET' && action === 'download-ticket') {
      if (!name) return res.status(400).json({ error: 'Nama backup wajib diisi.' });
      const upstream = await controller(`/api/backups/${encodeURIComponent(name)}/download-ticket`, { method: 'POST', timeout: 15000 });
      const body = await upstream.json().catch(() => ({}));
      if (!upstream.ok || body.success === false) {
        return res.status(upstream.status).json({ error: body.message || 'Gagal membuat link download.' });
      }
      // Browser tidak boleh diarahkan ke URL internal/port controller (sering diblokir HTTPS atau firewall).
      // Pakai URL publik bila tersedia. Jika env publik kosong, turunkan otomatis dari hostname
      // BOT_CONTROLLER_URL dengan HTTPS dan tanpa port, misalnya:
      // http://papi.queen-official.com:5029 -> https://papi.queen-official.com
      const configuredPublic = String(
        env('BOT_CONTROLLER_PUBLIC_URL') || env('BOT_CONTROLLER_DOWNLOAD_URL') || ''
      ).trim();
      const internalBase = String(env('BOT_CONTROLLER_URL') || '').trim();
      let publicBase = configuredPublic;
      if (!publicBase && internalBase) {
        try {
          const parsed = new URL(internalBase);
          parsed.protocol = 'https:';
          parsed.port = '';
          parsed.pathname = '';
          parsed.search = '';
          parsed.hash = '';
          publicBase = parsed.toString().replace(/\/$/, '');
        } catch (_) {
          publicBase = internalBase.replace(/\/$/, '');
        }
      }
      if (!publicBase) return res.status(500).json({ error: 'Alamat publik Bot Controller belum tersedia.' });

      const ticketPath = String(body.data?.path || '');
      if (!ticketPath.startsWith('/health?downloadBackup=')) {
        return res.status(502).json({ error: 'Bot Controller mengirim jalur download yang tidak valid.' });
      }
      return res.status(200).json({
        ok: true,
        name,
        expiresAt: body.data?.expires,
        downloadUrl: `${publicBase.replace(/\/$/, '')}${ticketPath}`
      });
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
