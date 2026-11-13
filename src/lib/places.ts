// Runs in the browser (GitHub Pages has no server). Finds real restaurants within 12 km from
// three free OpenStreetMap services and works out which foods are available nearby.
// Nothing is invented: no ratings, prices or photos exist in OpenStreetMap, so none are shown.
import { FOODS, foodById } from '../../shared/foods.js';

export const RADIUS_KM = 12;
export interface Place { id: string; name: string; distanceKm: number; foods: string[] }
export interface FoodsNear { radiusKm: number; restaurantCount: number; foods: { id: string; count: number; nearest: { name: string; distanceKm: number }[] }[] }

const CACHE_TTL = 24 * 60 * 60 * 1000;
const cacheGet = <T,>(k: string): T | null => {
  try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && Date.now() - v.at < CACHE_TTL ? v.value : null; } catch { return null; }
};
const cacheSet = (k: string, value: unknown) => { try { localStorage.setItem(k, JSON.stringify({ at: Date.now(), value })); } catch { /* storage full or blocked */ } };

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, rad = Math.PI / 180;
  const s = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const matchFoods = (text: string, ids = FOODS.map((f) => f.id)) =>
  ids.filter((id) => { const f = foodById(id)!; return new RegExp(f.cuisine, 'i').test(text) || new RegExp(f.name, 'i').test(text); });

const timeout = (ms: number) => AbortSignal.timeout(ms);

// ---- Nominatim: 1 request per second (usage policy), so calls are queued ----
let queue: Promise<unknown> = Promise.resolve();
let last = 0;
function nominatim(url: string): Promise<any[]> {
  const run = queue.then(async () => {
    const wait = 1100 - (Date.now() - last);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    let res = await fetch(url, { signal: timeout(15000) }).catch(() => null);
    if (!res || res.status === 429) { // busy: wait and try once more
      await new Promise((r) => setTimeout(r, 2500));
      last = Date.now();
      res = await fetch(url, { signal: timeout(15000) });
    }
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    return res.json();
  });
  queue = run.catch(() => {});
  return run as Promise<any[]>;
}

function box(lat: number, _lng?: number) {
  const dLat = (RADIUS_KM * 1000) / 111320;
  const dLng = (RADIUS_KM * 1000) / (111320 * Math.cos((lat * Math.PI) / 180));
  return { dLat, dLng };
}

async function fromNominatim(lat: number, lng: number, foodId?: string): Promise<Place[]> {
  const { dLat, dLng } = box(lat, lng);
  const vb = (a: number, b: number, c: number, d: number) => [a, b, c, d].map((n) => n.toFixed(5)).join(',');
  const base = 'https://nominatim.openstreetmap.org/search?format=jsonv2&bounded=1&limit=40&accept-language=en';
  const full = vb(lng - dLng, lat + dLat, lng + dLng, lat - dLat);
  const urls = foodId
    ? foodById(foodId)!.name.split('|').slice(0, 1).map((t) => `${base}&q=${encodeURIComponent(t)}&viewbox=${full}`)
    : [
        `${base}&amenity=restaurant&viewbox=${vb(lng - dLng / 3, lat + dLat / 3, lng + dLng / 3, lat - dLat / 3)}`,
        `${base}&amenity=restaurant&viewbox=${vb(lng - dLng, lat + dLat, lng, lat)}`,
        `${base}&amenity=restaurant&viewbox=${vb(lng, lat + dLat, lng + dLng, lat)}`,
        `${base}&amenity=restaurant&viewbox=${vb(lng - dLng, lat, lng, lat - dLat)}`,
        `${base}&amenity=restaurant&viewbox=${vb(lng, lat, lng + dLng, lat - dLat)}`,
        `${base}&amenity=fast_food&viewbox=${full}`,
      ];
  const settled = await Promise.allSettled(urls.map(nominatim));
  if (settled.every((s) => s.status === 'rejected')) throw new Error('Nominatim unavailable');
  return settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []))
    .filter((r) => r.name && ['restaurant', 'fast_food', 'food_court'].includes(r.type))
    .map((r) => ({ id: `${r.osm_type}/${r.osm_id}`, name: r.name, distanceKm: distanceKm({ lat, lng }, { lat: +r.lat, lng: +r.lon }), foods: matchFoods(r.name) }));
}

async function fromPhoton(lat: number, lng: number): Promise<Place[]> {
  const { dLat, dLng } = box(lat, lng);
  const bbox = [lng - dLng, lat - dLat, lng + dLng, lat + dLat].map((n) => n.toFixed(5)).join(',');
  const terms = ['restaurant', 'hotel', 'mess', 'biryani', 'bhavan', 'dosa', 'parotta', 'grill', 'chinese', 'shawarma', 'pizza', 'burger'];
  const out: Place[] = [];
  let ok = 0;
  for (let i = 0; i < terms.length; i += 3) {
    const batch = await Promise.allSettled(terms.slice(i, i + 3).map(async (q) => {
      const res = await fetch(`https://photon.komoot.io/api/?q=${q}&bbox=${bbox}&limit=50&osm_tag=amenity:restaurant&osm_tag=amenity:fast_food`, { signal: timeout(7000) });
      if (!res.ok) throw new Error(`Photon ${res.status}`);
      return (await res.json()).features as any[];
    }));
    for (const b of batch) if (b.status === 'fulfilled') {
      ok++;
      for (const f of b.value) {
        const p = f.properties; if (!p?.name) continue;
        const [pLng, pLat] = f.geometry.coordinates;
        out.push({ id: `${({ N: 'node', W: 'way', R: 'relation' } as Record<string, string>)[p.osm_type] || 'node'}/${p.osm_id}`, name: p.name, distanceKm: distanceKm({ lat, lng }, { lat: pLat, lng: pLng }), foods: matchFoods(p.name) });
      }
    }
    if (i === 0 && ok === 0) break; // service down: don't keep trying
  }
  if (!ok) throw new Error('Photon unavailable');
  return out;
}

async function fromOverpass(lat: number, lng: number): Promise<Place[]> {
  const q = `[out:json][timeout:12];nwr["amenity"~"^(restaurant|fast_food|food_court)$"]["name"](around:${RADIUS_KM * 1000},${lat},${lng});out center tags 400;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: timeout(9000) });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const json = await res.json();
  return (json.elements || []).filter((e: any) => e.tags?.name).map((e: any) => {
    const pLat = e.lat ?? e.center?.lat, pLng = e.lon ?? e.center?.lon;
    return { id: `${e.type}/${e.id}`, name: e.tags.name, distanceKm: distanceKm({ lat, lng }, { lat: pLat, lng: pLng }), foods: matchFoods(`${e.tags.cuisine || ''} ${e.tags.name}`) };
  });
}

/** Which foods are served by restaurants within 12 km. Cached on this device for 24 hours. */
export async function foodsNear(lat: number, lng: number): Promise<FoodsNear> {
  const key = `dinetogether:foods:${lat.toFixed(3)},${lng.toFixed(3)}`;
  const hit = cacheGet<FoodsNear>(key);
  if (hit) return hit;

  const results = await Promise.allSettled([fromOverpass(lat, lng), fromPhoton(lat, lng), fromNominatim(lat, lng)]);
  if (results.every((r) => r.status === 'rejected')) throw new Error('The free map services aren’t responding right now. Please try again in a minute.');
  const all = new Map<string, Place>();
  for (const r of results) if (r.status === 'fulfilled') for (const p of r.value) if (p.distanceKm <= RADIUS_KM && !all.has(p.id)) all.set(p.id, p);

  const byFood = new Map(FOODS.map((f) => [f.id, new Map<string, Place>()]));
  for (const p of all.values()) for (const id of p.foods) byFood.get(id)!.set(p.id, p);
  // A few foods with no match at all get one quick targeted name search (e.g. "shawarma"),
  // capped so the check stays fast.
  const missing = FOODS.filter((f) => byFood.get(f.id)!.size === 0).slice(0, 4);
  await Promise.allSettled(missing.map(async (f) => {
    for (const p of await fromNominatim(lat, lng, f.id)) if (p.distanceKm <= RADIUS_KM && p.foods.includes(f.id)) byFood.get(f.id)!.set(p.id, p);
  }));
  const value: FoodsNear = {
    radiusKm: RADIUS_KM,
    restaurantCount: all.size,
    foods: FOODS.map((f) => {
      const places = [...byFood.get(f.id)!.values()].sort((a, b) => a.distanceKm - b.distanceKm);
      return { id: f.id, count: places.length, nearest: places.slice(0, 3).map((p) => ({ name: p.name, distanceKm: Math.round(p.distanceKm * 10) / 10 })) };
    }).filter((f) => f.count > 0).sort((a, b) => b.count - a.count),
  };
  if (value.foods.length) cacheSet(key, value);
  return value;
}

export async function geocode(q: string): Promise<{ label: string; lat: number; lng: number }[]> {
  const rows = await nominatim(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=en&q=${encodeURIComponent(q)}`);
  return rows.map((r) => ({ label: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }));
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const j: any = await nominatim(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=en&lat=${lat}&lon=${lng}`);
    const a = j.address || {};
    return [a.suburb || a.neighbourhood || a.village, a.city || a.town].filter(Boolean).join(', ') || 'My location';
  } catch { return 'My location'; }
}
