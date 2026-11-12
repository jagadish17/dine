import { useMemo } from 'react';
import { Share2, Users } from 'lucide-react';
import type { Snapshot } from '../lib/types';
import { formatINR, summarize } from '../lib/costs';
import { Avatar } from './ui';

/** Right-side panel: who chose what, live, with totals and counts. */
export default function Preferences({ snap, meId, onInvite }: { snap: Snapshot | null; meId: string | null; onInvite: () => void }) {
  const s = useMemo(() => (snap ? summarize(snap) : null), [snap]);
  const online = new Set(snap?.online ?? []);

  // How many of each dish the whole group chose, and by whom.
  const counts = useMemo(() => {
    const m = new Map<string, { qty: number; people: string[] }>();
    for (const p of s?.people ?? []) for (const l of p.lines) {
      const c = m.get(l.item.name) ?? { qty: 0, people: [] };
      c.qty += l.selection.quantity;
      if (!c.people.includes(p.participant.name)) c.people.push(p.participant.name);
      m.set(l.item.name, c);
    }
    return [...m.entries()].sort((a, b) => b[1].qty - a[1].qty);
  }, [s]);

  const people = (s?.people ?? []).filter((p) => p.itemCount > 0)
    .sort((a, b) => (a.participant.id === meId ? -1 : b.participant.id === meId ? 1 : a.participant.createdAt.localeCompare(b.participant.createdAt)));
  const itemCount = people.reduce((t, p) => t + p.itemCount, 0);

  return (
    <div className="card overflow-hidden">
      <div className="bg-ink px-5 pb-5 pt-4 text-cream">
        <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-cream/60">Current preferences</p>
        <p key={s?.groupTotal} className="fade-in mt-3 font-display text-4xl font-medium tabular-nums">{formatINR(s?.groupTotal ?? 0)}</p>
        <p className="text-xs text-cream/60">Total (approx.)</p>
        <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-cream/10 pt-3 text-sm">
          <div><dt className="text-cream/50">People</dt><dd className="font-semibold">{people.length}</dd></div>
          <div><dt className="text-cream/50">Items</dt><dd className="font-semibold">{itemCount}</dd></div>
          <div><dt className="text-cream/50">Avg / person</dt><dd className="font-semibold tabular-nums">{formatINR(people.length ? Math.round(((s?.groupTotal ?? 0) / people.length) * 100) / 100 : 0)}</dd></div>
        </dl>
      </div>

      {people.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-ink-soft">
          <Users className="mx-auto mb-2 h-6 w-6 text-ink-faint" />
          No one has chosen yet.<br />Submit your choice, then invite your friends.
        </div>
      ) : (
        <ul className="divide-y divide-line px-5">
          {people.map(({ participant: p, lines, total }) => (
            <li key={p.id} className="flex items-start gap-3 py-3.5">
              <Avatar id={p.id} name={p.name} online={online.has(p.id)} size={32} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{p.name}{p.id === meId && <span className="ml-1 text-xs font-normal text-ink-faint">(you)</span>}</p>
                {lines.map((l) => (
                  <p key={l.item.id} className="text-sm text-ink-soft">{l.selection.quantity}× {l.item.name}</p>
                ))}
              </div>
              <span key={total} className="flash rounded-md px-1 font-semibold tabular-nums">{formatINR(total)}</span>
            </li>
          ))}
        </ul>
      )}

      {counts.length > 0 && (
        <div className="border-t border-line bg-cream/50 px-5 py-4">
          <p className="eyebrow mb-2">Food counts</p>
          <ul className="space-y-1.5 text-sm">
            {counts.map(([dish, c]) => (
              <li key={dish} className="flex justify-between gap-3">
                <span className="min-w-0"><b className="font-semibold">{c.qty}×</b> {dish} <span className="text-ink-faint">· {c.people.join(', ')}</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {snap && (
        <div className="border-t border-line p-4">
          <button className="btn-ghost w-full" onClick={onInvite}><Share2 className="h-4 w-4" />Invite friends</button>
        </div>
      )}
    </div>
  );
}
