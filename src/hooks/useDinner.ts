import { useCallback, useEffect, useRef, useState } from 'react';
import { isMeta, isOwnerId, merge, type Dinner, type Meta, type Person } from '../lib/dinner';
import { deviceKey, listen, save } from '../lib/sync';

// Everything about a dinner — its name/area, everyone's choices, and the nearby-foods list — is
// saved online (encrypted, on public Nostr relays; see lib/sync.ts). So a friend can join with just
// the code or link, at any time, and see everyone's latest choices. This phone keeps a copy too,
// so the page opens instantly and works offline; offline changes are sent once back online.
export type SaveStatus = 'loading' | 'saved' | 'saving' | 'offline';

const KEY = (code: string) => `dinetogether:dinner:${code}`;
const RECENT = 'dinetogether:recent';

function loadLocal(code: string): Dinner | null {
  try {
    const d = JSON.parse(localStorage.getItem(KEY(code)) || 'null') as Dinner | null;
    if (!d) return null;
    // Drop entries from older app versions (never saved online; would block reusing a name).
    const people = Object.fromEntries(Object.entries(d.people || {}).filter(([id]) => isOwnerId(id)));
    return { ...d, meta: isMeta(d.meta) ? d.meta : null, people };
  } catch { return null; }
}
function keepLocal(d: Dinner) {
  try {
    localStorage.setItem(KEY(d.code), JSON.stringify(d));
    if (d.meta) {
      const list = recentDinners().filter((r) => r.code !== d.code);
      list.unshift({ code: d.code, name: d.meta.name, area: d.meta.area.split(',')[0], at: Date.now() });
      localStorage.setItem(RECENT, JSON.stringify(list.slice(0, 6)));
    }
  } catch { /* storage blocked */ }
}
export function recentDinners(): { code: string; name: string; area: string; at: number }[] {
  try { return JSON.parse(localStorage.getItem(RECENT) || '[]'); } catch { return []; }
}

export function useDinner(code: string, metaFromLink: Meta | null) {
  const meId = deviceKey().pubkey; // my identity = this device's signing key
  const [dinner, setDinner] = useState<Dinner>(() => {
    const saved = loadLocal(code);
    if (saved) return saved.meta || !metaFromLink ? saved : { ...saved, meta: metaFromLink };
    return { code, meta: metaFromLink, people: {} };
  });
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [loaded, setLoaded] = useState(false);
  const latest = useRef(dinner);
  latest.current = dinner;
  const remote = useRef({ mine: 0, meta: false });
  const pending = useRef<{ person?: Person; foods?: Dinner['foods']; meta?: Meta }>({});

  useEffect(() => { keepLocal(dinner); }, [dinner]);

  const flush = useCallback(async () => {
    const p = { ...pending.current };
    if (!p.person && !p.foods && !p.meta) return;
    setStatus('saving');
    const ok = await Promise.all([
      p.meta ? save(code, 'meta', p.meta) : true,
      p.person ? save(code, 'person', p.person) : true,
      p.foods ? save(code, 'foods', p.foods) : true,
    ]);
    if (ok.every(Boolean)) {
      if (p.meta === pending.current.meta) { delete pending.current.meta; remote.current.meta = true; }
      if (p.person === pending.current.person) delete pending.current.person;
      if (p.foods === pending.current.foods) delete pending.current.foods;
      if (p.person) remote.current.mine = p.person.updatedAt;
      setStatus('saved');
    } else setStatus('offline');
  }, [code]);

  // Load everything saved online for this dinner, then keep listening for changes.
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    listen(code, (msg) => {
      if (cancelled) return;
      if (msg.type === 'person') {
        const person = { ...msg.data, id: msg.pubkey } as Person; // an entry belongs to its signer
        if (msg.pubkey === meId) remote.current.mine = Math.max(remote.current.mine, Number(person.updatedAt) || 0);
        setDinner((cur) => merge(cur, { code, people: { [msg.pubkey]: person } }));
      } else if (msg.type === 'foods') {
        setDinner((cur) => merge(cur, { code, foods: msg.data }));
      } else if (isMeta(msg.data)) {
        remote.current.meta = true;
        setDinner((cur) => merge(cur, { code, meta: msg.data }));
      }
    }, () => {
      if (cancelled) return;
      setLoaded(true);
      setStatus('saved');
      const cur = latest.current;
      // Make sure what this phone knows is online: the dinner's name/area (so the code alone
      // works) and my latest choice (e.g. made offline or with an older version of the app).
      if (cur.meta && !remote.current.meta) pending.current.meta = cur.meta;
      const mine = cur.people[meId];
      if (mine && mine.updatedAt > remote.current.mine) pending.current.person = mine;
      void flush();
    }).then((s) => { if (cancelled) s(); else stop = s; });
    return () => { cancelled = true; stop?.(); };
  }, [code, meId, flush]);

  // Retry unsent changes every 15 s while offline.
  useEffect(() => {
    if (status !== 'offline') return;
    const t = setInterval(() => void flush(), 15000);
    return () => clearInterval(t);
  }, [status, flush]);

  /** Save my own choice (shown here immediately, saved online in the background). */
  const updateMe = useCallback((patch: Omit<Person, 'id' | 'updatedAt'>) => {
    const person: Person = { ...patch, id: meId, updatedAt: Date.now() };
    setDinner((cur) => ({ ...cur, people: { ...cur.people, [meId]: person } }));
    pending.current.person = person;
    if (latest.current.meta && !remote.current.meta) pending.current.meta = latest.current.meta;
    void flush();
  }, [meId, flush]);

  /** Share the nearby-foods list so friends get it instantly. */
  const setFoods = useCallback((foods: NonNullable<Dinner['foods']>) => {
    if (latest.current.foods) return;
    setDinner((cur) => (cur.foods ? cur : { ...cur, foods }));
    pending.current.foods = foods;
    void flush();
  }, [flush]);

  return { dinner, meId, status, loaded, updateMe, setFoods };
}
