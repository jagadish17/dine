import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Info, LocateFixed, MapPin, Minus, Plus, Share2, X } from 'lucide-react';
import { FOODS } from '../../shared/foods.js';
import { api, type FoodsNear } from '../lib/api';
import { getSession, saveSession } from '../lib/session';
import { formatINR } from '../lib/costs';
import { useGroup } from '../hooks/useGroup';
import { ErrorNote, Logo, ToastProvider, useToast } from '../components/ui';
import { LiveIndicator, ShareDialog } from '../components/GroupHeader';
import Preferences from '../components/Preferences';
import FoodSelect from '../components/FoodSelect';

type Loc = { lat: number; lng: number; label: string };
type Row = { key: number; dish: string; qty: number }; // dish = "foodId|Dish name"

const LOC_KEY = 'dinetogether:lastLocation';
const readLoc = (): Loc | null => { try { return JSON.parse(localStorage.getItem(LOC_KEY) || 'null'); } catch { return null; } };
const writeLoc = (l: Loc) => { try { localStorage.setItem(LOC_KEY, JSON.stringify(l)); } catch { /* ignore */ } };

const dishInfo = (key: string) => {
  const [foodId, name] = key.split('|');
  const food = FOODS.find((f) => f.id === foodId);
  const dish = food?.dishes.find((d) => d.name === name);
  return food && dish ? { food, dish } : null;
};

export default function OrderPage() {
  return <ToastProvider><Order /></ToastProvider>;
}

function Order() {
  const nav = useNavigate();
  const toast = useToast();
  const code = useParams().code?.toLowerCase() ?? null;
  const session = code ? getSession(code) : null;
  const { snap, status, error, refresh } = useGroup(code, session?.participantId ?? null);
  const me = snap?.participants.find((p) => p.id === session?.participantId) ?? null;

  const [localLoc, setLocalLoc] = useState<Loc | null>(readLoc);
  const loc: Loc | null = snap?.group.location ?? localLoc;
  const [avail, setAvail] = useState<FoodsNear | null>(null);
  const [availErr, setAvailErr] = useState<string | null>(null);
  const [loadingFoods, setLoadingFoods] = useState(false);

  const [name, setName] = useState('');
  const [rows, setRows] = useState<Row[]>([{ key: 1, dish: '', qty: 1 }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [share, setShare] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  // Load which foods are available within 12 km of the dinner area.
  useEffect(() => {
    if (!loc) return;
    let stop = false;
    setLoadingFoods(true); setAvailErr(null);
    api.foodsNear(loc.lat, loc.lng)
      .then((r) => !stop && setAvail(r))
      .catch((e) => !stop && setAvailErr(e.message))
      .finally(() => !stop && setLoadingFoods(false));
    return () => { stop = true; };
  }, [loc?.lat, loc?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // If I already chose, prefill my name and items so I can change them.
  useEffect(() => {
    if (prefilled || !snap || !me) return;
    setName(me.name);
    const mine = snap.selections.filter((s) => s.participantId === me.id).map((s, i) => {
      const item = snap.foodItems.find((f) => f.id === s.foodItemId);
      return item?.foodId ? { key: i + 1, dish: `${item.foodId}|${item.name}`, qty: s.quantity } : null;
    }).filter(Boolean) as Row[];
    if (mine.length) setRows(mine);
    setPrefilled(true);
  }, [snap, me, prefilled]);

  const availableFoods = useMemo(() => (avail?.foods ?? []).map((a) => ({ ...a, food: FOODS.find((f) => f.id === a.id)! })).filter((a) => a.food), [avail]);
  const lines = rows.map((r) => ({ ...r, info: dishInfo(r.dish) }));
  const total = lines.reduce((t, l) => t + (l.info ? l.info.dish.price * l.qty : 0), 0);
  const ready = name.trim() && lines.some((l) => l.info);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const items = lines.filter((l) => l.info).map((l) => ({ name: l.info!.dish.name, price: l.info!.dish.price, qty: l.qty, foodId: l.info!.food.id }));
      const r = await api.submit({ code: code ?? undefined, name, items, location: snap?.group.location ? null : loc });
      if (r.token) saveSession(r.code, { participantId: r.participantId, token: r.token, groupName: r.groupName });
      toast(me ? 'Your choice is updated' : 'Added! Now invite your friends');
      if (r.code !== code) nav(`/g/${r.code}`); else refresh();
    } catch (x) { setErr((x as Error).message); }
    finally { setBusy(false); }
  }

  if (error) return <div className="mx-auto max-w-md px-5 py-20"><ErrorNote>{error}</ErrorNote><button className="btn-ghost mt-4" onClick={() => nav('/')}>Start a new dinner</button></div>;

  return (
    <div className="min-h-screen pb-16">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-cream/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Logo />
          <div className="flex-1" />
          {snap && <LiveIndicator status={status} />}
          {snap && <button className="btn-dark px-3.5 py-2 text-sm" onClick={() => setShare(true)} aria-label="Invite friends"><Share2 className="h-4 w-4" /><span className="hidden sm:inline">Invite</span></button>}
        </div>
        {snap && share && <ShareDialog code={snap.group.inviteCode} name={snap.group.name} onClose={() => setShare(false)} />}
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-4 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0">
          {snap && <p className="eyebrow mb-2 text-ember">{snap.group.name}</p>}
          <h1 className="text-4xl font-medium leading-tight sm:text-5xl">What are you <em className="font-normal text-ember">eating tonight?</em></h1>

          {!loc ? (
            <LocationPicker onSet={(l) => { writeLoc(l); setLocalLoc(l); }} />
          ) : (
            <form onSubmit={submit} className="card mt-6 space-y-5 p-5 sm:p-6">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Your name</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jagadish" maxLength={40} autoComplete="given-name" />
              </label>

              <div>
                <span className="mb-1.5 block text-sm font-medium">Food</span>
                {/* Note above the dropdown: where the list comes from */}
                <div className="mb-3 flex items-start gap-2.5 rounded-xl bg-ember-tint px-3.5 py-2.5 text-[13px] leading-snug text-[#7A3410]">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Only foods available <b>within {avail?.radiusKm ?? 12} km</b> of <b>{loc.label.split(',')[0]}</b> are listed
                    {avail ? <> — from {avail.restaurantCount} nearby restaurants (OpenStreetMap).</> : '.'} Prices are approximate.
                    {!snap?.group.location && <button type="button" className="ml-1 font-medium underline" onClick={() => { setLocalLoc(null); setAvail(null); }}>Change area</button>}
                  </span>
                </div>

                {loadingFoods && <div className="rounded-xl border border-dashed border-line bg-cream/60 px-4 py-4 text-sm text-ink-soft"><span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-ember border-t-transparent align-middle" />Checking restaurants within 12 km… (the first time can take up to 30 seconds)</div>}
                {availErr && <ErrorNote onRetry={() => setLocalLoc(loc && { ...loc })}>{availErr}</ErrorNote>}
                {avail && availableFoods.length === 0 && <ErrorNote>No restaurants with these foods were found within 12 km.</ErrorNote>}

                {avail && availableFoods.length > 0 && (
                  <div className="space-y-3">
                    {lines.map((row, i) => (
                      <div key={row.key}>
                        <div className="flex items-center gap-2">
                          <FoodSelect groups={availableFoods} value={row.dish} radiusKm={avail.radiusKm}
                            onChange={(v) => setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, dish: v } : r)))} />
                          <div className="inline-flex h-[52px] shrink-0 items-center rounded-2xl border border-line bg-white px-1" role="group" aria-label="Quantity">
                            <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-cream" onClick={() => setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, qty: Math.max(1, r.qty - 1) } : r)))} aria-label="Less"><Minus className="h-4 w-4" /></button>
                            <span className="w-6 text-center font-semibold tabular-nums">{row.qty}</span>
                            <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-cream" onClick={() => setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, qty: Math.min(50, r.qty + 1) } : r)))} aria-label="More"><Plus className="h-4 w-4" /></button>
                          </div>
                          {rows.length > 1 && <button type="button" className="rounded-full p-2 text-ink-faint hover:bg-cream hover:text-[#A3341A]" onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))} aria-label="Remove"><X className="h-4 w-4" /></button>}
                        </div>
                        {row.info && (
                          <p className="mt-1.5 pl-1 text-xs text-ink-faint">
                            {row.qty} × ~{formatINR(row.info.dish.price)} = <b className="text-ink-soft">{formatINR(row.info.dish.price * row.qty)}</b>
                            {(() => { const a = availableFoods.find((x) => x.id === row.info!.food.id); return a?.nearest.length ? ` · nearby: ${a.nearest.map((n) => `${n.name} (${n.distanceKm.toFixed(1)} km)`).join(', ')}` : ''; })()}
                          </p>
                        )}
                        {i === lines.length - 1 && rows.length < 10 && (
                          <button type="button" className="btn-text mt-2 text-sm" onClick={() => setRows((rs) => [...rs, { key: Math.max(...rs.map((r) => r.key)) + 1, dish: '', qty: 1 }])}><Plus className="h-4 w-4" />Add another food</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {err && <ErrorNote>{err}</ErrorNote>}
              <button className="btn-primary w-full justify-between px-6 py-4 text-base" disabled={busy || !ready}>
                <span>{busy ? 'Submitting…' : me ? 'Update my choice' : 'Submit'}</span>
                <span className="tabular-nums">{total > 0 && `~${formatINR(total)}`}</span>
              </button>
            </form>
          )}
        </section>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Preferences snap={snap} meId={me?.id ?? null} onInvite={() => setShare(true)} />
        </aside>
      </main>
    </div>
  );
}

function LocationPicker({ onSet }: { onSet: (l: Loc) => void }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Loc[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function useMine() {
    setErr(null);
    if (!window.isSecureContext || !navigator.geolocation) { setErr('Location only works on secure pages here. Type your area instead.'); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setBusy(false); onSet({ lat: p.coords.latitude, lng: p.coords.longitude, label: 'My location' }); },
      () => { setBusy(false); setErr('Location permission denied. Type your area instead.'); },
      { timeout: 12000, maximumAge: 300000 },
    );
  }
  async function search(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const r = await api.geocode(q); setFound(r.results); if (!r.results.length) setErr(`Couldn’t find “${q}”.`); }
    catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="card mt-6 p-5">
      <p className="font-medium">First, where’s dinner?</p>
      <p className="mt-0.5 text-sm text-ink-soft">We’ll list the foods available within 12 km.</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button className="btn-dark shrink-0" onClick={useMine} disabled={busy}><LocateFixed className="h-4 w-4" />Use my location</button>
        <form onSubmit={search} className="flex flex-1 gap-2">
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="or type area, e.g. T Nagar, Chennai" aria-label="Area" />
          <button className="btn-ghost shrink-0" disabled={busy || q.trim().length < 2}>Search</button>
        </form>
      </div>
      {err && <div className="mt-3"><ErrorNote>{err}</ErrorNote></div>}
      {found && found.length > 0 && (
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {found.map((f) => (
            <li key={`${f.lat},${f.lng}`}><button className="flex w-full items-start gap-3 bg-white px-4 py-3 text-left text-sm hover:bg-cream" onClick={() => onSet({ ...f, label: f.label.split(',').slice(0, 3).join(',') })}><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ember" /><span className="line-clamp-2">{f.label}</span></button></li>
          ))}
        </ul>
      )}
    </div>
  );
}
