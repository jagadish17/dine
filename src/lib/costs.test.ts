import { describe, expect, it } from 'vitest';
import { summarize } from './costs';
import type { FoodItem, Participant, Restaurant, Selection } from './types';

const P = (id: string, name: string): Participant => ({ id, groupId: 'g', name, preferredFoods: [], restaurantId: null, createdAt: '', updatedAt: '' });
const R = (id: string, name: string): Restaurant => ({ id, groupId: 'g', name, provider: 'osm', providerId: id, address: null, lat: 0, lng: 0, distanceKm: 1, rating: null, ratingCount: null, priceLabel: null, imageUrl: null, categories: [], sourceUrl: null, addedBy: 'x', fetchedAt: '' });
const F = (id: string, restaurantId: string, price: number): FoodItem => ({ id, groupId: 'g', restaurantId, name: id, description: null, price, imageUrl: null, priceSource: 'participant_estimate', createdBy: 'x', createdAt: '', updatedAt: '' });
const S = (participantId: string, foodItemId: string, restaurantId: string, quantity: number): Selection => ({ id: `${participantId}-${foodItemId}`, groupId: 'g', participantId, foodItemId, restaurantId, quantity, updatedAt: '' });

const base = {
  participants: [P('j', 'Jagadish'), P('a', 'Arun'), P('v', 'Vijay')],
  restaurants: [R('ra', 'Restaurant A'), R('rb', 'Restaurant B')],
  foodItems: [F('biryani', 'ra', 250), F('shawarma', 'rb', 180), F('grill', 'ra', 320)],
};

describe('summarize', () => {
  it('computes individual, group, average and restaurant-wise totals', () => {
    const s = summarize({ ...base, selections: [S('j', 'biryani', 'ra', 1), S('a', 'shawarma', 'rb', 2), S('j', 'grill', 'ra', 1)] });
    const by = Object.fromEntries(s.people.map((p) => [p.participant.name, p.total]));
    expect(by).toEqual({ Jagadish: 570, Arun: 360, Vijay: 0 });
    expect(s.groupTotal).toBe(930);
    expect(s.participantCount).toBe(3);
    expect(s.averagePerParticipant).toBe(310);
    expect(s.restaurantSpend.map((r) => [r.restaurant.name, r.total, r.people.length])).toEqual([['Restaurant A', 570, 1], ['Restaurant B', 360, 1]]);
  });

  it('updates totals when quantity changes and ignores zero quantities', () => {
    const s = summarize({ ...base, selections: [S('a', 'shawarma', 'rb', 3), S('j', 'biryani', 'ra', 0)] });
    expect(s.groupTotal).toBe(540);
    expect(s.people.find((p) => p.participant.id === 'j')!.lines).toHaveLength(0);
  });

  it('avoids floating point drift', () => {
    const s = summarize({ participants: [P('j', 'J')], restaurants: [R('ra', 'A')], foodItems: [F('x', 'ra', 0.1), F('y', 'ra', 0.2)], selections: [S('j', 'x', 'ra', 1), S('j', 'y', 'ra', 1)] });
    expect(s.groupTotal).toBe(0.3);
  });

  it('handles an empty group', () => {
    const s = summarize({ participants: [], restaurants: [], foodItems: [], selections: [] });
    expect(s).toMatchObject({ groupTotal: 0, participantCount: 0, averagePerParticipant: 0 });
  });
});
