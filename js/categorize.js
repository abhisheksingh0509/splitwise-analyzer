// categorize.js — keyword-based refinement for the catch-all "General" bucket.
//
// Splitwise's "General" category hides very different spend (a hotel stay, a
// bus ticket, a bottle of whisky). This maps a free-text description to a finer
// category using substring keyword matching. ONLY applied to General /
// uncategorized expense rows (see parse.js); real categories are left untouched.
//
// Rules are ordered — the FIRST rule with a matching keyword wins, so put the
// less ambiguous buckets first. Edit freely; it's just data.

export const CATEGORY_RULES = [
  { category: 'Accommodation', keywords: ['stay', 'hotel', 'resort', 'lodge', 'homestay', 'hostel', 'airbnb', 'room', 'check-in', 'checkin'] },
  { category: 'Transport',     keywords: ['cab', 'taxi', 'auto ', 'rickshaw', 'bus', 'train', 'traveller', 'traveler', 'trvaeller', 'flight', 'plane', 'uber', 'ola', 'fuel', 'petrol', 'diesel', 'parking', 'toll', 'airport', 'ferry', 'metro', 'ride'] },
  { category: 'Liquor',        keywords: ['alcohol', 'beer', 'wine', 'whisky', 'whiskey', 'pipers', 'chakna', 'liquor', 'rum', 'vodka', 'tequila', 'pub', 'brewery'] },
  { category: 'Groceries',     keywords: ['grocery', 'groceries', 'basket', 'instamart', 'blinkit', 'zepto', 'supermarket', 'vegetable', 'fruit', 'mart'] },
  { category: 'Activities',    keywords: ['museum', 'elephant', 'safari', 'zoo', 'park', 'entry', 'ticket', 'tour', 'trek', 'boating', 'sightsee', 'plantation', 'falls', 'temple', 'fort', 'garden', 'palace', 'show', 'entrance'] },
  { category: 'Food & drinks', keywords: ['lunch', 'dinner', 'breakfast', 'brunch', 'cafe', 'coffee', 'restaurant', 'snack', 'cuisine', 'cusine', 'meal', 'tea', 'juice', 'sugarcane', 'paneer', 'chicken', 'pizza', 'biryani', 'dosa', 'food'] },
  { category: 'Shopping',      keywords: ['shopping', 'souvenir', 'gift', 'clothes', 'shirt', 'mall'] },
  { category: 'Household',     keywords: ['kitchen', 'household', 'supplies', 'water deposit', 'detergent', 'cleaning'] },
];

// Returns a refined category string, or null if nothing matched.
export function categorize(description) {
  const d = String(description || '').toLowerCase();
  if (!d.trim()) return null;
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((kw) => d.includes(kw))) return rule.category;
  }
  return null;
}
