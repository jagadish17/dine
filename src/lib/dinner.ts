// Dinner data shared between phones. Each person owns exactly one entry (keyed by their own id)
// and only ever changes that entry, so merging is simple: the newest version of each entry wins.

export interface Item { foodId: string; name: string; price: number; qty: number }
export interface Person { id: string; name: string; items: Item[]; updatedAt: number; left?: boolean }
export interface Meta { name: string; lat: number; lng: number; area: string; createdAt: number }
import type { FoodsNear } from './places';

/** meta is null until the dinner's name/area is known (from the link, this phone, or online). */
export interface Dinner { code: string; meta: Meta | null; people: Record<string, Person>; foods?: FoodsNear }

/** Merge another phone's copy into ours. Returns the same object if nothing changed. */
export function merge(mine: Dinner, theirs: Partial<Dinner> | null | undefined): Dinner {
  if (!theirs || typeof theirs !== 'object' || theirs.code !== mine.code) return mine;
  let changed = false;
  const people = { ...mine.people };
  for (const [id, p] of Object.entries(theirs.people ?? {})) {
    if (!isPerson(p) || p.id !== id || !isOwnerId(id)) continue;
    if (!people[id] || p.updatedAt > people[id].updatedAt) { people[id] = sanitize(p); changed = true; }
  }
  // The first phone to look up nearby foods shares the list, so others don't search again.
  const foods = !mine.foods && isFoods(theirs.foods) ? theirs.foods : mine.foods;
  if (foods !== mine.foods) changed = true;
  // Name/area: keep what we already have (from the link or this phone); otherwise take it.
  const meta = !mine.meta && isMeta(theirs.meta) ? theirs.meta : mine.meta;
  if (meta !== mine.meta) changed = true;
  return changed ? { ...mine, people, foods, meta } : mine;
}

function isFoods(f: any): f is FoodsNear {
  return f && typeof f.restaurantCount === 'number' && Array.isArray(f.foods) && f.foods.every((x: any) => typeof x.id === 'string' && typeof x.count === 'number' && Array.isArray(x.nearest));
}

/** Entries are keyed by the device's public signing key (64 hex chars). Older app versions used
 *  random ids that were never saved online; those are ignored so they can't block names. */
export const isOwnerId = (id: string) => /^[0-9a-f]{64}$/.test(id);

export function isMeta(m: any): m is Meta {
  return m && typeof m.name === 'string' && typeof m.area === 'string' && Number.isFinite(m.lat) && Number.isFinite(m.lng) && Math.abs(m.lat) <= 90 && Math.abs(m.lng) <= 180;
}

function isPerson(p: any): p is Person {
  return p && typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.items) && typeof p.updatedAt === 'number';
}
const sanitize = (p: Person): Person => ({
  id: p.id.slice(0, 64),
  name: String(p.name).slice(0, 40),
  updatedAt: p.updatedAt,
  left: !!p.left,
  items: p.items.slice(0, 20).map((i) => ({
    foodId: String(i.foodId).slice(0, 40),
    name: String(i.name).slice(0, 60),
    price: Math.max(0, Math.min(100000, Number(i.price) || 0)),
    qty: Math.max(1, Math.min(50, Math.round(Number(i.qty) || 1))),
  })),
});

export interface Summary {
  people: { person: Person; total: number; count: number }[];
  total: number;
  itemCount: number;
  average: number;
  counts: { name: string; qty: number; people: string[] }[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Individual = Σ price × qty; Group total = Σ individuals; Average = total / people who chose. */
export function summarize(d: Dinner): Summary {
  const people = Object.values(d.people)
    .filter((p) => !p.left && p.items.length)
    .map((person) => ({ person, total: round2(person.items.reduce((t, i) => t + i.price * i.qty, 0)), count: person.items.reduce((t, i) => t + i.qty, 0) }));
  const total = round2(people.reduce((t, p) => t + p.total, 0));
  const counts = new Map<string, { name: string; qty: number; people: string[] }>();
  for (const { person } of people) for (const i of person.items) {
    const c = counts.get(i.name) ?? { name: i.name, qty: 0, people: [] };
    c.qty += i.qty;
    if (!c.people.includes(person.name)) c.people.push(person.name);
    counts.set(i.name, c);
  }
  return {
    people,
    total,
    itemCount: people.reduce((t, p) => t + p.count, 0),
    average: people.length ? round2(total / people.length) : 0,
    counts: [...counts.values()].sort((a, b) => b.qty - a.qty),
  };
}

export const formatINR = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(n);

// ---- links & codes ----
// The dinner's name/area are saved online, so the short code alone is enough to join.
// The link also carries them as a backup, in case the online copy can't be reached.
export function shareUrl(d: Dinner) {
  const base = `${location.origin}${location.pathname}#/g/${d.code}`;
  if (!d.meta) return base;
  const q = new URLSearchParams({ n: d.meta.name, a: d.meta.area, lat: d.meta.lat.toFixed(5), lng: d.meta.lng.toFixed(5), t: String(d.meta.createdAt) });
  return `${base}?${q}`;
}
export const displayCode = (code: string) => code.toUpperCase();

/** Accepts a dinner link or a typed code ("K7M2QX", "k7m2qx", "…/#/g/k7m2qx?…"). */
export function parseJoin(input: string): { code: string; query: string } | null {
  const s = input.trim();
  const m = s.match(/#\/g\/([a-z0-9]{4,16})(\?\S*)?/i);
  if (m) return { code: m[1].toLowerCase(), query: m[2] || '' };
  const c = s.replace(/[\s-]/g, '');
  return /^[a-z0-9]{4,16}$/i.test(c) ? { code: c.toLowerCase(), query: '' } : null;
}
export function metaFromQuery(q: URLSearchParams): Meta | null {
  const lat = Number(q.get('lat')), lng = Number(q.get('lng'));
  if (!q.get('n') || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { name: q.get('n')!.slice(0, 60), area: (q.get('a') || 'Dinner area').slice(0, 120), lat, lng, createdAt: Number(q.get('t')) || Date.now() };
}

const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
/** 6 characters, no look-alikes (0/o, 1/l/i): easy to read out or type. ~890 million combinations. */
export const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
export const newId = () => crypto.randomUUID();
