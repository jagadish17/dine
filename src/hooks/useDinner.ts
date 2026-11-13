import { useCallback, useEffect, useRef, useState } from 'react';
import { merge, type Dinner, type Meta, type Person } from '../lib/dinner';
import { deviceKey, listen, save } from '../lib/sync';

// Everyone's choices are saved online (encrypted, on public Nostr relays — see lib/sync.ts), so a
// friend who opens the link later still sees them. This phone also keeps a copy in localStorage,
// so the page shows instantly and works offline; changes made offline are sent once back online.
export type SaveStatus = 'loading' | 'saved' | 'saving' | 'offline';

const KEY = (code: string) => `dinetogether:dinner:${code}`;
const load = (code: string): Dinner | null => { try { return JSON.parse(localStorage.getItem(KEY(code)) || 'null'); } catch { return null; } };
const keep = (d: Dinner) => { try { localStorage.setItem(KEY(d.code), JSON.stringify(d)); } catch { /* ignore */ } };

export function useDinner(code: string, metaFromLink: Meta | null) {
  const meId = deviceKey().pubkey; // my identity = this device's signing key
  const [dinner, setDinner] = useState<Dinner | null>(() => {
    const saved = load(code);
    if (saved) return metaFromLink && !saved.meta ? { ...saved, meta: metaFromLink } : saved;
    return metaFromLink ? { code, meta: metaFromLink, people: {} } : null;
  });
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [loaded, setLoaded] = useState(false);
  const latest = useRef(dinner);
  latest.current = dinner;
  const remoteMine = useRef(0); // updatedAt of my entry as stored online
  const pending = useRef<{ person?: Person; foods?: Dinner['foods'] }>({});

  useEffect(() => { if (dinner) keep(dinner); }, [dinner]);

  const flush = useCallback(async () => {
    const p = pending.current;
    if (!p.person && !p.foods) return;
    setStatus('saving');
    const results = await Promise.all([
      p.person ? save(code, 'person', p.person) : true,
      p.foods ? save(code, 'foods', p.foods) : true,
    ]);
    if (results.every(Boolean)) {
      if (p.person === pending.current.person) delete pending.current.person;
      if (p.foods === pending.current.foods) delete pending.current.foods;
      if (p.person) remoteMine.current = p.person.updatedAt;
      setStatus('saved');
    } else setStatus('offline');
  }, [code]);

  // Load what's saved online, then keep listening for changes from everyone.
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    listen(code, (msg) => {
      if (cancelled) return;
      if (msg.type === 'person') {
        const person = { ...msg.data, id: msg.pubkey } as Person; // entry belongs to its signer
        if (msg.pubkey === meId) remoteMine.current = Math.max(remoteMine.current, Number(person.updatedAt) || 0);
        setDinner((cur) => (cur ? merge(cur, { code, people: { [msg.pubkey]: person } }) : cur));
      } else {
        setDinner((cur) => (cur ? merge(cur, { code, foods: msg.data }) : cur));
      }
    }, () => {
      if (cancelled) return;
      setLoaded(true);
      setStatus('saved');
      // Something I changed while offline (or before this version)? Send it now.
      const mine = latest.current?.people[meId];
      if (mine && mine.updatedAt > remoteMine.current) { pending.current.person = mine; void flush(); }
    }).then((s) => { if (cancelled) s(); else stop = s; });
    return () => { cancelled = true; stop?.(); };
  }, [code, meId, flush]);

  // Retry unsent changes every 15 s while offline.
  useEffect(() => {
    if (status !== 'offline') return;
    const t = setInterval(() => void flush(), 15000);
    return () => clearInterval(t);
  }, [status, flush]);

  /** Save my own choice (here immediately, online in the background). */
  const updateMe = useCallback((patch: Omit<Person, 'id' | 'updatedAt'>) => {
    const person: Person = { ...patch, id: meId, updatedAt: Date.now() };
    setDinner((cur) => (cur ? { ...cur, people: { ...cur.people, [meId]: person } } : cur));
    pending.current.person = person;
    void flush();
  }, [meId, flush]);

  /** Share the nearby-foods list so friends get it instantly. */
  const setFoods = useCallback((foods: NonNullable<Dinner['foods']>) => {
    if (latest.current?.foods) return;
    setDinner((cur) => (cur && !cur.foods ? { ...cur, foods } : cur));
    pending.current.foods = foods;
    void flush();
  }, [flush]);

  return { dinner, meId, status, loaded, updateMe, setFoods };
}
