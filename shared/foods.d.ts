export interface Dish { name: string; price: number }
export interface Food { id: string; label: string; emoji: string; cuisine: string; name: string; dishes: Dish[]; tone: string }
export const FOODS: Food[];
export const FOOD_IDS: Set<string>;
export function foodById(id: string): Food | undefined;
