import type { FoodItem, Participant, Restaurant, Selection } from './types';

export interface OrderLine { selection: Selection; item: FoodItem; restaurant: Restaurant | undefined; lineTotal: number }
export interface ParticipantSummary { participant: Participant; lines: OrderLine[]; total: number; itemCount: number; restaurants: Restaurant[] }
export interface RestaurantSpend { restaurant: Restaurant; total: number; people: Participant[]; itemCount: number }
export interface GroupSummary {
  people: ParticipantSummary[];
  groupTotal: number;
  participantCount: number;
  averagePerParticipant: number;
  restaurantSpend: RestaurantSpend[];
}

/** Money is kept in paise-precision to avoid floating point drift (0.1 + 0.2). */
const round2 = (n: number) => Math.round(n * 100) / 100;

export function summarize(input: { participants: Participant[]; restaurants: Restaurant[]; foodItems: FoodItem[]; selections: Selection[] }): GroupSummary {
  const items = new Map(input.foodItems.map((f) => [f.id, f]));
  const rests = new Map(input.restaurants.map((r) => [r.id, r]));
  const spend = new Map<string, RestaurantSpend>();

  const people = input.participants.map((participant): ParticipantSummary => {
    const lines: OrderLine[] = [];
    for (const selection of input.selections) {
      if (selection.participantId !== participant.id || selection.quantity <= 0) continue;
      const item = items.get(selection.foodItemId);
      if (!item) continue;
      // Individual cost = Σ (price × quantity)
      const lineTotal = round2(item.price * selection.quantity);
      const restaurant = item.restaurantId ? rests.get(item.restaurantId) : undefined;
      lines.push({ selection, item, restaurant, lineTotal });
      if (restaurant) {
        const s = spend.get(restaurant.id) ?? { restaurant, total: 0, people: [], itemCount: 0 };
        s.total = round2(s.total + lineTotal);
        s.itemCount += selection.quantity;
        if (!s.people.includes(participant)) s.people.push(participant);
        spend.set(restaurant.id, s);
      }
    }
    const restaurants = [...new Set(lines.map((l) => l.restaurant).filter(Boolean))] as Restaurant[];
    if (!restaurants.length && participant.restaurantId && rests.has(participant.restaurantId)) restaurants.push(rests.get(participant.restaurantId)!);
    return {
      participant,
      lines: lines.sort((a, b) => a.item.name.localeCompare(b.item.name)),
      total: round2(lines.reduce((t, l) => t + l.lineTotal, 0)),
      itemCount: lines.reduce((t, l) => t + l.selection.quantity, 0),
      restaurants,
    };
  });

  // Group total = Σ participants' costs; Average = group total / number of participants
  const groupTotal = round2(people.reduce((t, p) => t + p.total, 0));
  const participantCount = people.length;
  return {
    people,
    groupTotal,
    participantCount,
    averagePerParticipant: participantCount ? round2(groupTotal / participantCount) : 0,
    restaurantSpend: [...spend.values()].sort((a, b) => b.total - a.total),
  };
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
export const formatINR = (n: number) => inr.format(n);
