// Shared between the server (restaurant matching) and the client (food tiles, dish lists).
// `cuisine` and `name` are regex fragments matched against OpenStreetMap tags.
// Dish prices are TYPICAL APPROXIMATE prices for the dish, shown as "approx." and editable —
// they are not any specific restaurant's menu price. Edit them here to match your area.

/** @type {{ id: string, label: string, emoji: string, cuisine: string, name: string, dishes: { name: string, price: number }[], tone: string }[]} */
export const FOODS = [
  { id: 'biryani', label: 'Biryani', emoji: '🍛', cuisine: 'biryani|hyderabadi|mughlai|indian', name: 'biryani|briyani', tone: 'saffron',
    dishes: [{ name: 'Chicken Biryani', price: 250 }, { name: 'Mutton Biryani', price: 350 }, { name: 'Egg Biryani', price: 180 }, { name: 'Veg Biryani', price: 160 }, { name: 'Chicken 65', price: 200 }] },
  { id: 'dosa', label: 'Dosa', emoji: '🥞', cuisine: 'south_indian|vegetarian|regional', name: 'dosa|tiffin|bhavan|udupi|saravana', tone: 'wheat',
    dishes: [{ name: 'Plain Dosa', price: 70 }, { name: 'Masala Dosa', price: 100 }, { name: 'Ghee Roast', price: 120 }, { name: 'Onion Uttapam', price: 110 }, { name: 'Idli Vada', price: 70 }] },
  { id: 'parotta', label: 'Parotta', emoji: '🫓', cuisine: 'kerala|south_indian|chettinad|regional', name: 'parotta|porotta|barotta|mess', tone: 'clay',
    dishes: [{ name: 'Parotta (2 pcs)', price: 60 }, { name: 'Kothu Parotta', price: 150 }, { name: 'Chilli Parotta', price: 140 }, { name: 'Chicken Salna', price: 120 }, { name: 'Bun Parotta', price: 80 }] },
  { id: 'fried_rice', label: 'Fried Rice', emoji: '🍚', cuisine: 'chinese|asian|indo_chinese', name: 'fried rice|chinese|wok', tone: 'olive',
    dishes: [{ name: 'Chicken Fried Rice', price: 180 }, { name: 'Egg Fried Rice', price: 150 }, { name: 'Veg Fried Rice', price: 140 }, { name: 'Schezwan Fried Rice', price: 190 }] },
  { id: 'south_indian', label: 'Meals', emoji: '🍱', cuisine: 'south_indian|kerala|chettinad|andhra|regional|indian', name: 'mess|bhavan|udupi|meals', tone: 'leaf',
    dishes: [{ name: 'South Indian Meals', price: 150 }, { name: 'Chicken Meals', price: 220 }, { name: 'Fish Curry Meals', price: 250 }, { name: 'Curd Rice', price: 80 }] },
  { id: 'shawarma', label: 'Shawarma', emoji: '🌯', cuisine: 'shawarma|kebab|arab|lebanese|middle_eastern|turkish', name: 'shawarma|shwarma|kebab', tone: 'clay',
    dishes: [{ name: 'Chicken Shawarma', price: 130 }, { name: 'Shawarma Plate', price: 200 }, { name: 'Falafel Wrap', price: 140 }] },
  { id: 'grilled_chicken', label: 'Grill Chicken', emoji: '🍗', cuisine: 'chicken|grill|barbecue|arab|kebab', name: 'grill|chicken|alfaham|tandoor', tone: 'ember',
    dishes: [{ name: 'Grill Chicken (Half)', price: 280 }, { name: 'Grill Chicken (Full)', price: 520 }, { name: 'Alfaham (Quarter)', price: 160 }, { name: 'Tandoori Chicken (Half)', price: 300 }] },
  { id: 'noodles', label: 'Noodles', emoji: '🍜', cuisine: 'chinese|asian|noodle|thai|japanese|indo_chinese', name: 'noodle|wok|ramen', tone: 'olive',
    dishes: [{ name: 'Veg Noodles', price: 140 }, { name: 'Chicken Noodles', price: 180 }, { name: 'Schezwan Noodles', price: 190 }] },
  { id: 'pizza', label: 'Pizza', emoji: '🍕', cuisine: 'pizza|italian', name: 'pizza|pizzeria', tone: 'tomato',
    dishes: [{ name: 'Margherita Pizza', price: 249 }, { name: 'Farmhouse Pizza', price: 349 }, { name: 'Chicken Pizza', price: 399 }, { name: 'Garlic Bread', price: 129 }] },
  { id: 'burger', label: 'Burger', emoji: '🍔', cuisine: 'burger|american', name: 'burger', tone: 'amber',
    dishes: [{ name: 'Chicken Burger', price: 180 }, { name: 'Veg Burger', price: 120 }, { name: 'French Fries', price: 100 }] },
  { id: 'north_indian', label: 'North Indian', emoji: '🫕', cuisine: 'north_indian|punjabi|mughlai|indian', name: 'dhaba|punjab|tandoor', tone: 'saffron',
    dishes: [{ name: 'Butter Chicken', price: 280 }, { name: 'Paneer Butter Masala', price: 240 }, { name: 'Butter Naan', price: 50 }, { name: 'North Indian Thali', price: 250 }] },
  { id: 'chinese', label: 'Chinese', emoji: '🥡', cuisine: 'chinese|asian|indo_chinese', name: 'chinese|wok|dragon', tone: 'tomato',
    dishes: [{ name: 'Chilli Chicken', price: 220 }, { name: 'Gobi Manchurian', price: 160 }, { name: 'Sweet Corn Soup', price: 100 }] },
  { id: 'bbq', label: 'BBQ', emoji: '🔥', cuisine: 'barbecue|bbq|grill', name: 'bbq|barbeque|barbecue|grill', tone: 'ember',
    dishes: [{ name: 'BBQ Chicken Wings', price: 260 }, { name: 'Grilled Platter', price: 450 }] },
];

export const FOOD_IDS = new Set(FOODS.map((f) => f.id));

export function foodById(id) {
  return FOODS.find((f) => f.id === id);
}
