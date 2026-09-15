// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — LIVE CHANNEL (Supabase Realtime, browser side)
//  • Broadcast: the server pings { rev } after every write → we pull.
//  • Presence: every open device announces its tech/station → "who's online".
//  The SDK is loaded lazily, only once sync is actually connected, so local
//  mode never downloads it. Connection details come from GET /api/sync.
// ═══════════════════════════════════════════════════════════════════════════

let clientPromise = null;
let clientKey = null;

async function getClient(url, anonKey) {
  const key = `${url}|${anonKey}`;
  if (!clientPromise || clientKey !== key) {
    clientKey = key;
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) => createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 5 } },
    }));
  }
  return clientPromise;
}

/** Flattens Supabase's presence map into [{ key, ...payload }]. */
export function flattenPresence(state) {
  const out = [];
  for (const [key, entries] of Object.entries(state || {})) {
    const list = Array.isArray(entries) ? entries : (entries?.metas || []);
    for (const meta of list) out.push({ key, ...meta });
  }
  return out;
}

/**
 * Opens the team channel.
 * @param {object} opts
 * @param {string} opts.url            Supabase project URL
 * @param {string} opts.anonKey        public anon key
 * @param {string} opts.channel        channel name (server decides)
 * @param {string} opts.presenceKey    this device's id
 * @param {() => object} opts.presence current presence payload
 * @param {(payload:object) => void} opts.onPing      broadcast from the server
 * @param {(list:Array) => void} opts.onPresence      online devices
 * @param {(status:string, err?:any) => void} opts.onStatus
 * @returns {{ track:(p:object)=>void, close:()=>void }}
 */
export function openLiveChannel({ url, anonKey, channel, presenceKey, presence, onPing, onPresence, onStatus }) {
  let closed = false;
  let client = null;
  let chan = null;
  let subscribed = false;

  (async () => {
    try {
      client = await getClient(url, anonKey);
      if (closed) return;
      chan = client.channel(channel, { config: { presence: { key: presenceKey }, broadcast: { self: false, ack: false } } });
      chan
        .on('broadcast', { event: 'rev' }, (msg) => { if (!closed) onPing?.(msg?.payload || {}); })
        .on('presence', { event: 'sync' }, () => { if (!closed) onPresence?.(flattenPresence(chan.presenceState())); })
        .subscribe((status, err) => {
          if (closed) return;
          subscribed = status === 'SUBSCRIBED';
          onStatus?.(status, err);
          if (subscribed) { try { chan.track({ ...presence(), at: new Date().toISOString() }); } catch { /* ignore */ } }
        });
    } catch (e) {
      if (!closed) onStatus?.('ERROR', e);
    }
  })();

  return {
    track(payload) {
      if (!chan || !subscribed || closed) return;
      try { chan.track({ ...payload, at: new Date().toISOString() }); } catch { /* ignore */ }
    },
    close() {
      closed = true;
      subscribed = false;
      const c = chan; const cl = client;
      chan = null;
      if (c && cl) {
        try { c.untrack?.(); } catch { /* ignore */ }
        try { cl.removeChannel(c); } catch { /* ignore */ }
      }
    },
  };
}
