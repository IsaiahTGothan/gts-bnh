// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — TEAM SYNC (server side, Supabase)
//
//  One Postgres row holds the whole shared board as JSON plus a revision
//  counter. Writes are compare-and-set on that counter; after every write
//  the server fires a Supabase Realtime broadcast so every open device pulls
//  the new revision within a second. Devices also share presence ("who's
//  online") over the same channel.
//
//  Runs only inside app/api/sync/route.js (Node runtime). Nothing here is
//  bundled for the browser.
//
//  Env (all injected by the Vercel ⇄ Supabase integration):
//    SUPABASE_URL                 https://<ref>.supabase.co
//    SUPABASE_SERVICE_ROLE_KEY    server-only key (never sent to devices)
//    SUPABASE_ANON_KEY            public key — sent to devices for Realtime
//    POSTGRES_URL / POSTGRES_URL_NON_POOLING — used once, to create the table
//  Optional:
//    GTS_SYNC_KEY                 fixes the team passcode from the server
//                                 (overrides the one stored in the database)
// ═══════════════════════════════════════════════════════════════════════════
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const TABLE = 'gts_sync';
export const ROW_ID = 'team';
export const CHANNEL = 'gts-sync';
export const MAX_DOC_BYTES = 2_000_000;

/** Run this in the Supabase SQL editor if the table could not be created automatically. */
export const SETUP_SQL = `create table if not exists public.gts_sync (
  id text primary key,
  rev bigint not null default 0,
  doc jsonb,
  passcode_hash text,
  passcode_salt text,
  updated_at timestamptz not null default now()
);
alter table public.gts_sync enable row level security;
insert into public.gts_sync (id) values ('team') on conflict (id) do nothing;
notify pgrst, 'reload schema';`;

// ─── Config ────────────────────────────────────────────────────────────────
// The Vercel ⇄ Supabase integration injects both the classic JWT keys
// (SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY) and the newer
// sb_secret_ / sb_publishable_ ones; either pair works — classic first.
export function config(env = process.env) {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  const anonKey = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || null;
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/+$/, ''), serviceKey, anonKey };
}

export function realtimeConfig(c) {
  if (!c?.anonKey) return null;
  return { url: c.url, anonKey: c.anonKey, channel: CHANNEL };
}

// ─── Supabase client (service role, server only) ───────────────────────────
let _client = null;
let _clientUrl = null;
export async function client() {
  const c = config();
  if (_client && _clientUrl === c.url) return _client;
  const { createClient } = await import('@supabase/supabase-js');
  _client = createClient(c.url, c.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-application-name': 'gts-hub' } },
  });
  _clientUrl = c.url;
  return _client;
}

// ─── Table bootstrap ───────────────────────────────────────────────────────
export function tableMissing(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || error.details || '');
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST204') return true;
  return /gts_sync/i.test(msg) && /(schema cache|does not exist|not find)/i.test(msg);
}

/** Creates the table with a direct Postgres connection (first run only). */
export async function ensureTable(env = process.env) {
  const urls = [env.POSTGRES_URL, env.POSTGRES_URL_NON_POOLING, env.POSTGRES_PRISMA_URL, env.DATABASE_URL].filter(Boolean);
  if (!urls.length) throw Object.assign(new Error('The gts_sync table does not exist yet and no POSTGRES_URL is set to create it. Run the SQL below in Supabase → SQL editor.'), { needsTable: true });
  let lastErr = null;
  for (const url of urls) {
    let sql = null;
    try {
      const mod = await import('postgres');
      const postgres = mod.default || mod;
      sql = postgres(url, { ssl: 'require', max: 1, prepare: false, connect_timeout: 12, idle_timeout: 2 });
      await sql.unsafe(SETUP_SQL);
      await sql.end({ timeout: 3 });
      return true;
    } catch (e) {
      lastErr = e;
      try { await sql?.end({ timeout: 1 }); } catch { /* ignore */ }
    }
  }
  throw Object.assign(new Error(`Could not create the gts_sync table automatically (${String(lastErr?.message || lastErr)}). Run the SQL below in Supabase → SQL editor.`), { needsTable: true });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Runs `fn`; if the table is missing, creates it and retries (PostgREST reloads its schema cache within a moment). */
export async function withTable(fn) {
  try {
    return await fn();
  } catch (e) {
    if (!tableMissing(e)) throw e;
  }
  await ensureTable();
  let lastErr = null;
  for (let i = 0; i < 4; i++) {
    await sleep(700 + i * 600);
    try { return await fn(); } catch (e) { lastErr = e; if (!tableMissing(e)) throw e; }
  }
  throw Object.assign(new Error(`Table created but the API cannot see it yet — try again in a minute. (${String(lastErr?.message || lastErr)})`), { needsTable: false });
}

// ─── Row access ────────────────────────────────────────────────────────────
const COLS = 'rev, doc, passcode_hash, passcode_salt, updated_at';
const EMPTY_ROW = { rev: 0, doc: null, passcode_hash: null, passcode_salt: null, updated_at: null };

export async function readRow() {
  const sb = await client();
  const { data, error } = await sb.from(TABLE).select(COLS).eq('id', ROW_ID).maybeSingle();
  if (error) throw error;
  if (data) return { ...data, rev: Number(data.rev || 0) };
  const ins = await sb.from(TABLE).insert({ id: ROW_ID, rev: 0, doc: null });
  if (ins.error && ins.error.code !== '23505') throw ins.error;
  return { ...EMPTY_ROW };
}

/** Compare-and-set write. Returns { rev } on success or { conflict, rev, doc }. */
export async function casWrite(baseRev, doc) {
  const sb = await client();
  const nextRev = baseRev + 1;
  const now = new Date().toISOString();
  const { data, error } = await sb.from(TABLE).update({ rev: nextRev, doc, updated_at: now }).eq('id', ROW_ID).eq('rev', baseRev).select('rev');
  if (error) throw error;
  if (Array.isArray(data) && data.length) return { rev: nextRev, updatedAt: now };
  const cur = await readRow();
  return { conflict: true, rev: cur.rev, doc: cur.doc };
}

// ─── Passcode ──────────────────────────────────────────────────────────────
export function hashPasscode(pass, salt) {
  return createHash('sha256').update(`${salt}:${pass}`).digest('hex');
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Passcodes travel URL-encoded in a header so any character works. */
export function keyFromRequest(req) {
  const raw = req.headers.get('x-gts-key');
  if (!raw) return '';
  try { return decodeURIComponent(raw); } catch { return raw; }
}

/** @returns {{ needsSetup: boolean, ok: boolean }} */
export function checkPasscode(row, supplied, env = process.env) {
  const override = env.GTS_SYNC_KEY;
  if (override) return { needsSetup: false, ok: !!supplied && safeEqual(supplied, override) };
  if (!row?.passcode_hash) return { needsSetup: true, ok: false };
  if (!supplied) return { needsSetup: false, ok: false };
  return { needsSetup: false, ok: safeEqual(hashPasscode(supplied, row.passcode_salt || ''), row.passcode_hash) };
}

export async function setPasscode(pass, { onlyIfUnset = false } = {}) {
  const sb = await client();
  const salt = randomBytes(16).toString('hex');
  let q = sb.from(TABLE).update({ passcode_hash: hashPasscode(pass, salt), passcode_salt: salt }).eq('id', ROW_ID);
  if (onlyIfUnset) q = q.is('passcode_hash', null);
  const { data, error } = await q.select('id');
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

// Brute-force damping (per warm instance — cheap and good enough for a counter tool).
const fails = { n: 0, at: 0 };
export function noteFailure(now = Date.now()) {
  if (now - fails.at > 60_000) { fails.n = 0; fails.at = now; }
  fails.n += 1;
}
export function throttled(now = Date.now()) {
  return now - fails.at < 60_000 && fails.n >= 25;
}

// ─── Realtime broadcast (REST — no socket needed on the server) ────────────
export async function broadcast(payload, c = config()) {
  if (!c) return false;
  try {
    const res = await fetch(`${c.url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: c.serviceKey, authorization: `Bearer ${c.serviceKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic: CHANNEL, event: 'rev', payload }] }),
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Response helpers ──────────────────────────────────────────────────────
export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export function failure(e) {
  const body = { enabled: true, error: String(e?.message || e) };
  if (e?.needsTable) { body.needsTable = true; body.sql = SETUP_SQL; }
  return json(body, 502);
}
