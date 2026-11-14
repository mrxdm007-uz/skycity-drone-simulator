import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { Server } from 'socket.io';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT || 10000);

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = required.filter(k => !process.env[k]);
const configured = missing.length === 0;
const adminDb = configured ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
}) : null;
const authDb = configured ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
}) : null;

app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(root, 'client')));
app.get('/health', (_req, res) => res.json({ ok: true, configured, missing }));

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}
async function requireUser(req, res, next) {
  if (!configured) return res.status(503).json({ error: 'Server Supabase sozlamalari to‘liq emas.' });
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Kirish talab qilinadi.' });
  const { data, error } = await authDb.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: 'Sessiya yaroqsiz. Qayta kiring.' });
  req.user = data.user;
  next();
}
async function requireAdmin(req, res, next) {
  const { data, error } = await adminDb.from('profiles').select('role').eq('id', req.user.id).single();
  if (error || data?.role !== 'admin') return res.status(403).json({ error: 'Faqat admin bu amalni bajarishi mumkin.' });
  next();
}
async function premiumStatus(userId) {
  const { data } = await adminDb.from('premium_entitlements')
    .select('is_active,starts_at,expires_at')
    .eq('user_id', userId).maybeSingle();
  if (!data || !data.is_active) return false;
  const now = Date.now();
  return new Date(data.starts_at).getTime() <= now && (!data.expires_at || new Date(data.expires_at).getTime() > now);
}

app.get('/api/me', requireUser, async (req, res) => {
  const [{ data: profile }, { data: entitlement }] = await Promise.all([
    adminDb.from('profiles').select('id,username,display_name,role,created_at').eq('id', req.user.id).single(),
    adminDb.from('premium_entitlements').select('is_active,expires_at,starts_at').eq('user_id', req.user.id).maybeSingle()
  ]);
  const active = await premiumStatus(req.user.id);
  res.json({ profile, premium: active, entitlement });
});

app.get('/api/leaderboard', requireUser, async (_req, res) => {
  const { data, error } = await adminDb.from('match_results')
    .select('user_id,score,created_at,profiles(username)')
    .order('score', { ascending: false }).limit(20);
  if (error) return res.status(500).json({ error: 'Reytingni yuklab bo‘lmadi.' });
  res.json({ leaderboard: data || [] });
});

app.get('/api/admin/users', requireUser, requireAdmin, async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 30);
  let query = adminDb.from('profiles').select('id,username,display_name,role,created_at').order('created_at', { ascending: false }).limit(100);
  if (q) query = query.ilike('username', `%${q}%`);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: 'Foydalanuvchilar olinmadi.' });
  const ids = (data || []).map(x => x.id);
  const { data: entitlements } = ids.length
    ? await adminDb.from('premium_entitlements').select('user_id,is_active,expires_at,starts_at').in('user_id', ids)
    : { data: [] };
  const map = new Map((entitlements || []).map(e => [e.user_id, e]));
  res.json({ users: (data || []).map(u => ({ ...u, premium: map.get(u.id) || null })) });
});

app.post('/api/admin/premium', requireUser, requireAdmin, async (req, res) => {
  const targetId = String(req.body.userId || '');
  const action = req.body.action === 'revoke' ? 'revoke' : 'grant';
  const note = String(req.body.note || '').slice(0, 240);
  const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
  if (!/^[0-9a-f-]{36}$/i.test(targetId)) return res.status(400).json({ error: 'Foydalanuvchi ID noto‘g‘ri.' });
  if (action === 'grant' && expiresAt && Number.isNaN(expiresAt.getTime())) return res.status(400).json({ error: 'Tugash sanasi noto‘g‘ri.' });
  if (action === 'grant' && expiresAt && expiresAt.getTime() <= Date.now()) return res.status(400).json({ error: 'Tugash sanasi kelajakda bo‘lishi kerak.' });
  const { data: target } = await adminDb.from('profiles').select('id').eq('id', targetId).maybeSingle();
  if (!target) return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });

  if (action === 'grant') {
    const { error } = await adminDb.from('premium_entitlements').upsert({
      user_id: targetId, is_active: true, starts_at: new Date().toISOString(),
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      granted_by: req.user.id, note, updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    if (error) return res.status(500).json({ error: 'Premium berilmadi: ' + error.message });
  } else {
    const { error } = await adminDb.from('premium_entitlements').upsert({
      user_id: targetId, is_active: false, granted_by: req.user.id, note,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    if (error) return res.status(500).json({ error: 'Premium bekor qilinmadi: ' + error.message });
  }
  const { error: auditError } = await adminDb.from('premium_audit').insert({
    target_user_id: targetId, admin_user_id: req.user.id, action,
    expires_at: action === 'grant' ? (expiresAt?.toISOString() || null) : null, note
  });
  if (auditError) return res.status(500).json({ error: 'Premium holati o‘zgardi, ammo audit yozuvi xato: ' + auditError.message });
  res.json({ ok: true, message: action === 'grant' ? 'Premium ruxsat berildi.' : 'Premium bekor qilindi.' });
});

app.post('/api/rooms', requireUser, async (req, res) => {
  if (!(await premiumStatus(req.user.id))) return res.status(403).json({ error: 'Maxsus kodli xona ochish uchun admin bergan Premium kerak.' });
  const name = String(req.body.name || 'SKYCITY private room').trim().slice(0, 40);
  const roomCode = crypto.randomBytes(4).toString('hex').toUpperCase();
  const { data, error } = await adminDb.from('game_rooms').insert({
    room_code: roomCode, name, owner_id: req.user.id, is_private: true, max_players: 4
  }).select('id,room_code,name,max_players').single();
  if (error) return res.status(500).json({ error: 'Xona yaratilmadi: ' + error.message });
  res.json({ room: data });
});

app.post('/api/results', requireUser, async (req, res) => {
  const score = Math.max(0, Math.min(1000000, Math.floor(Number(req.body.score) || 0)));
  const duration = Math.max(0, Math.min(3600000, Math.floor(Number(req.body.durationMs) || 0)));
  const { error } = await adminDb.from('match_results').insert({ user_id: req.user.id, score, duration_ms: duration });
  if (error) return res.status(500).json({ error: 'Natija saqlanmadi.' });
  res.json({ ok: true });
});

const allowedOrigins = (process.env.CLIENT_ORIGIN || '').split(',').map(x => x.trim()).filter(Boolean);
const io = new Server(server, { cors: allowedOrigins.length ? { origin: allowedOrigins } : undefined });
const socketsByRoom = new Map();
io.use(async (socket, next) => {
  if (!configured) return next(new Error('Server sozlanmagan'));
  try {
    const token = socket.handshake.auth?.token;
    const { data, error } = await authDb.auth.getUser(token);
    if (error || !data?.user) return next(new Error('Auth required'));
    socket.user = data.user;
    const { data: profile } = await adminDb.from('profiles').select('username').eq('id', data.user.id).single();
    socket.username = profile?.username || 'Pilot';
    next();
  } catch { next(new Error('Auth failed')); }
});
io.on('connection', socket => {
  socket.on('room:join', async ({ code } = {}) => {
    const roomCode = String(code || '').toUpperCase().slice(0, 12);
    const { data: room } = await adminDb.from('game_rooms').select('id,room_code,max_players').eq('room_code', roomCode).maybeSingle();
    if (!room) return socket.emit('room:error', 'Xona kodi topilmadi.');
    const roomSet = socketsByRoom.get(roomCode) || new Set();
    if (roomSet.size >= room.max_players && !roomSet.has(socket.id)) return socket.emit('room:error', 'Xona to‘la.');
    roomSet.add(socket.id); socketsByRoom.set(roomCode, roomSet);
    socket.join(roomCode); socket.data.roomCode = roomCode;
    io.to(roomCode).emit('room:players', [...roomSet].map(id => {
      const s = io.sockets.sockets.get(id);
      return { id, username: s?.username || 'Pilot' };
    }));
  });
  socket.on('drone:state', state => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;
    const safe = {
      x: clamp(state?.x, -1000, 1000), y: clamp(state?.y, 0, 500), z: clamp(state?.z, -1000, 1000),
      yaw: clamp(state?.yaw, -10000, 10000)
    };
    socket.to(roomCode).emit('drone:remote', { id: socket.id, username: socket.username, ...safe });
  });
  socket.on('disconnect', () => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;
    const set = socketsByRoom.get(roomCode);
    if (set) { set.delete(socket.id); if (!set.size) socketsByRoom.delete(roomCode); }
    io.to(roomCode).emit('room:players', [...(set || [])].map(id => {
      const s = io.sockets.sockets.get(id); return { id, username: s?.username || 'Pilot' };
    }));
  });
});
function clamp(v, min, max) { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : 0; }

server.listen(PORT, () => console.log(`SKYCITY PRO listening on ${PORT}`));
