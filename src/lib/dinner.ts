// Dinner data shared between phones. Each person owns exactly one entry (keyed by their own id)
// and only ever changes that entry, so merging is simple: the newest version of each entry wins.

export interface Item { foodId: string; name: string; price: number; qty: number }
export interface Person { id: string; name: string; items: Item[]; updatedAt: number; left?: boolean }
export interface Meta { name: string; lat: number; lng: number; area: string; createdAt: number }
import type { FoodsNear } from './places';

export interface Dinner { code: string; meta: Meta; people: Record<string, Person>; foods?: FoodsNear }

/** Merge another phone's copy into ours. Returns the same object if nothing changed. */
export function merge(mine: Dinner, theirs: Partial<Dinner> | null | undefined): Dinner {
  if (!theirs || typeof theirs !== 'object' || theirs.code !== mine.code) return mine;
  let changed = false;
  const people = { ...mine.people };
  for (const [id, p] of Object.entries(theirs.people ?? {})) {
    if (!isPerson(p) || p.id !== id) continue;
    if (!people[id] || p.updatedAt > people[id].updatedAt) { people[id] = sanitize(p); changed = true; }
  }
  // The first phone to look up nearby foods shares the list, so others don't search again.
  const foods = !mine.foods && isFoods(theirs.foods) ? theirs.foods : mine.foods;
  if (foods !== mine.foods) changed = true;
  return changed ? { ...mine, people, foods } : mine;
}

function isFoods(f: any): f is FoodsNear {
  return f && typeof f.restaurantCount === 'number' && Array.isArray(f.foods) && f.foods.every((x: any) => typeof x.id === 'string' && typeof x.count === 'number' && Array.isArray(x.nearest));
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

// ---- links: the dinner's name and area travel inside the link itself ----
export function shareUrl(d: Dinner) {
  const q = new URLSearchParams({ n: d.meta.name, a: d.meta.area, lat: d.meta.lat.toFixed(5), lng: d.meta.lng.toFixed(5), t: String(d.meta.createdAt) });
  return `${location.origin}${location.pathname}#/g/${d.code}?${q}`;
}
export function metaFromQuery(q: URLSearchParams): Meta | null {
  const lat = Number(q.get('lat')), lng = Number(q.get('lng'));
  if (!q.get('n') || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { name: q.get('n')!.slice(0, 60), area: (q.get('a') || 'Dinner area').slice(0, 120), lat, lng, createdAt: Number(q.get('t')) || Date.now() };
}

const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
export const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
export const newId = () => crypto.randomUUID();
