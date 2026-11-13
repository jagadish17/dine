import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Info, Minus, Plus, Share2, Wifi, X } from 'lucide-react';
import { FOODS } from '../../shared/foods.js';
import { foodsNear, type FoodsNear } from '../lib/places';
import { formatINR, metaFromQuery, shareUrl } from '../lib/dinner';
import { useDinner } from '../hooks/useDinner';
import { ErrorNote, Logo, ToastProvider, useToast } from '../components/ui';
import ShareDialog from '../components/ShareDialog';
import Preferences from '../components/Preferences';
import FoodSelect from '../components/FoodSelect';

type Row = { key: number; dish: string; qty: number }; // dish = "foodId|Dish name"

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
  const toast = useToast();
  const code = (useParams().code || '').toLowerCase();
  const query = new URLSearchParams(useLocation().search);
  const linkMeta = useMemo(() => metaFromQuery(query), [query.toString()]); // eslint-disable-line react-hooks/exhaustive-deps
  const { dinner, peers, meId, updateMe, setFoods } = useDinner(code, linkMeta);
  const me = dinner?.people[meId];

  const [scanned, setScanned] = useState<FoodsNear | null>(null);
  const avail = dinner?.foods ?? scanned;
  const haveShared = !!dinner?.foods;
  const [availErr, setAvailErr] = useState<string | null>(null);
  const [loadingFoods, setLoadingFoods] = useState(false);
  const [retry, setRetry] = useState(0);
  const [name, setName] = useState('');
  const [rows, setRows] = useState<Row[]>([{ key: 1, dish: '', qty: 1 }]);
  const [share, setShare] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  const lat = dinner?.meta.lat, lng = dinner?.meta.lng;
  useEffect(() => {
    if (lat == null || lng == null || haveShared) { setLoadingFoods(false); return; }
    let stop = false;
    setLoadingFoods(true);
    // Give friends' phones a few seconds to send their list first (saves searching twice).
    const wait = setTimeout(() => {
      foodsNear(lat, lng)
        .then((r) => { if (stop) return; setScanned(r); setAvailErr(null); if (r.foods.length) setFoods(r); })
        .catch((e) => {
          if (stop) return;
          setAvailErr(e.message);
          retryTimer = setTimeout(() => setRetry((n) => n + 1), 30000); // try again by itself
        })
        .finally(() => !stop && setLoadingFoods(false));
    }, retry === 0 ? 4000 : 0);
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    return () => { stop = true; clearTimeout(wait); clearTimeout(retryTimer); };
  }, [lat, lng, retry, haveShared, setFoods]);

  // Prefill my saved choice so I can change it.
  useEffect(() => {
    if (prefilled || !dinner) return;
    if (me) {
      setName(me.name);
      if (me.items.length) setRows(me.items.map((i, k) => ({ key: k + 1, dish: `${i.foodId}|${i.name}`, qty: i.qty })));
    }
    setPrefilled(true);
  }, [dinner, me, prefilled]);

  useEffect(() => { if (dinner) document.title = `${dinner.meta.name} · DineTogether`; }, [dinner]);

  // If the map services can't be reached, still let people choose: show every food (count -1 =
  // "not checked") and say so clearly, while retrying in the background.
  const fallback = !avail && !!availErr;
  const groups = useMemo(() => (avail
    ? avail.foods.map((a) => ({ ...a, food: FOODS.find((f) => f.id === a.id)! })).filter((a) => a.food)
    : fallback ? FOODS.map((food) => ({ id: food.id, count: -1, nearest: [] as { name: string; distanceKm: number }[], food })) : []), [avail, fallback]);
  const lines = rows.map((r) => ({ ...r, info: dishInfo(r.dish) }));
  const total = lines.reduce((t, l) => t + (l.info ? l.info.dish.price * l.qty : 0), 0);
  const nameTaken = !!dinner && Object.values(dinner.people).some((p) => p.id !== meId && !p.left && p.name.trim().toLowerCase() === name.trim().toLowerCase());
  const ready = name.trim() && !nameTaken && lines.some((l) => l.info);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    const merged = new Map<string, { foodId: string; name: string; price: number; qty: number }>();
    for (const l of lines) if (l.info) {
      const k = `${l.info.food.id}|${l.info.dish.name}`;
      const prev = merged.get(k);
      merged.set(k, { foodId: l.info.food.id, name: l.info.dish.name, price: l.info.dish.price, qty: (prev?.qty ?? 0) + l.qty });
    }
    updateMe({ name: name.trim().slice(0, 40), items: [...merged.values()] });
    toast(me ? 'Your choice is updated' : 'Added! Now invite your friends');
  }

  if (!dinner) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <Logo />
        <p className="mt-8 font-display text-2xl">Connecting to your dinner…</p>
        <p className="mt-2 max-w-sm text-sm text-ink-soft">Waiting for someone in the group to be online. If this takes long, ask for the full invite link (it includes the dinner name and area).</p>
        <span className="mt-6 inline-block h-5 w-5 animate-spin rounded-full border-2 border-ember border-t-transparent" />
        <Link to="/" className="btn-ghost mt-8">Start a new dinner instead</Link>
      </div>
    );
  }

  const link = shareUrl(dinner);

  return (
    <div className="min-h-screen pb-16">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-cream/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link to="/" aria-label="Start a new dinner"><Logo /></Link>
          <div className="flex-1" />
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${peers ? 'bg-[#E6F0E9] text-leaf' : 'bg-cream-deep text-ink-soft'}`} title="People with this dinner open right now">
            <Wifi className="h-3.5 w-3.5" />{peers ? `${peers + 1} online` : 'Only you online'}
          </span>
          <button className="btn-dark px-3.5 py-2 text-sm" onClick={() => setShare(true)} aria-label="Invite friends"><Share2 className="h-4 w-4" /><span className="hidden sm:inline">Invite</span></button>
        </div>
      </header>
      {share && <ShareDialog link={link} name={dinner.meta.name} onClose={() => setShare(false)} />}

      <main className="mx-auto grid max-w-6xl gap-8 px-4 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0">
          <p className="eyebrow mb-2 text-ember">{dinner.meta.name}</p>
          <h1 className="text-4xl font-medium leading-tight sm:text-5xl">What are you <em className="font-normal text-ember">eating tonight?</em></h1>

          <form onSubmit={submit} className="card mt-6 space-y-5 p-5 sm:p-6">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Your name</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jagadish" maxLength={40} autoComplete="given-name" />
              {nameTaken && <span className="mt-1.5 block text-xs text-[#A3341A]">Someone in this dinner already uses that name. Add an initial, e.g. “{name.trim()} K”.</span>}
            </label>

            <div>
              <span className="mb-1.5 block text-sm font-medium">Food</span>
              <div className="mb-3 flex items-start gap-2.5 rounded-xl bg-ember-tint px-3.5 py-2.5 text-[13px] leading-snug text-[#7A3410]">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                {fallback ? (
                  <span>Couldn’t check restaurants near <b>{dinner.meta.area.split(',')[0]}</b> right now (the free map service is busy), so <b>all foods</b> are shown. It retries by itself, and the list narrows to foods <b>within 12 km</b> once it gets through. Prices are approximate.</span>
                ) : (
                  <span>Only foods available <b>within 12 km</b> of <b>{dinner.meta.area.split(',')[0]}</b> are listed{avail ? <> — from {avail.restaurantCount} nearby restaurants (OpenStreetMap).</> : '.'} Prices are approximate.</span>
                )}
              </div>

              {loadingFoods && groups.length === 0 && <div className="rounded-xl border border-dashed border-line bg-cream/60 px-4 py-4 text-sm text-ink-soft"><span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-ember border-t-transparent align-middle" />Checking restaurants within 12 km… (the first time can take up to a minute)</div>}
              {availErr && !fallback && <ErrorNote onRetry={() => setRetry((n) => n + 1)}>{availErr}</ErrorNote>}
              {avail && !fallback && groups.length === 0 && <ErrorNote>No restaurants with these foods were found within 12 km.</ErrorNote>}

              {groups.length > 0 && (
                <div className="space-y-3">
                  {lines.map((row, i) => (
                    <div key={row.key}>
                      <div className="flex items-center gap-2">
                        <FoodSelect groups={groups} value={row.dish} radiusKm={avail?.radiusKm ?? 12} onChange={(v) => setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, dish: v } : r)))} />
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
                          {(() => { const a = groups.find((x) => x.id === row.info!.food.id); return a?.nearest.length ? ` · nearby: ${a.nearest.map((n) => `${n.name} (${n.distanceKm} km)`).join(', ')}` : ''; })()}
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

            <button className="btn-primary w-full justify-between px-6 py-4 text-base" disabled={!ready}>
              <span>{me ? 'Update my choice' : 'Submit'}</span>
              <span className="tabular-nums">{total > 0 && `~${formatINR(total)}`}</span>
            </button>
          </form>
        </section>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Preferences dinner={dinner} meId={meId} onInvite={() => setShare(true)} />
        </aside>
      </main>
    </div>
  );
}
