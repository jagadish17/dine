import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, LocateFixed, MapPin } from 'lucide-react';
import { geocode, reverseGeocode } from '../lib/places';
import { newCode, shareUrl, type Meta } from '../lib/dinner';
import { ErrorNote, Logo } from '../components/ui';

type Loc = { lat: number; lng: number; label: string };

/** Start a new dinner: name it and set the area (used for "foods within 12 km"). */
export default function StartPage() {
  const nav = useNavigate();
  const [name, setName] = useState('Dinner Tonight');
  const [loc, setLoc] = useState<Loc | null>(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Loc[] | null>(null);
  const [busy, setBusy] = useState<'geo' | 'search' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function useMine() {
    setErr(null);
    if (!navigator.geolocation) { setErr('Your browser can’t share location. Type your area instead.'); return; }
    setBusy('geo');
    navigator.geolocation.getCurrentPosition(
      async (p) => { const label = await reverseGeocode(p.coords.latitude, p.coords.longitude); setLoc({ lat: p.coords.latitude, lng: p.coords.longitude, label }); setBusy(null); },
      () => { setBusy(null); setErr('Location permission was denied. Type your area instead.'); },
      { timeout: 12000, maximumAge: 300000 },
    );
  }
  async function search(e: FormEvent) {
    e.preventDefault(); setBusy('search'); setErr(null);
    try { const r = await geocode(q); setFound(r); if (!r.length) setErr(`Couldn’t find “${q}”.`); }
    catch (x) { setErr((x as Error).message); } finally { setBusy(null); }
  }
  function start() {
    if (!loc) return;
    const code = newCode();
    const meta: Meta = { name: name.trim() || 'Dinner Tonight', area: loc.label, lat: loc.lat, lng: loc.lng, createdAt: Date.now() };
    const url = new URL(shareUrl({ code, meta, people: {} }));
    nav(url.hash.slice(1));
  }

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-3xl items-center px-5 py-5"><Logo /></header>
      <main className="mx-auto max-w-xl px-5 pb-20 pt-6">
        <p className="eyebrow mb-3 text-ember">Group dinner, sorted</p>
        <h1 className="text-[42px] font-medium leading-[1.05] sm:text-5xl">Tonight, let’s eat <em className="font-normal text-ember">something great.</em></h1>
        <p className="mt-3 text-[17px] text-ink-soft">Start a dinner, share the link, and see what everyone wants — live.</p>

        <div className="card mt-8 space-y-5 p-6">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Dinner name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </label>

          <div>
            <span className="mb-1.5 block text-sm font-medium">Where’s dinner?</span>
            {loc ? (
              <div className="flex items-center gap-3 rounded-2xl border border-line bg-cream/60 px-4 py-3">
                <MapPin className="h-4 w-4 shrink-0 text-ember" />
                <span className="min-w-0 flex-1 truncate">{loc.label}</span>
                <button className="btn-text text-sm" onClick={() => { setLoc(null); setFound(null); }}>Change</button>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button className="btn-dark shrink-0" onClick={useMine} disabled={busy !== null}><LocateFixed className="h-4 w-4" />{busy === 'geo' ? 'Locating…' : 'Use my location'}</button>
                  <form onSubmit={search} className="flex flex-1 gap-2">
                    <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="or type area, e.g. T Nagar, Chennai" aria-label="Area" />
                    <button className="btn-ghost shrink-0" disabled={busy !== null || q.trim().length < 2}>{busy === 'search' ? '…' : 'Search'}</button>
                  </form>
                </div>
                {found && found.length > 0 && (
                  <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line">
                    {found.map((f) => (
                      <li key={`${f.lat},${f.lng}`}><button className="flex w-full items-start gap-3 bg-white px-4 py-3 text-left text-sm hover:bg-cream" onClick={() => setLoc({ ...f, label: f.label.split(',').slice(0, 3).join(',') })}><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ember" /><span className="line-clamp-2">{f.label}</span></button></li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {err && <div className="mt-3"><ErrorNote>{err}</ErrorNote></div>}
          </div>

          <button className="btn-primary w-full py-3.5" onClick={start} disabled={!loc}>Start dinner <ArrowRight className="h-4 w-4" /></button>
          <p className="text-center text-xs text-ink-faint">You’ll get a link to share. Foods are listed from restaurants within 12 km of this area.</p>
        </div>
      </main>
    </div>
  );
}
