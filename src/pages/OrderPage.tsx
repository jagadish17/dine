import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Cloud, Info, Minus, PenLine, Plus, Share2, WifiOff, X } from 'lucide-react';
import { FOODS } from '../../shared/foods.js';
import { foodsNear, type FoodsNear } from '../lib/places';
import { CUSTOM_FOOD, displayCode, formatINR, metaFromQuery, shareUrl } from '../lib/dinner';
import { useDinner } from '../hooks/useDinner';
import { Logo, ToastProvider, useToast } from '../components/ui';
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
  const { dinner, meId, status, loaded, updateMe, setFoods } = useDinner(code, linkMeta);
  const me = dinner.people[meId];

  const [scanned, setScanned] = useState<FoodsNear | null>(null);
  const avail = dinner.foods ?? scanned;
  const haveShared = !!dinner.foods;
  const [availErr, setAvailErr] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [name, setName] = useState('');
  const [rows, setRows] = useState<Row[]>([{ key: 1, dish: '', qty: 1 }]);
  const [share, setShare] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  // "Can't find your food?" — something typed in, with an optional note and approximate price.
  const [custom, setCustom] = useState({ name: '', note: '', price: '', qty: 1 });

  const lat = dinner.meta?.lat, lng = dinner.meta?.lng;
  // Foods show instantly (all of them). In the background we check which are within 12 km:
  // first from the dinner's saved list (found by whoever opened it first), otherwise we look it up.
  useEffect(() => {
    if (lat == null || lng == null || haveShared || !loaded) return;
    let stop = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    foodsNear(lat, lng)
      .then((r) => { if (stop) return; setScanned(r); setAvailErr(null); if (r.foods.length) setFoods(r); })
      .catch((e) => {
        if (stop) return;
        setAvailErr(e.message);
        retryTimer = setTimeout(() => setRetry((n) => n + 1), 30000); // try again by itself
      })
    return () => { stop = true; clearTimeout(retryTimer); };
  }, [lat, lng, retry, haveShared, loaded, setFoods]);

  // Prefill my saved choice so I can change it.
  useEffect(() => {
    if (prefilled || !loaded && !me) return;
    if (me) {
      setName(me.name);
      const listed = me.items.filter((i) => i.foodId !== CUSTOM_FOOD);
      if (listed.length) setRows(listed.map((i, k) => ({ key: k + 1, dish: `${i.foodId}|${i.name}`, qty: i.qty })));
      const c = me.items.find((i) => i.foodId === CUSTOM_FOOD);
      if (c) setCustom({ name: c.name, note: c.note ?? '', price: c.price ? String(c.price) : '', qty: c.qty });
    }
    setPrefilled(true);
  }, [dinner, me, prefilled]);

  useEffect(() => { if (dinner.meta) document.title = `${meta.name} · DineTogether`; }, [dinner.meta]);

  // Until the 12 km check is done, every food is shown (count -1 = "not checked yet"), so nobody waits.
  const fallback = !avail;
  const groups = useMemo(() => (avail && avail.foods.length
    ? avail.foods.map((a) => ({ ...a, food: FOODS.find((f) => f.id === a.id)! })).filter((a) => a.food)
    : FOODS.map((food) => ({ id: food.id, count: -1, nearest: [] as { name: string; distanceKm: number }[], food }))), [avail]);
  const lines = rows.map((r) => ({ ...r, info: dishInfo(r.dish) }));
  const customName = custom.name.trim();
  const customPrice = Math.max(0, Math.min(100000, Number(custom.price) || 0));
  const total = lines.reduce((t, l) => t + (l.info ? l.info.dish.price * l.qty : 0), 0) + (customName ? customPrice * custom.qty : 0);
  const nameTaken = Object.values(dinner.people).some((p) => p.id !== meId && !p.left && p.name.trim().toLowerCase() === name.trim().toLowerCase());
  const hasFood = lines.some((l) => l.info) || !!customName;
  const ready = name.trim() && !nameTaken && hasFood;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    const merged = new Map<string, { foodId: string; name: string; price: number; qty: number; note?: string }>();
    for (const l of lines) if (l.info) {
      const k = `${l.info.food.id}|${l.info.dish.name}`;
      const prev = merged.get(k);
      merged.set(k, { foodId: l.info.food.id, name: l.info.dish.name, price: l.info.dish.price, qty: (prev?.qty ?? 0) + l.qty });
    }
    if (customName) merged.set(CUSTOM_FOOD, { foodId: CUSTOM_FOOD, name: customName.slice(0, 60), price: customPrice, qty: custom.qty, ...(custom.note.trim() ? { note: custom.note.trim().slice(0, 140) } : {}) });
    updateMe({ name: name.trim().slice(0, 40), items: [...merged.values()] });
    toast(me ? 'Your choice is updated' : 'Added! Now invite your friends');
  }

  if (!dinner.meta) {
    // Joined with just a code: the dinner's name/area come from the online copy.
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <Logo />
        {!loaded ? (
          <>
            <p className="mt-8 font-display text-2xl">Opening dinner {displayCode(code)}…</p>
            <span className="mt-6 inline-block h-5 w-5 animate-spin rounded-full border-2 border-ember border-t-transparent" />
          </>
        ) : (
          <>
            <p className="mt-8 font-display text-2xl">Dinner {displayCode(code)} not found</p>
            <p className="mt-2 max-w-sm text-sm text-ink-soft">Check the code with the friend who started it, or ask them to send the dinner link again.</p>
            <Link to="/" className="btn-primary mt-6">Enter a different code</Link>
          </>
        )}
      </div>
    );
  }

  const meta = dinner.meta;
  const link = shareUrl(dinner);
  const others = Object.values(dinner.people).filter((p) => p.id !== meId && p.items.length).length;

  return (
    <div className="min-h-screen pb-16">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-cream/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link to="/" aria-label="Start a new dinner"><Logo /></Link>
          <div className="flex-1" />
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${status === 'saved' ? 'bg-[#E6F0E9] text-leaf' : status === 'offline' ? 'bg-ember-tint text-ember-dark' : 'bg-cream-deep text-ink-soft'}`}
            title="Choices are saved online, so friends see them even when you're not on the page">
            {status === 'offline' ? <WifiOff className="h-3.5 w-3.5" /> : status === 'saved' ? <Cloud className="h-3.5 w-3.5" /> : <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            {status === 'saved' ? 'Saved online' : status === 'saving' ? 'Saving…' : status === 'offline' ? 'Offline · will retry' : 'Loading…'}
          </span>
          <button className="btn-dark px-3.5 py-2 text-sm" onClick={() => setShare(true)} aria-label="Invite friends"><Share2 className="h-4 w-4" /><span className="hidden sm:inline">Invite</span></button>
        </div>
      </header>
      {share && <ShareDialog link={link} name={meta.name} code={displayCode(code)} onClose={() => setShare(false)} />}

      <main className="mx-auto grid max-w-6xl gap-8 px-4 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0">
          <p className="eyebrow mb-2 text-ember">{meta.name}</p>
          <h1 className="text-4xl font-medium leading-tight sm:text-5xl">What are you <em className="font-normal text-ember">eating tonight?</em></h1>

          {/* Make it obvious what to send: this dinner's code/link — not the homepage. */}
          <div className={`mt-5 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 ${others ? 'border-line bg-white' : 'border-ember/40 bg-ember-tint'}`}>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-ink-soft">{others ? 'Invite more friends with this dinner’s code' : 'Friends join with this code or link'}</p>
              <p className="font-mono text-2xl font-semibold tracking-[.2em] text-ink">{displayCode(code)}</p>
            </div>
            <button type="button" className="btn-primary px-4 py-2.5 text-sm" onClick={() => setShare(true)}><Share2 className="h-4 w-4" />Share link</button>
          </div>

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
                  <span>
                    {availErr
                      ? <>Couldn’t check restaurants near <b>{meta.area.split(',')[0]}</b> yet (the free map service is busy), so <b>all foods</b> are shown. It keeps retrying by itself.</>
                      : <><span className="mr-1.5 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]" />Checking which foods are available <b>within 12 km</b> of <b>{meta.area.split(',')[0]}</b>… You can choose now; the list narrows when ready.</>}
                    {' '}Prices are approximate.
                  </span>
                ) : (
                  <span>Only foods available <b>within 12 km</b> of <b>{meta.area.split(',')[0]}</b> are listed{avail ? <> — from {avail.restaurantCount} nearby restaurants (OpenStreetMap).</> : '.'} Prices are approximate.</span>
                )}
              </div>


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

            {/* Custom food: for anything not in the list above. */}
            <div className="rounded-2xl border border-dashed border-ember/40 bg-ember-tint/40 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-medium"><PenLine className="h-4 w-4 text-ember" />Can’t find your food? Add a custom one</p>
                {(customName || custom.note) && <button type="button" className="text-xs text-ink-faint hover:text-[#A3341A]" onClick={() => setCustom({ name: '', note: '', price: '', qty: 1 })}>Clear</button>}
              </div>
              <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_120px_auto]">
                <input className="input col-span-2 sm:col-span-1" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="Custom food, e.g. Mutton Kola Urundai" maxLength={60} aria-label="Custom food" />
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint">₹</span>
                  <input className="input pl-7" type="number" inputMode="decimal" min={0} max={100000} value={custom.price} onChange={(e) => setCustom({ ...custom, price: e.target.value })} placeholder="Price" aria-label="Approximate price (optional)" />
                </div>
                <div className="inline-flex h-[50px] items-center justify-center rounded-2xl border border-line bg-white px-1" role="group" aria-label="Custom food quantity">
                  <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-cream" onClick={() => setCustom({ ...custom, qty: Math.max(1, custom.qty - 1) })} aria-label="Less custom food"><Minus className="h-4 w-4" /></button>
                  <span className="w-6 text-center font-semibold tabular-nums">{custom.qty}</span>
                  <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-cream" onClick={() => setCustom({ ...custom, qty: Math.min(50, custom.qty + 1) })} aria-label="More custom food"><Plus className="h-4 w-4" /></button>
                </div>
              </div>
              <textarea className="input mt-2 min-h-[72px] resize-y py-2.5" value={custom.note} onChange={(e) => setCustom({ ...custom, note: e.target.value.slice(0, 140) })}
                placeholder="Note (optional), e.g. less spicy, no onion, from Anjappar" maxLength={140} aria-label="Note for your custom food" />
              <p className="mt-1.5 flex justify-between gap-3 text-xs text-ink-faint">
                <span>{customName ? (customPrice ? <>{custom.qty} × ₹{customPrice} = <b className="text-ink-soft">{formatINR(customPrice * custom.qty)}</b></> : 'No price given: it won’t be counted in the total.') : 'Price is optional.'}</span>
                <span className="tabular-nums">{custom.note.length}/140</span>
              </p>
              {custom.note.trim() && !customName && <p className="mt-1 text-xs text-[#A3341A]">Type the custom food name too, so the note goes with it.</p>}
            </div>

            <button className="btn-primary w-full justify-between px-6 py-4 text-base" disabled={!ready}>
              <span>{!name.trim() ? 'Enter your name' : !hasFood ? 'Choose a food or add a custom one' : me ? 'Update my choice' : 'Submit'}</span>
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
