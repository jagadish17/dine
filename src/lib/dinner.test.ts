import { describe, expect, it } from 'vitest';
import { merge, summarize, type Dinner } from './dinner';

const meta = { name: 'Friday', area: 'T Nagar', lat: 13, lng: 80, createdAt: 1 };
const base: Dinner = { code: 'abc', meta, people: {} };
const person = (id: string, name: string, items: [string, number, number][], updatedAt = 1) =>
  ({ id, name, updatedAt, items: items.map(([n, price, qty]) => ({ foodId: 'x', name: n, price, qty })) });

describe('summarize', () => {
  it('computes individual, total, average and counts', () => {
    const d = { ...base, people: { j: person('j', 'Jagadish', [['Chicken Biryani', 250, 1]]), a: person('a', 'Arun', [['Masala Dosa', 100, 2], ['Chicken Biryani', 250, 1]]) } };
    const s = summarize(d);
    expect(s.total).toBe(700);
    expect(s.people.map((p) => p.total)).toEqual([250, 450]);
    expect(s.average).toBe(350);
    expect(s.itemCount).toBe(4);
    expect(s.counts[0]).toEqual({ name: 'Chicken Biryani', qty: 2, people: ['Jagadish', 'Arun'] });
  });
  it('avoids floating point drift and ignores people who left', () => {
    const d = { ...base, people: { j: person('j', 'J', [['A', 0.1, 1], ['B', 0.2, 1]]), x: { ...person('x', 'X', [['C', 99, 1]]), left: true } } };
    expect(summarize(d).total).toBe(0.3);
  });
});

describe('merge', () => {
  it('keeps the newest version of each person', () => {
    const mine = { ...base, people: { a: person('a', 'Arun', [['Dosa', 100, 1]], 5) } };
    const older = { ...base, people: { a: person('a', 'Arun', [['Dosa', 100, 9]], 3) } };
    const newer = { ...base, people: { a: person('a', 'Arun', [['Dosa', 100, 2]], 8), j: person('j', 'Jagadish', [['Biryani', 250, 1]], 2) } };
    expect(merge(mine, older)).toBe(mine);
    const m = merge(mine, newer);
    expect(m.people.a.items[0].qty).toBe(2);
    expect(Object.keys(m.people)).toEqual(['a', 'j']);
  });
  it('ignores data for another dinner or malformed entries', () => {
    expect(merge(base, { ...base, code: 'zzz', people: { a: person('a', 'A', []) } })).toBe(base);
    expect(merge(base, { ...base, people: { a: { id: 'b' } as any } })).toBe(base);
  });
});
