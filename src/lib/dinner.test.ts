import { describe, expect, it } from 'vitest';
import { CUSTOM_FOOD, merge, parseJoin, summarize, type Dinner } from './dinner';

const meta = { name: 'Friday', area: 'T Nagar', lat: 13, lng: 80, createdAt: 1 };
const base: Dinner = { code: 'abc', meta, people: {} };
const id = (c: string) => c.repeat(64); // device ids are 64-hex public keys
const person = (pid: string, name: string, items: [string, number, number][], updatedAt = 1) =>
  ({ id: pid, name, updatedAt, items: items.map(([n, price, qty]) => ({ foodId: 'x', name: n, price, qty })) });
const J = id('a'), A = id('b'), X = id('c');

describe('summarize', () => {
  it('computes individual, total, average and counts', () => {
    const d = { ...base, people: { [J]: person(J, 'Jagadish', [['Chicken Biryani', 250, 1]]), [A]: person(A, 'Arun', [['Masala Dosa', 100, 2], ['Chicken Biryani', 250, 1]]) } };
    const s = summarize(d);
    expect(s.total).toBe(700);
    expect(s.people.map((p) => p.total)).toEqual([250, 450]);
    expect(s.average).toBe(350);
    expect(s.itemCount).toBe(4);
    expect(s.counts[0]).toEqual({ name: 'Chicken Biryani', qty: 2, people: ['Jagadish', 'Arun'] });
  });
  it('avoids floating point drift and ignores people who left', () => {
    const d = { ...base, people: { [J]: person(J, 'J', [['A', 0.1, 1], ['B', 0.2, 1]]), [X]: { ...person(X, 'X', [['C', 99, 1]]), left: true } } };
    expect(summarize(d).total).toBe(0.3);
  });
});

describe('merge', () => {
  it('keeps the newest version of each person', () => {
    const mine = { ...base, people: { [A]: person(A, 'Arun', [['Dosa', 100, 1]], 5) } };
    const older = { ...base, people: { [A]: person(A, 'Arun', [['Dosa', 100, 9]], 3) } };
    const newer = { ...base, people: { [A]: person(A, 'Arun', [['Dosa', 100, 2]], 8), [J]: person(J, 'Jagadish', [['Biryani', 250, 1]], 2) } };
    expect(merge(mine, older)).toBe(mine);
    const m = merge(mine, newer);
    expect(m.people[A].items[0].qty).toBe(2);
    expect(Object.keys(m.people)).toEqual([A, J]);
  });
  it('ignores other dinners, malformed entries and old-version ids', () => {
    expect(merge(base, { ...base, code: 'zzz', people: { [A]: person(A, 'A', []) } })).toBe(base);
    expect(merge(base, { ...base, people: { [A]: { id: J } as any } })).toBe(base);
    expect(merge(base, { ...base, people: { u1: person('u1', 'Old', [['Dosa', 100, 1]]) } })).toBe(base);
  });
  it('fills in the dinner name/area when joining by code, but never replaces it', () => {
    const joined: Dinner = { code: 'abc', meta: null, people: {} };
    expect(merge(joined, { code: 'abc', meta }).meta).toEqual(meta);
    expect(merge(base, { code: 'abc', meta: { ...meta, name: 'Other' } }).meta?.name).toBe('Friday');
    expect(merge(joined, { code: 'abc', meta: { name: 'x' } as any }).meta).toBeNull();
  });
});

describe('custom food with note', () => {
  const custom = (name: string, price: number, qty: number, note?: string) => ({ foodId: CUSTOM_FOOD, name, price, qty, ...(note !== undefined ? { note } : {}) });
  it('keeps the note, counts its price, and treats a missing price as ₹0', () => {
    const p = { id: J, name: 'Jagadish', updatedAt: 2, items: [custom('Kola Urundai', 120, 2, '  less spicy  '), custom('Paya', 0, 1)] };
    const d = merge(base, { code: 'abc', people: { [J]: p } });
    expect(d.people[J].items[0]).toEqual({ foodId: CUSTOM_FOOD, name: 'Kola Urundai', price: 120, qty: 2, note: 'less spicy' });
    expect(d.people[J].items[1].note).toBeUndefined();
    expect(summarize(d).total).toBe(240);
  });
  it('limits note length and drops custom foods without a name', () => {
    const p = { id: J, name: 'J', updatedAt: 2, items: [custom('X', 10, 1, 'n'.repeat(500)), custom('   ', 10, 1, 'orphan note')] };
    const items = merge(base, { code: 'abc', people: { [J]: p } }).people[J].items;
    expect(items).toHaveLength(1);
    expect(items[0].note).toHaveLength(140);
  });
});

describe('parseJoin', () => {
  it('accepts codes in any case and full links', () => {
    expect(parseJoin(' K7M2QX ')).toEqual({ code: 'k7m2qx', query: '' });
    expect(parseJoin('https://jagadish17.github.io/dine/#/g/k7m2qx?n=Fri&a=T&lat=1&lng=2')).toEqual({ code: 'k7m2qx', query: '?n=Fri&a=T&lat=1&lng=2' });
    expect(parseJoin('https://jagadish17.github.io/dine/')).toBeNull();
    expect(parseJoin('ab')).toBeNull();
  });
});
