// DineTogether API: plain Node http, JSON-file storage, Server-Sent Events for live sync.
import http from 'node:http';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.mjs';
import { nearby, foodsNear, geocode, reverseGeocode, googlePhotoUrl, activeProvider } from './places.mjs';
import { FOOD_IDS } from '../shared/foods.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argPort = process.argv.indexOf('--port');
const PORT = Number(argPort > -1 ? process.argv[argPort + 1] : process.env.PORT || 8791);
const store = createStore(process.env.DB_FILE || path.join(ROOT, 'data', 'db.json'));
await store.load();

// ---------- helpers ----------
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, msg) => { throw new HttpError(status, msg); };
const now = () => new Date().toISOString();
const sha = (s) => createHash('sha256').update(s).digest('hex');
const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const newCode = () => Array.from(randomBytes(8), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');

function cleanText(v, field, { min = 1, max = 60, optional = false } = {}) {
  if (v == null || v === '') { if (optional) return null; fail(400, `${field} is required`); }
  if (typeof v !== 'string') fail(400, `${field} must be text`);
  const s = v.replace(/\s+/g, ' ').trim();
  if (s.length < min) { if (optional && !s) return null; fail(400, `${field} is required`); }
  if (s.length > max) fail(400, `${field} must be ${max} characters or fewer`);
  return s;
}
function cleanNum(v, field, { min, max, int = false }) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max || (int && !Number.isInteger(n))) fail(400, `${field} must be between ${min} and ${max}`);
  return int ? n : Math.round(n * 100) / 100;
}
function cleanLocation(loc) {
  if (!loc || typeof loc !== 'object') fail(400, 'location is required');
  return {
    lat: cleanNum(loc.lat, 'latitude', { min: -90, max: 90 }),
    lng: cleanNum(loc.lng, 'longitude', { min: -180, max: 180 }),
    label: cleanText(loc.label, 'location name', { max: 160, optional: true }) || 'Pinned location',
  };
}
function cleanImageUrl(v) {
  const s = cleanText(v, 'image URL', { max: 500, optional: true });
  if (!s) return null;
  try { const u = new URL(s); if (u.protocol !== 'https:') throw 0; return u.toString(); }
  catch { fail(400, 'Image URL must be a valid https:// link'); }
}

async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > 32_000) fail(413, 'Request too large'); chunks.push(c); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, 'Invalid JSON'); }
}

const findGroup = (code) => store.data.groups.find((g) => g.inviteCode === code) || fail(404, 'This dinner group does not exist. Check the invite link.');

function auth(req, group) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) fail(401, 'Join the group first');
  const hash = sha(token);
  const p = store.data.participants.find((x) => x.groupId === group.id && x.tokenHash === hash);
  return p || fail(401, 'Your session for this group was not recognised. Rejoin from the invite link.');
}

function snapshot(group) {
  const d = store.data;
  const by = (arr) => arr.filter((x) => x.groupId === group.id);
  return {
    group: { id: group.id, name: group.name, inviteCode: group.inviteCode, location: group.location, createdAt: group.createdAt, hostParticipantId: group.hostParticipantId },
    participants: by(d.participants).map(({ tokenHash, ...p }) => p),
    restaurants: by(d.restaurants),
    foodItems: by(d.foodItems),
    selections: by(d.selections),
    online: [...(online.get(group.id)?.keys() || [])],
    provider: activeProvider(),
    serverTime: now(),
  };
}

// ---------- live sync (SSE) ----------
const streams = new Map(); // groupId -> Set<res>
const online = new Map();  // groupId -> Map<participantId, connectionCount>

function broadcast(group) {
  const payload = `event: snapshot\ndata: ${JSON.stringify(snapshot(group))}\n\n`;
  for (const res of streams.get(group.id) || []) res.write(payload);
}

function openStream(req, res, group, participantId) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  // A 2 KB comment first: tunnels/proxies (e.g. Cloudflare) can hold back small streams; this pushes data through.
  res.write(`:${' '.repeat(2048)}\nretry: 2000\n\n`);
  if (!streams.has(group.id)) streams.set(group.id, new Set());
  streams.get(group.id).add(res);
  if (participantId) {
    if (!online.has(group.id)) online.set(group.id, new Map());
    const m = online.get(group.id);
    m.set(participantId, (m.get(participantId) || 0) + 1);
  }
  broadcast(group); // sends the fresh snapshot to this client too, and updates presence for others
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(ping);
    streams.get(group.id)?.delete(res);
    if (participantId) {
      const m = online.get(group.id);
      const n = (m?.get(participantId) || 1) - 1;
      if (n <= 0) m?.delete(participantId); else m.set(participantId, n);
    }
    broadcast(group);
  });
}

// ---------- routes ----------
const routes = [];
const route = (method, pattern, handler) => routes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), handler });

// LAN addresses let the host share a link that works on phones when they opened the app on localhost.
// Real Wi-Fi/Ethernet addresses first; skip link-local (169.254.x) and virtual adapters (WSL, Docker, VMs).
const lanHosts = () => Object.entries(os.networkInterfaces())
  .flatMap(([name, list]) => (list || []).map((i) => ({ name, ...i })))
  .filter((i) => i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.'))
  .map((i) => ({ address: i.address, score: (/vethernet|virtual|vmware|vbox|docker|wsl|hyper-v|loopback/i.test(i.name) ? 10 : 0) + (/wi-?fi|wlan|wireless/i.test(i.name) ? 0 : 1) + (i.address.startsWith('192.168.') ? 0 : i.address.startsWith('10.') ? 1 : 2) }))
  .sort((a, b) => a.score - b.score)
  .map((i) => i.address);
// publicUrl is set by `npm run share:online` once the Cloudflare tunnel is up.
route('GET', '/api/config', () => ({ provider: activeProvider(), lanHosts: lanHosts(), publicUrl: process.env.DT_PUBLIC_URL || null }));

route('POST', '/api/groups', async ({ body }) => {
  const name = cleanText(body.groupName, 'Group name', { max: 60 });
  const hostName = cleanText(body.hostName, 'Your name', { max: 40 });
  const token = randomBytes(24).toString('base64url');
  return store.mutate((d) => {
    let inviteCode;
    do inviteCode = newCode(); while (d.groups.some((g) => g.inviteCode === inviteCode));
    const group = { id: randomUUID(), name, inviteCode, location: null, createdAt: now(), hostParticipantId: null };
    const p = { id: randomUUID(), groupId: group.id, name: hostName, preferredFoods: [], restaurantId: null, tokenHash: sha(token), createdAt: now(), updatedAt: now() };
    group.hostParticipantId = p.id;
    d.groups.push(group); d.participants.push(p);
    return { inviteCode, participantId: p.id, token };
  });
});

route('GET', '/api/groups/:code', ({ params }) => snapshot(findGroup(params.code)));

route('GET', '/api/groups/:code/preview', ({ params }) => {
  const g = findGroup(params.code);
  const people = store.data.participants.filter((p) => p.groupId === g.id);
  return { name: g.name, participantCount: people.length, participantNames: people.map((p) => p.name) };
});

route('POST', '/api/groups/:code/join', async ({ params, body }) => {
  const group = findGroup(params.code);
  const name = cleanText(body.name, 'Your name', { max: 40 });
  const token = randomBytes(24).toString('base64url');
  const result = await store.mutate((d) => {
    const members = d.participants.filter((p) => p.groupId === group.id);
    if (members.some((p) => p.name.toLowerCase() === name.toLowerCase())) fail(409, `“${name}” has already joined this group. Use a different name (e.g. add an initial), or open the link on the device you joined from.`);
    if (members.length >= 50) fail(400, 'This group is full (50 people)');
    const p = { id: randomUUID(), groupId: group.id, name, preferredFoods: [], restaurantId: null, tokenHash: sha(token), createdAt: now(), updatedAt: now() };
    d.participants.push(p);
    return { participantId: p.id, token };
  });
  broadcast(group);
  return result;
});

route('PATCH', '/api/groups/:code/me', async ({ req, params, body }) => {
  const group = findGroup(params.code);
  const me = auth(req, group);
  const patch = {};
  if ('name' in body) {
    patch.name = cleanText(body.name, 'Your name', { max: 40 });
    if (store.data.participants.some((p) => p.groupId === group.id && p.id !== me.id && p.name.toLowerCase() === patch.name.toLowerCase())) fail(409, 'Someone in this group already uses that name');
  }
  if ('preferredFoods' in body) {
    if (!Array.isArray(body.preferredFoods) || body.preferredFoods.length > 13 || !body.preferredFoods.every((f) => FOOD_IDS.has(f))) fail(400, 'Unknown food preference');
    patch.preferredFoods = [...new Set(body.preferredFoods)];
  }
  if ('restaurantId' in body) {
    if (body.restaurantId !== null && !store.data.restaurants.some((r) => r.id === body.restaurantId && r.groupId === group.id)) fail(400, 'Unknown restaurant');
    patch.restaurantId = body.restaurantId;
  }
  await store.mutate(() => Object.assign(me, patch, { updatedAt: now() }));
  broadcast(group);
  return { ok: true };
});

route('PUT', '/api/groups/:code/location', async ({ req, params, body }) => {
  const group = findGroup(params.code);
  const me = auth(req, group);
  const loc = cleanLocation(body);
  if (loc.label === 'Pinned location') loc.label = (await reverseGeocode(loc.lat, loc.lng)) || 'Current location';
  await store.mutate(() => { group.location = { ...loc, setBy: me.id, setAt: now() }; });
  broadcast(group);
  return { ok: true };
});

// Saves a restaurant chosen from discovery results into the group (upsert by provider id).
function cleanPlace(body) {
  if (!body || typeof body !== 'object') fail(400, 'Pick a restaurant');
  if (!['osm', 'google'].includes(body.provider)) fail(400, 'Unknown provider');
  return {
    provider: body.provider,
    providerId: cleanText(body.providerId, 'providerId', { max: 200 }),
    name: cleanText(body.name, 'Restaurant name', { max: 120 }),
    address: cleanText(body.address, 'address', { max: 250, optional: true }),
    lat: cleanNum(body.lat, 'latitude', { min: -90, max: 90 }),
    lng: cleanNum(body.lng, 'longitude', { min: -180, max: 180 }),
    distanceKm: body.distanceKm == null ? null : cleanNum(body.distanceKm, 'distance', { min: 0, max: 50 }),
    rating: body.rating == null ? null : cleanNum(body.rating, 'rating', { min: 0, max: 5 }),
    ratingCount: body.ratingCount == null ? null : cleanNum(body.ratingCount, 'ratingCount', { min: 0, max: 1e8, int: true }),
    priceLabel: cleanText(body.priceLabel, 'price', { max: 60, optional: true }),
    imageUrl: typeof body.imageUrl === 'string' && body.imageUrl.startsWith('/api/places/photo?') ? body.imageUrl.slice(0, 600) : null,
    categories: Array.isArray(body.categories) ? body.categories.slice(0, 6).map((c) => cleanText(String(c), 'category', { max: 40 })) : [],
    sourceUrl: typeof body.sourceUrl === 'string' && /^https:\/\//.test(body.sourceUrl) ? body.sourceUrl.slice(0, 500) : null,
  };
}

function upsertRestaurant(d, group, r, byId) {
  const existing = d.restaurants.find((x) => x.groupId === group.id && x.provider === r.provider && x.providerId === r.providerId);
  if (existing) { Object.assign(existing, r, { fetchedAt: now() }); return existing; }
  const row = { id: randomUUID(), groupId: group.id, ...r, addedBy: byId, createdAt: now(), fetchedAt: now() };
  d.restaurants.push(row);
  return row;
}

// The simple flow: one call submits "my name + restaurant + dishes". It creates the group
// (when there's no invite code yet) and the participant (when this device hasn't joined),
// and replaces only this participant's order. Ownership comes from the device token.
route('POST', '/api/submit', async ({ req, body }) => {
  const name = cleanText(body.name, 'Your name', { max: 40 });
  const place = body.place ? cleanPlace(body.place) : null; // restaurant is optional
  if (!Array.isArray(body.items) || !body.items.length) fail(400, 'Choose at least one dish');
  if (body.items.length > 20) fail(400, 'Too many dishes');
  const items = body.items.map((it) => ({
    name: cleanText(it?.name, 'Dish name', { max: 60 }),
    price: cleanNum(it?.price, 'Price', { min: 1, max: 100000 }),
    qty: cleanNum(it?.qty, 'Quantity', { min: 1, max: 50, int: true }),
    foodId: FOOD_IDS.has(it?.foodId) ? it.foodId : (FOOD_IDS.has(body.foodId) ? body.foodId : fail(400, 'Pick a food from the list')),
  }));
  const location = body.location ? cleanLocation(body.location) : null;
  const groupName = cleanText(body.groupName, 'Dinner name', { max: 60, optional: true });

  let group = body.code ? findGroup(String(body.code)) : null;
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const existingMe = group && token ? store.data.participants.find((p) => p.groupId === group.id && p.tokenHash === sha(token)) : null;
  const newToken = existingMe ? null : randomBytes(24).toString('base64url');

  const result = await store.mutate((d) => {
    if (group && d.participants.some((p) => p.groupId === group.id && p.id !== existingMe?.id && p.name.toLowerCase() === name.toLowerCase()))
      fail(409, `“${name}” is already in this dinner. Add an initial, e.g. “${name} K”.`);
    if (!group) {
      let inviteCode;
      do inviteCode = newCode(); while (d.groups.some((g) => g.inviteCode === inviteCode));
      group = { id: randomUUID(), name: groupName || 'Dinner Tonight', inviteCode, location: null, createdAt: now(), hostParticipantId: null };
      d.groups.push(group);
    }
    if (location && !group.location) group.location = { ...location, setAt: now() };
    let me = existingMe;
    if (!me) {
      me = { id: randomUUID(), groupId: group.id, name, preferredFoods: [], restaurantId: null, tokenHash: sha(newToken), createdAt: now(), updatedAt: now() };
      d.participants.push(me);
      if (!group.hostParticipantId) group.hostParticipantId = me.id;
    }
    const restaurant = place ? upsertRestaurant(d, group, place, me.id) : null;
    const restaurantId = restaurant?.id ?? null;
    Object.assign(me, { name, preferredFoods: [...new Set(items.map((i) => i.foodId))], restaurantId, updatedAt: now() });

    d.selections = d.selections.filter((s) => s.participantId !== me.id);
    for (const it of items) {
      // Same name + same price = same dish. A different price makes a separate entry,
      // so my price never changes anyone else's total.
      let food = d.foodItems.find((f) => f.groupId === group.id && f.restaurantId === restaurantId && f.name.toLowerCase() === it.name.toLowerCase() && f.price === it.price);
      if (!food) {
        food = { id: randomUUID(), groupId: group.id, restaurantId, foodId: it.foodId, name: it.name, description: null, price: it.price, imageUrl: null, priceSource: 'participant_estimate', createdBy: me.id, createdAt: now(), updatedAt: now() };
        d.foodItems.push(food);
      }
      const prev = d.selections.find((s) => s.participantId === me.id && s.foodItemId === food.id);
      if (prev) prev.quantity += it.qty;
      else d.selections.push({ id: randomUUID(), groupId: group.id, participantId: me.id, restaurantId, foodItemId: food.id, quantity: it.qty, updatedAt: now() });
    }
    // Drop dishes nobody orders any more, so menus stay tidy.
    const used = new Set(d.selections.map((s) => s.foodItemId));
    d.foodItems = d.foodItems.filter((f) => f.groupId !== group.id || used.has(f.id));
    return { code: group.inviteCode, participantId: me.id, token: newToken, groupName: group.name };
  });
  broadcast(group);
  return result;
});

route('POST', '/api/groups/:code/restaurants', async ({ req, params, body }) => {
  const group = findGroup(params.code);
  const me = auth(req, group);
  const r = cleanPlace(body);
  const providerId = r.providerId;
  const saved = await store.mutate((d) => {
    const existing = d.restaurants.find((x) => x.groupId === group.id && x.provider === r.provider && x.providerId === providerId);
    if (existing) { Object.assign(existing, r, { fetchedAt: now() }); return existing; }
    const row = { id: randomUUID(), groupId: group.id, ...r, addedBy: me.id, createdAt: now(), fetchedAt: now() };
    d.restaurants.push(row);
    return row;
  });
  broadcast(group);
  return saved;
});

// Menu items are added by participants: there is no licensed menu API, so every price is an estimate.
route('POST', '/api/groups/:code/food-items', async ({ req, params, body }) => {
  const group = findGroup(params.code);
  const me = auth(req, group);
  const restaurant = store.data.restaurants.find((r) => r.id === body.restaurantId && r.groupId === group.id) || fail(400, 'Pick a restaurant first');
  const item = {
    id: randomUUID(), groupId: group.id, restaurantId: restaurant.id,
    name: cleanText(body.name, 'Dish name', { max: 60 }),
    description: cleanText(body.description, 'Description', { max: 140, optional: true }),
    price: cleanNum(body.price, 'Price', { min: 1, max: 100000 }),
    imageUrl: cleanImageUrl(body.imageUrl),
    priceSource: 'participant_estimate',
    createdBy: me.id, createdAt: now(), updatedAt: now(),
  };
  if (store.data.foodItems.some((f) => f.restaurantId === restaurant.id && f.name.toLowerCase() === item.name.toLowerCase())) fail(409, `“${item.name}” is already on this menu`);
  await store.mutate((d) => {
    d.foodItems.push(item);
    if (body.addToMyOrder) d.selections.push({ id: randomUUID(), groupId: group.id, participantId: me.id, restaurantId: restaurant.id, foodItemId: item.id, quantity: 1, updatedAt: now() });
  });
  broadcast(group);
  return item;
});

route('PATCH', '/api/groups/:code/food-items/:id', async ({ req, params, body }) => {
  const group = findGroup(params.code);
  const me = auth(req, group);
  const item = store.data.foodItems.find((f) => f.id === params.id && f.groupId === group.id) || fail(404, 'Dish not found');
  if (item.createdBy !== me.id) fail(403, 'Only the person who added this dish can edit it');
  const patch = {};
  if ('name' in body) patch.name = cleanText(body.name, 'Dish name', { max: 60 });
  if ('description' in body) patch.description = cleanText(body.description, 'Description', { max: 140, optional: true });
  if ('price' in body) patch.price = cleanNum(body.price, 'Price', { min: 1, max: 100000 });
  if ('imageUrl' in body) patch.imageUrl = cleanImageUrl(body.imageUrl);
  await store.mutate(() => Object.assign(item, patch, { updatedAt: now() }));
  broadcast(group);
  return item;
});

route('DELETE', '/api/groups/:code/food-items/:id', async ({ req, params }) => {
  const group = findGroup(params.code);
  const me = auth(req, group);
  const item = store.data.foodItems.find((f) => f.id === params.id && f.groupId === group.id) || fail(404, 'Dish not found');
  if (item.createdBy !== me.id) fail(403, 'Only the person who added this dish can remove it');
  if (store.data.selections.some((s) => s.foodItemId === item.id && s.participantId !== me.id)) fail(409, 'Someone else has ordered this dish, so it can’t be removed');
  await store.mutate((d) => {
    d.selections = d.selections.filter((s) => s.foodItemId !== item.id);
    d.foodItems = d.foodItems.filter((f) => f.id !== item.id);
  });
  broadcast(group);
  return { ok: true };
});

// Set my quantity for a dish. Ownership comes from the token, never from the request body,
// so nobody can change another participant's order.
route('PUT', '/api/groups/:code/selections', async ({ req, params, body }) => {
  const group = findGroup(params.code);
  const me = auth(req, group);
  const item = store.data.foodItems.find((f) => f.id === body.foodItemId && f.groupId === group.id) || fail(400, 'Dish not found');
  const quantity = cleanNum(body.quantity, 'Quantity', { min: 0, max: 50, int: true });
  await store.mutate((d) => {
    const existing = d.selections.find((s) => s.participantId === me.id && s.foodItemId === item.id);
    if (quantity === 0) d.selections = d.selections.filter((s) => s !== existing);
    else if (existing) Object.assign(existing, { quantity, updatedAt: now() });
    else d.selections.push({ id: randomUUID(), groupId: group.id, participantId: me.id, restaurantId: item.restaurantId, foodItemId: item.id, quantity, updatedAt: now() });
  });
  broadcast(group);
  return { ok: true };
});

route('DELETE', '/api/groups/:code/me', async ({ req, params }) => {
  const group = findGroup(params.code);
  const me = auth(req, group);
  await store.mutate((d) => {
    d.selections = d.selections.filter((s) => s.participantId !== me.id);
    d.participants = d.participants.filter((p) => p.id !== me.id);
  });
  broadcast(group);
  return { ok: true };
});

route('GET', '/api/places/nearby', async ({ url }) => {
  const lat = cleanNum(url.searchParams.get('lat'), 'lat', { min: -90, max: 90 });
  const lng = cleanNum(url.searchParams.get('lng'), 'lng', { min: -180, max: 180 });
  const foods = (url.searchParams.get('foods') || '').split(',').filter((f) => FOOD_IDS.has(f));
  return nearby({ lat, lng, foods });
});

route('GET', '/api/places/foods', async ({ url }) => {
  const lat = cleanNum(url.searchParams.get('lat'), 'lat', { min: -90, max: 90 });
  const lng = cleanNum(url.searchParams.get('lng'), 'lng', { min: -180, max: 180 });
  return foodsNear({ lat, lng });
});

route('GET', '/api/geocode', async ({ url }) => {
  const q = cleanText(url.searchParams.get('q'), 'Search text', { min: 2, max: 120 });
  return { results: await geocode(q) };
});

// ---------- server ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2' };
async function serveStatic(req, res, url) {
  const dist = path.join(ROOT, 'dist');
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (!file.startsWith(dist)) file = dist;
  try { if (!(await fs.stat(file)).isFile()) throw 0; }
  catch { file = path.join(dist, 'index.html'); }
  try { await fs.access(file); } catch { res.writeHead(404).end('Run `npm run build` first, or use `npm run dev`.'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache' });
  createReadStream(file).pipe(res);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  try {
    if (url.pathname === '/api/places/photo') {
      const uri = await googlePhotoUrl(url.searchParams.get('name') || '');
      if (!uri) { res.writeHead(404).end(); return; }
      res.writeHead(302, { Location: uri, 'Cache-Control': 'public, max-age=3600' }).end();
      return;
    }
    const sse = url.pathname.match(/^\/api\/groups\/([^/]+)\/events$/);
    if (sse && req.method === 'GET') {
      const group = findGroup(sse[1]);
      const pid = url.searchParams.get('pid');
      openStream(req, res, group, store.data.participants.some((p) => p.id === pid && p.groupId === group.id) ? pid : null);
      return;
    }
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url);
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = url.pathname.match(r.re);
      if (!m) continue;
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
      const out = await r.handler({ req, url, params: m.groups || {}, body: body && typeof body === 'object' ? body : {} });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(out));
      return;
    }
    fail(404, 'Not found');
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 502;
    if (!(err instanceof HttpError)) console.error(err);
    if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message || 'Something went wrong' }));
  }
})
  .on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\nPort ${PORT} is already in use: DineTogether is probably already running in another terminal.\nClose that one (Ctrl+C) and run "npm run dev" again.\n`);
      process.exit(1);
    }
    throw err;
  })
  .listen(PORT, '0.0.0.0', () => {
    console.log(`DineTogether API on http://localhost:${PORT} (restaurants: ${activeProvider()})`);
    if (process.env.DT_SHARE) {
      const ips = lanHosts();
      console.log(`\n  Open on this computer:  http://localhost:${PORT}`);
      if (ips.length) console.log(`  Share on your Wi-Fi:    ${ips.map((ip) => `http://${ip}:${PORT}`).join('  or  ')}`);
      else console.log('  No Wi-Fi/LAN address found. Connect to a network to share.');
      console.log('  (Others must be on the same Wi-Fi, and Windows Firewall must allow Node.js. See README.)\n');
    }
  });
