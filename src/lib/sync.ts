// Online saving + live updates without our own server.
//
// Each dinner's data is stored as signed, encrypted events on several free public Nostr relays:
//  - one event per person (their name + items), replaceable only by that person's own device key
//  - one "foods" event with the list of foods available within 12 km (shared by whoever found it)
// Anyone opening the link loads everything stored so far, then gets new changes live.
// The content is AES-GCM encrypted with a key derived from the dinner code (only in the link),
// and the relay "topic" is a hash of the code, so relays and strangers can't read or find it.
import { finalizeEvent, generateSecretKey, getPublicKey, type Event } from 'nostr-tools/pure';
import { SimplePool } from 'nostr-tools/pool';

// Checked: these relays accept and return this kind of event. Several, so one or two down is fine.
export const RELAYS = [
  'wss://relay.primal.net',
  'wss://purplerelay.com',
  'wss://nostr.data.haus',
  'wss://relay.mostro.network',
  'wss://nostr-01.yakihonne.com',
  'wss://nos.lol',
];
const KIND = 30078; // "application-specific data", replaceable per author + "d" tag

let pool: SimplePool | null = null;
const getPool = () => (pool ??= new SimplePool());

// ---- this device's signing key (its identity in every dinner) ----
const SK_KEY = 'dinetogether:device-key';
function hex(bytes: Uint8Array) { return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''); }
function unhex(s: string) { return new Uint8Array(s.match(/.{2}/g)!.map((h) => parseInt(h, 16))); }
let secret: Uint8Array | null = null;
export function deviceKey(): { sk: Uint8Array; pubkey: string } {
  if (!secret) {
    try {
      const saved = localStorage.getItem(SK_KEY);
      secret = saved && /^[0-9a-f]{64}$/.test(saved) ? unhex(saved) : generateSecretKey();
      localStorage.setItem(SK_KEY, hex(secret));
    } catch { secret = generateSecretKey(); }
  }
  return { sk: secret, pubkey: getPublicKey(secret) };
}

// ---- per-dinner topic + encryption key, derived from the code ----
const enc = new TextEncoder();
const dec = new TextDecoder();
async function sha256(s: string) { return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
const keys = new Map<string, Promise<{ topic: string; key: CryptoKey }>>();
function dinnerKeys(code: string) {
  if (!keys.has(code)) {
    keys.set(code, (async () => ({
      topic: 'dt1-' + hex(await sha256(`dinetogether:topic:${code}`)).slice(0, 40),
      key: await crypto.subtle.importKey('raw', await sha256(`dinetogether:key:${code}`), 'AES-GCM', false, ['encrypt', 'decrypt']),
    }))());
  }
  return keys.get(code)!;
}
async function encrypt(code: string, data: unknown) {
  const { key } = await dinnerKeys(code);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data))));
  const all = new Uint8Array(iv.length + ct.length); all.set(iv); all.set(ct, iv.length);
  return btoa(String.fromCharCode(...all));
}
async function decrypt(code: string, content: string): Promise<any | null> {
  try {
    const { key } = await dinnerKeys(code);
    const all = Uint8Array.from(atob(content), (c) => c.charCodeAt(0));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, key, all.slice(12));
    return JSON.parse(dec.decode(pt));
  } catch { return null; } // not ours / tampered
}

export type Incoming = { type: 'person'; pubkey: string; data: any } | { type: 'foods'; data: any };

/** Save one record (my choice, or the foods list). Resolves true once at least one relay stored it. */
export async function save(code: string, slot: 'person' | 'foods', data: unknown): Promise<boolean> {
  const { topic } = await dinnerKeys(code);
  const { sk } = deviceKey();
  const event = finalizeEvent({
    kind: KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['d', `${topic}:${slot}`], ['t', topic]],
    content: await encrypt(code, { slot, data }),
  }, sk);
  const attempts = getPool().publish(RELAYS, event).map((p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))]));
  try { await Promise.any(attempts); return true; } catch { return false; }
}

/** Load everything saved for this dinner, then keep listening for changes. */
export async function listen(code: string, onData: (msg: Incoming) => void, onLoaded: () => void): Promise<() => void> {
  const { topic } = await dinnerKeys(code);
  const handle = async (ev: Event) => {
    const msg = await decrypt(code, ev.content);
    if (!msg || typeof msg !== 'object') return;
    if (msg.slot === 'person' && ev.tags.some((t) => t[0] === 'd' && t[1] === `${topic}:person`)) onData({ type: 'person', pubkey: ev.pubkey, data: msg.data });
    if (msg.slot === 'foods') onData({ type: 'foods', data: msg.data });
  };
  let loaded = false;
  const done = () => { if (!loaded) { loaded = true; onLoaded(); } };
  const timer = setTimeout(done, 6000); // don't wait forever on a slow relay
  const sub = getPool().subscribeMany(RELAYS, { kinds: [KIND], '#t': [topic] }, {
    onevent: (ev) => { void handle(ev); },
    oneose: () => { clearTimeout(timer); done(); },
  });
  return () => { clearTimeout(timer); sub.close(); };
}
