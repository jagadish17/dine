import type { PlaceResult, Provider, Restaurant, FoodItem } from './types';
import { getSession } from './session';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(method: string, path: string, body?: unknown, code?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = code ? getSession(code)?.token : undefined;
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'Can’t reach the DineTogether server. Check your connection.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  return data as T;
}

const g = (code: string) => `/api/groups/${encodeURIComponent(code)}`;

export interface SubmitBody { code?: string; name: string; items: { name: string; price: number; qty: number; foodId: string }[]; location?: { lat: number; lng: number; label: string } | null }
export interface FoodsNear { radiusKm: number; restaurantCount: number; foods: { id: string; count: number; nearest: { name: string; distanceKm: number }[] }[] }

export const api = {
  submit: (body: SubmitBody) => request<{ code: string; participantId: string; token: string | null; groupName: string }>('POST', '/api/submit', body, body.code),
  config: () => request<{ provider: Provider; lanHosts: string[]; publicUrl: string | null }>('GET', '/api/config'),
  createGroup: (groupName: string, hostName: string) =>
    request<{ inviteCode: string; participantId: string; token: string }>('POST', '/api/groups', { groupName, hostName }),
  preview: (code: string) => request<{ name: string; participantCount: number; participantNames: string[] }>('GET', `${g(code)}/preview`),
  join: (code: string, name: string) => request<{ participantId: string; token: string }>('POST', `${g(code)}/join`, { name }),
  updateMe: (code: string, patch: { name?: string; preferredFoods?: string[]; restaurantId?: string | null }) =>
    request<{ ok: true }>('PATCH', `${g(code)}/me`, patch, code),
  leave: (code: string) => request<{ ok: true }>('DELETE', `${g(code)}/me`, undefined, code),
  setLocation: (code: string, loc: { lat: number; lng: number; label?: string }) => request<{ ok: true }>('PUT', `${g(code)}/location`, loc, code),
  saveRestaurant: (code: string, place: PlaceResult) => request<Restaurant>('POST', `${g(code)}/restaurants`, place, code),
  addFoodItem: (code: string, item: { restaurantId: string; name: string; price: number; description?: string; imageUrl?: string; addToMyOrder?: boolean }) =>
    request<FoodItem>('POST', `${g(code)}/food-items`, item, code),
  updateFoodItem: (code: string, id: string, patch: Partial<Pick<FoodItem, 'name' | 'price' | 'description' | 'imageUrl'>>) =>
    request<FoodItem>('PATCH', `${g(code)}/food-items/${id}`, patch, code),
  deleteFoodItem: (code: string, id: string) => request<{ ok: true }>('DELETE', `${g(code)}/food-items/${id}`, undefined, code),
  setQuantity: (code: string, foodItemId: string, quantity: number) => request<{ ok: true }>('PUT', `${g(code)}/selections`, { foodItemId, quantity }, code),
  nearby: (lat: number, lng: number, foods: string[]) =>
    request<{ provider: Provider; radiusKm: number; restaurants: PlaceResult[] }>('GET', `/api/places/nearby?lat=${lat}&lng=${lng}&foods=${foods.join(',')}`),
  foodsNear: (lat: number, lng: number) => request<FoodsNear>('GET', `/api/places/foods?lat=${lat}&lng=${lng}`),
  geocode: (q: string) => request<{ results: { label: string; lat: number; lng: number }[] }>('GET', `/api/geocode?q=${encodeURIComponent(q)}`),
};
