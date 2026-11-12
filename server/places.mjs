// Restaurant discovery behind one provider-independent shape.
//
//  - OpenStreetMap (Overpass API, ODbL): default, no key. Has names, locations and cuisine tags,
//    but no ratings, prices or photos — those fields stay null rather than being invented.
//  - Google Places API (New): used automatically when GOOGLE_PLACES_API_KEY is set on the server.
//    Provides ratings, price ranges and photos. The key never reaches the browser.
//
// Zomato closed its public API, so it isn't used, and nothing is scraped.
import { FOODS, foodById } from '../shared/foods.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RADIUS_M = 12_000;
const UA = 'DineTogether/1.0 (self-hosted group dinner planner)';
const OVERPASS = ['https://overpass-api.de/api/interpreter'];
const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY || '';

export const activeProvider = () => (GOOGLE_KEY ? 'google' : 'osm');

const cache = new Map(); // key -> { at, value }
const TTL = 10 * 60 * 1000;
async function cached(key, fn, ttl = TTL) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return value;
}

export function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const pretty = (s) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function matchFoods(text, foodIds) {
  const t = (text || '').toLowerCase();
  return foodIds.filter((id) => {
    const f = foodById(id);
    return f && (new RegExp(f.cuisine, 'i').test(t) || new RegExp(f.name, 'i').test(t));
  });
}

// ---------- OpenStreetMap ----------
// Three free OSM services are queried together and merged: Overpass (radius + cuisine tags),
// Photon (name search) and Nominatim (area search). Public instances go down often, so a
// service that fails is skipped for a few minutes instead of slowing every search.
const downUntil = { overpass: 0, photon: 0, nominatim: 0 };
const guarded = (name, fn) =>
  Date.now() < downUntil[name]
    ? Promise.reject(new Error(`${name} skipped`))
    : Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), CAP_MS[name]))]).catch((e) => {
        // A slow answer isn't an outage: only real errors put a service on the 5-minute skip list.
        if (e.message !== 'timed out') downUntil[name] = Date.now() + 5 * 60 * 1000;
        console.warn(`[places] ${name} failed: ${e.message}`);
        throw e;
      });
// Nominatim answers one request per second, so it gets more time than the others.
const CAP_MS = { overpass: 12_000, photon: 12_000, nominatim: 30_000 };

async function osmNearby({ lat, lng, foods }) {
  const results = await Promise.allSettled([
    guarded('overpass', () => overpassNearby({ lat, lng, foods })),
    guarded('photon', () => photonNearby({ lat, lng, foods })),
    guarded('nominatim', () => nominatimNearby({ lat, lng, foods })),
  ]);
  if (results.every((r) => r.status === 'rejected')) throw new Error('OpenStreetMap search is not responding right now. Please try again in a minute.');
  const map = new Map();
  for (const r of results.flatMap((x) => x.value || [])) if (!map.has(r.providerId)) map.set(r.providerId, r);
  return [...map.values()].sort((x, y) => x.distanceKm - y.distanceKm);
}

// Nominatim allows 1 request/second, so calls are queued.
let nominatimQueue = Promise.resolve();
function nominatimFetch(url) {
  const run = nominatimQueue.then(async () => {
    const wait = 1100 - (Date.now() - lastGeocode);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastGeocode = Date.now();
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    return res.json();
  });
  nominatimQueue = run.catch(() => {});
  return run;
}

async function nominatimNearby({ lat, lng, foods }) {
  const dLat = RADIUS_M / 111_320;
  const dLng = RADIUS_M / (111_320 * Math.cos((lat * Math.PI) / 180));
  const box = (a, b, c, d) => `${a.toFixed(5)},${b.toFixed(5)},${c.toFixed(5)},${d.toFixed(5)}`; // left,top,right,bottom
  const base = 'https://nominatim.openstreetmap.org/search?format=jsonv2&bounded=1&limit=40&addressdetails=1';
  let urls;
  if (foods.length) {
    const terms = [...new Set(foods.flatMap((id) => foodById(id).name.split('|')))].slice(0, 4);
    urls = terms.map((t) => `${base}&q=${encodeURIComponent(t)}&viewbox=${box(lng - dLng, lat + dLat, lng + dLng, lat - dLat)}`);
  } else {
    // Each request returns at most 40, so split the 12 km box into 4 quarters for restaurants.
    const quads = [[lng - dLng, lat + dLat, lng, lat], [lng, lat + dLat, lng + dLng, lat], [lng - dLng, lat, lng, lat - dLat], [lng, lat, lng + dLng, lat - dLat]];
    urls = [
      `${base}&amenity=restaurant&viewbox=${box(lng - dLng / 3, lat + dLat / 3, lng + dLng / 3, lat - dLat / 3)}`, // nearest first
      ...quads.map((q) => `${base}&amenity=restaurant&viewbox=${box(...q)}`),
      `${base}&amenity=fast_food&viewbox=${box(lng - dLng, lat + dLat, lng + dLng, lat - dLat)}`,
    ];
  }
  const settled = await Promise.allSettled(urls.map(nominatimFetch));
  const rows = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
  if (!rows.length && settled.every((s) => s.status === 'rejected')) throw new Error('Nominatim unavailable');
  const origin = { lat, lng };
  const allFoods = foods.length ? foods : FOODS.map((f) => f.id);
  return rows
    .filter((r) => r.name && ['restaurant', 'fast_food', 'food_court'].includes(r.type))
    .map((r) => {
      const pLat = Number(r.lat), pLng = Number(r.lon);
      const id = `${r.osm_type}/${r.osm_id}`;
      const a = r.address || {};
      return {
        provider: 'osm', providerId: id, name: r.name,
        address: [a.house_number, a.road, a.suburb || a.neighbourhood, a.city].filter(Boolean).join(', ') || null,
        lat: pLat, lng: pLng,
        distanceKm: Math.round(distanceKm(origin, { lat: pLat, lng: pLng }) * 100) / 100,
        rating: null, ratingCount: null, priceLabel: null, imageUrl: null,
        categories: [pretty(r.type)],
        matchedFoods: matchFoods(r.name, allFoods),
        sourceUrl: `https://www.openstreetmap.org/${id}`,
      };
    })
    .filter((r) => r.distanceKm <= RADIUS_M / 1000);
}

async function photonNearby({ lat, lng, foods }) {
  const dLat = RADIUS_M / 111_320;
  const dLng = RADIUS_M / (111_320 * Math.cos((lat * Math.PI) / 180));
  const bbox = [lng - dLng, lat - dLat, lng + dLng, lat + dLat].map((n) => n.toFixed(5)).join(',');
  const terms = foods.length
    ? [...new Set(foods.flatMap((id) => [foodById(id).label.toLowerCase(), ...foodById(id).name.split('|')]))].slice(0, 12)
    : ['restaurant', 'hotel', 'mess', 'kitchen', 'biryani', 'bhavan', 'dosa', 'parotta', 'grill', 'chinese', 'shawarma', 'pizza', 'cafe'];
  // At most 3 requests at a time (Photon's fair-use limit); one failed term doesn't sink the rest.
  const fetchTerm = async (q) => {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&bbox=${bbox}&limit=50&osm_tag=amenity:restaurant&osm_tag=amenity:fast_food&osm_tag=amenity:food_court`;
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Photon ${res.status}`);
    return (await res.json()).features || [];
  };
  const lists = [];
  let failed = 0;
  for (let i = 0; i < terms.length; i += 3) {
    const batch = await Promise.allSettled(terms.slice(i, i + 3).map(fetchTerm));
    for (const b of batch) b.status === 'fulfilled' ? lists.push(b.value) : failed++;
  }
  if (!lists.length) throw new Error(`Photon unavailable (${failed} failed)`);
  const origin = { lat, lng };
  const allFoods = foods.length ? foods : FOODS.map((f) => f.id);
  return lists.flat().filter((f) => f.properties?.name).map((f) => {
    const p = f.properties;
    const [pLng, pLat] = f.geometry.coordinates;
    const id = `${{ N: 'node', W: 'way', R: 'relation' }[p.osm_type] || 'node'}/${p.osm_id}`;
    return {
      provider: 'osm', providerId: id, name: p.name,
      address: [p.housenumber, p.street, p.locality || p.district, p.city].filter(Boolean).join(', ') || null,
      lat: pLat, lng: pLng,
      distanceKm: Math.round(distanceKm(origin, { lat: pLat, lng: pLng }) * 100) / 100,
      rating: null, ratingCount: null, priceLabel: null, imageUrl: null,
      categories: [pretty(p.osm_value)],
      matchedFoods: matchFoods(p.name, allFoods),
      sourceUrl: `https://www.openstreetmap.org/${id}`,
    };
  // Photon matches names fuzzily ("Sharma" ~ "shwarma"), so keep only real name matches.
  }).filter((r) => r.distanceKm <= RADIUS_M / 1000 && (!foods.length || r.matchedFoods.length));
}

async function overpassNearby({ lat, lng, foods }) {
  const around = `(around:${RADIUS_M},${lat},${lng})`;
  const amen = '["amenity"~"^(restaurant|fast_food|food_court)$"]["name"]';
  let body;
  if (foods.length) {
    const cuisine = [...new Set(foods.flatMap((id) => foodById(id).cuisine.split('|')))].join('|');
    const name = [...new Set(foods.flatMap((id) => foodById(id).name.split('|')))].join('|');
    body = `nwr${amen}["cuisine"~"${cuisine}",i]${around};nwr${amen}["name"~"${name}",i]${around};`;
  } else {
    body = `nwr${amen}${around};`;
  }
  const query = `[out:json][timeout:12];(${body});out center tags 400;`;

  let json, lastErr;
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      json = await res.json();
      break;
    } catch (e) { lastErr = e; }
  }
  if (!json) throw new Error(`Overpass unavailable (${lastErr?.message})`);

  const origin = { lat, lng };
  const seen = new Set();
  const out = [];
  for (const el of json.elements || []) {
    const pLat = el.lat ?? el.center?.lat;
    const pLng = el.lon ?? el.center?.lon;
    const t = el.tags || {};
    if (pLat == null || !t.name) continue;
    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const cuisines = (t.cuisine || '').split(';').map((c) => c.trim()).filter(Boolean);
    const address = [t['addr:housenumber'], t['addr:street'], t['addr:suburb'] || t['addr:city']].filter(Boolean).join(', ');
    out.push({
      provider: 'osm',
      providerId: id,
      name: t.name,
      address: address || null,
      lat: pLat,
      lng: pLng,
      distanceKm: Math.round(distanceKm(origin, { lat: pLat, lng: pLng }) * 100) / 100,
      rating: null,
      ratingCount: null,
      priceLabel: null,
      imageUrl: null,
      categories: cuisines.length ? cuisines.map(pretty) : [pretty(t.amenity)],
      matchedFoods: matchFoods(`${t.cuisine || ''} ${t.name}`, foods.length ? foods : FOODS.map((f) => f.id)),
      sourceUrl: `https://www.openstreetmap.org/${id}`,
    });
  }
  return out.filter((r) => r.distanceKm <= RADIUS_M / 1000);
}

// ---------- Google Places (New) ----------
const PRICE_LEVEL = {
  PRICE_LEVEL_FREE: 'Free',
  PRICE_LEVEL_INEXPENSIVE: '₹ · Inexpensive',
  PRICE_LEVEL_MODERATE: '₹₹ · Moderate',
  PRICE_LEVEL_EXPENSIVE: '₹₹₹ · Expensive',
  PRICE_LEVEL_VERY_EXPENSIVE: '₹₹₹₹ · Very expensive',
};
const FIELDS = 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.priceRange,places.primaryTypeDisplayName,places.photos,places.googleMapsUri';

async function googleCall(endpoint, body) {
  const res = await fetch(`https://places.googleapis.com/v1/places:${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_KEY, 'X-Goog-FieldMask': FIELDS },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Google Places error ${res.status}`);
  return (await res.json()).places || [];
}

async function googleNearby({ lat, lng, foods }) {
  const circle = { center: { latitude: lat, longitude: lng }, radius: RADIUS_M };
  const lists = foods.length
    ? await Promise.all(foods.map((id) => googleCall('searchText', { textQuery: `${foodById(id).label} restaurant`, includedType: 'restaurant', pageSize: 20, locationBias: { circle } })))
    : [await googleCall('searchNearby', { includedTypes: ['restaurant'], maxResultCount: 20, rankPreference: 'DISTANCE', locationRestriction: { circle } })];

  const origin = { lat, lng };
  const map = new Map();
  for (const p of lists.flat()) {
    if (map.has(p.id) || !p.location) continue;
    const d = distanceKm(origin, { lat: p.location.latitude, lng: p.location.longitude });
    if (d > RADIUS_M / 1000) continue;
    const pr = p.priceRange;
    const priceLabel = pr?.startPrice
      ? `${pr.startPrice.currencyCode === 'INR' ? '₹' : pr.startPrice.currencyCode + ' '}${pr.startPrice.units}${pr.endPrice ? '–' + pr.endPrice.units : '+'} per person`
      : PRICE_LEVEL[p.priceLevel] || null;
    map.set(p.id, {
      provider: 'google',
      providerId: p.id,
      name: p.displayName?.text || 'Restaurant',
      address: p.formattedAddress || null,
      lat: p.location.latitude,
      lng: p.location.longitude,
      distanceKm: Math.round(d * 100) / 100,
      rating: p.rating ?? null,
      ratingCount: p.userRatingCount ?? null,
      priceLabel,
      imageUrl: p.photos?.[0]?.name ? `/api/places/photo?name=${encodeURIComponent(p.photos[0].name)}` : null,
      categories: [p.primaryTypeDisplayName?.text || 'Restaurant'],
      matchedFoods: matchFoods(`${p.displayName?.text} ${p.primaryTypeDisplayName?.text}`, foods),
      sourceUrl: p.googleMapsUri || null,
    });
  }
  return [...map.values()].sort((a, b) => a.distanceKm - b.distanceKm);
}

export async function googlePhotoUrl(name) {
  if (!GOOGLE_KEY || !/^places\/[\w-]+\/photos\/[\w-]+$/.test(name)) return null;
  return cached(`photo:${name}`, async () => {
    const res = await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=640&skipHttpRedirect=true&key=${GOOGLE_KEY}`);
    if (!res.ok) return null;
    return (await res.json()).photoUri || null;
  });
}

export async function nearby({ lat, lng, foods }) {
  const provider = activeProvider();
  const key = `${provider}:${lat.toFixed(3)},${lng.toFixed(3)}:${[...foods].sort().join(',')}`;
  const restaurants = await cached(key, () => (provider === 'google' ? googleNearby({ lat, lng, foods }) : osmNearby({ lat, lng, foods })));
  return { provider, radiusKm: RADIUS_M / 1000, restaurants };
}

/** Which food categories are actually served within 12 km, based on real OSM restaurants
 *  (cuisine tags + names). Categories with no matching restaurant are left out. */
// The "foods near this area" result is also saved to data/places-cache.json, so it survives
// server restarts and is still shown (even if a bit old) when the map services are down.
const DISK_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'places-cache.json');
const DISK_TTL = 24 * 60 * 60 * 1000;
let disk = {};
try { disk = JSON.parse(readFileSync(DISK_FILE, 'utf8')); } catch { /* no cache yet */ }
function saveDisk() { try { mkdirSync(path.dirname(DISK_FILE), { recursive: true }); writeFileSync(DISK_FILE, JSON.stringify(disk)); } catch (e) { console.warn('[places] cache save failed', e.message); } }

export async function foodsNear({ lat, lng }) {
  const key = `foods:${lat.toFixed(3)},${lng.toFixed(3)}`;
  const saved = disk[key];
  if (saved && Date.now() - saved.at < DISK_TTL) return saved.value;
  try {
    const value = await scanFoods({ lat, lng, key });
    if (value.foods.length) { disk[key] = { at: Date.now(), value }; saveDisk(); } // never keep an empty result
    return value;
  } catch (e) {
    if (saved) return saved.value; // stale but real
    throw e;
  }
}

function scanFoods({ lat, lng, key }) {
  return cached(key, async () => {
    const all = await osmNearby({ lat, lng, foods: [] });
    const byFood = new Map(FOODS.map((f) => [f.id, new Map()]));
    const add = (foodId, r) => byFood.get(foodId)?.set(r.providerId, r);
    for (const r of all) for (const id of r.matchedFoods || []) add(id, r);

    // Foods with few matches in the general list get a targeted name search (e.g. "biryani").
    for (const f of FOODS) {
      if (byFood.get(f.id).size >= 5) continue;
      try {
        const found = await guarded('nominatim', () => nominatimNearby({ lat, lng, foods: [f.id] }));
        for (const r of found) if (r.matchedFoods.includes(f.id)) add(f.id, r);
      } catch { /* service down: leave the category out rather than guess */ }
    }
    const foods = FOODS.map((f) => {
      const places = [...byFood.get(f.id).values()].sort((a, b) => a.distanceKm - b.distanceKm);
      return { id: f.id, count: places.length, nearest: places.slice(0, 3).map((p) => ({ name: p.name, distanceKm: p.distanceKm })) };
    }).filter((f) => f.count > 0).sort((a, b) => b.count - a.count);
    return { radiusKm: RADIUS_M / 1000, restaurantCount: all.length, foods };
  }, 6 * 60 * 60 * 1000); // restaurants don't change often; avoids re-scanning for 6 hours
}

// ---------- Geocoding (manual location fallback) ----------
// Nominatim usage policy: max 1 request/second, no autocomplete — the client only searches on submit.
let lastGeocode = 0;
export async function geocode(q) {
  return cached(`geo:${q.toLowerCase()}`, async () => {
    const wait = 1100 - (Date.now() - lastGeocode);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastGeocode = Date.now();
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Location search failed (${res.status})`);
    const rows = await res.json();
    return rows.map((r) => ({ label: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }));
  });
}

export async function reverseGeocode(lat, lng) {
  return cached(`rev:${lat.toFixed(3)},${lng.toFixed(3)}`, async () => {
    const wait = 1100 - (Date.now() - lastGeocode);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastGeocode = Date.now();
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&lat=${lat}&lon=${lng}`, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(10_000) });
      const j = await res.json();
      const a = j.address || {};
      return [a.suburb || a.neighbourhood || a.village, a.city || a.town || a.county].filter(Boolean).join(', ') || null;
    } catch { return null; }
  });
}
