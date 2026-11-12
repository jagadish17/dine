export type Provider = 'osm' | 'google';

export interface GroupLocation { lat: number; lng: number; label: string; setBy?: string; setAt?: string }

export interface Group {
  id: string;
  name: string;
  inviteCode: string;
  location: GroupLocation | null;
  createdAt: string;
  hostParticipantId: string | null;
}

export interface Participant {
  id: string;
  groupId: string;
  name: string;
  preferredFoods: string[];
  restaurantId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A restaurant as returned by discovery (not yet saved to a group). */
export interface PlaceResult {
  provider: Provider;
  providerId: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  distanceKm: number | null;
  rating: number | null;
  ratingCount: number | null;
  priceLabel: string | null;
  imageUrl: string | null;
  categories: string[];
  matchedFoods?: string[];
  sourceUrl: string | null;
}

export interface Restaurant extends PlaceResult { id: string; groupId: string; addedBy: string; createdAt?: string; fetchedAt: string }

export interface FoodItem {
  id: string;
  groupId: string;
  restaurantId: string | null;
  foodId?: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  /** No licensed menu API exists for these providers, so every price is a participant estimate. */
  priceSource: 'participant_estimate' | 'provider_verified';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Selection {
  id: string;
  groupId: string;
  participantId: string;
  restaurantId: string | null;
  foodItemId: string;
  quantity: number;
  updatedAt: string;
}

export interface Snapshot {
  group: Group;
  participants: Participant[];
  restaurants: Restaurant[];
  foodItems: FoodItem[];
  selections: Selection[];
  online: string[];
  provider: Provider;
  serverTime: string;
}
