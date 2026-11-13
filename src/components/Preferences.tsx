import { useMemo } from 'react';
import { Share2, Users } from 'lucide-react';
import { formatINR, summarize, type Dinner } from '../lib/dinner';
import { Avatar } from './ui';

/** Right-side panel: who chose what, live, with totals and counts. */
export default function Preferences({ dinner, meId, onInvite }: { dinner: Dinner; meId: string; onInvite: () => void }) {
  const s = useMemo(() => summarize(dinner), [dinner]);
  const people = [...s.people].sort((a, b) => (a.person.id === meId ? -1 : b.person.id === meId ? 1 : a.person.updatedAt - b.person.updatedAt));

  return (
    <div className="card overflow-hidden">
      <div className="bg-ink px-5 pb-5 pt-4 text-cream">
        <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-cream/60">Current preferences</p>
        <p key={s.total} className="fade-in mt-3 font-display text-4xl font-medium tabular-nums">{formatINR(s.total)}</p>
        <p className="text-xs text-cream/60">Total (approx.)</p>
        <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-cream/10 pt-3 text-sm">
          <div><dt className="text-cream/50">People</dt><dd className="font-semibold">{s.people.length}</dd></div>
          <div><dt className="text-cream/50">Items</dt><dd className="font-semibold">{s.itemCount}</dd></div>
          <div><dt className="text-cream/50">Avg / person</dt><dd className="font-semibold tabular-nums">{formatINR(s.average)}</dd></div>
        </dl>
      </div>

      {people.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-ink-soft">
          <Users className="mx-auto mb-2 h-6 w-6 text-ink-faint" />
          No one has chosen yet.<br />Submit your choice, then invite your friends.
        </div>
      ) : (
        <ul className="divide-y divide-line px-5">
          {people.map(({ person: p, total }) => (
            <li key={p.id} className="flex items-start gap-3 py-3.5">
              <Avatar id={p.id} name={p.name} size={32} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{p.name}{p.id === meId && <span className="ml-1 text-xs font-normal text-ink-faint">(you)</span>}</p>
                {p.items.map((i) => <p key={i.name} className="text-sm text-ink-soft">{i.qty}× {i.name}</p>)}
              </div>
              <span key={total} className="flash rounded-md px-1 font-semibold tabular-nums">{formatINR(total)}</span>
            </li>
          ))}
        </ul>
      )}

      {s.counts.length > 0 && (
        <div className="border-t border-line bg-cream/50 px-5 py-4">
          <p className="eyebrow mb-2">Food counts</p>
          <ul className="space-y-1.5 text-sm">
            {s.counts.map((c) => (
              <li key={c.name}><b className="font-semibold">{c.qty}×</b> {c.name} <span className="text-ink-faint">· {c.people.join(', ')}</span></li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-line p-4">
        <button className="btn-ghost w-full" onClick={onInvite}><Share2 className="h-4 w-4" />Invite friends</button>
      </div>
    </div>
  );
}
