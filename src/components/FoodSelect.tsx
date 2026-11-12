import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, MapPin, Search } from 'lucide-react';
import type { Food } from '../../shared/foods.js';

export interface FoodGroup { food: Food; count: number }

/** Premium searchable dropdown: food types as headings (with "N places nearby"),
 *  dishes as rows with right-aligned prices. Keyboard: ↑ ↓ Enter Esc. */
export default function FoodSelect({ groups, value, onChange, radiusKm }: { groups: FoodGroup[]; value: string; onChange: (v: string) => void; radiusKm: number }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const id = useId();

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return groups
      .map((g) => ({ ...g, dishes: g.food.dishes.filter((d) => !t || d.name.toLowerCase().includes(t) || g.food.label.toLowerCase().includes(t)) }))
      .filter((g) => g.dishes.length);
  }, [groups, q]);
  const flat = useMemo(() => filtered.flatMap((g) => g.dishes.map((d) => ({ key: `${g.food.id}|${d.name}`, food: g.food, dish: d }))), [filtered]);
  const selected = useMemo(() => {
    const [fid, name] = value.split('|');
    const g = groups.find((x) => x.food.id === fid);
    const d = g?.food.dishes.find((x) => x.name === name);
    return g && d ? { food: g.food, dish: d } : null;
  }, [groups, value]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    setTimeout(() => search.current?.focus(), 0);
    const i = flat.findIndex((f) => f.key === value);
    setActive(i >= 0 ? i : 0);
    return () => document.removeEventListener('mousedown', close);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setActive(0), [q]);
  useEffect(() => { list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const pick = (key: string) => { onChange(key); setOpen(false); setQ(''); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (flat[active]) pick(flat[active].key); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  let i = -1;
  return (
    <div ref={box} className="relative min-w-0 flex-1">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-controls={id}
        className={`flex h-[52px] w-full items-center gap-3 rounded-2xl border bg-white pl-3 pr-3.5 text-left transition ${open ? 'border-ember/60 ring-4 ring-ember/10' : 'border-line hover:border-ink/25'}`}>
        {selected ? (
          <>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ember-tint text-xl" aria-hidden>{selected.food.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold leading-tight">{selected.dish.name}</span>
              <span className="block truncate text-xs text-ink-faint">{selected.food.label}</span>
            </span>
            <span className="shrink-0 text-[15px] font-semibold tabular-nums text-ink-soft">~₹{selected.dish.price}</span>
          </>
        ) : (
          <span className="flex-1 pl-1 text-[15px] text-ink-faint">Choose a food…</span>
        )}
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-faint transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="fade-in absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-line bg-white shadow-lift sm:min-w-[380px]">
          <div className="border-b border-line p-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search biryani, dosa, parotta…"
                className="w-full rounded-xl bg-cream py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-ink-faint focus:bg-cream-deep" aria-label="Search foods" />
            </div>
            <p className="mt-2 flex items-center gap-1.5 px-1 text-[11px] text-ink-faint"><MapPin className="h-3 w-3 text-ember" />Foods served by restaurants within {radiusKm} km · prices approx.</p>
          </div>
          <div ref={list} id={id} role="listbox" className="max-h-[min(60vh,380px)] overflow-y-auto overscroll-contain py-1.5">
            {filtered.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-faint">No food matches “{q}”</p>}
            {filtered.map((g) => (
              <div key={g.food.id} role="group" aria-label={g.food.label}>
                <div className="sticky top-0 z-10 flex items-center gap-2 bg-white/95 px-4 pb-1.5 pt-3 backdrop-blur">
                  <span className="text-base" aria-hidden>{g.food.emoji}</span>
                  <span className="font-display text-[15px] font-medium">{g.food.label}</span>
                  <span className="ml-auto rounded-full bg-cream px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-soft">{g.count} {g.count === 1 ? 'place' : 'places'} nearby</span>
                </div>
                {g.dishes.map((d) => {
                  i += 1;
                  const key = `${g.food.id}|${d.name}`;
                  const on = key === value;
                  const idx = i;
                  return (
                    <button type="button" key={key} data-i={idx} role="option" aria-selected={on}
                      onMouseEnter={() => setActive(idx)} onClick={() => pick(key)}
                      className={`mx-1.5 flex w-[calc(100%-12px)] items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14.5px] transition ${idx === active ? 'bg-ember-tint' : ''} ${on ? 'font-semibold text-ember-dark' : 'text-ink'}`}>
                      <span className="w-4 shrink-0">{on && <Check className="h-4 w-4" />}</span>
                      <span className="min-w-0 flex-1 truncate">{d.name}</span>
                      <span className="shrink-0 tabular-nums text-ink-soft">~₹{d.price}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
