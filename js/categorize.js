// categorize.js — keyword-based refinement for the catch-all "General" bucket.
//
// Splitwise's "General" category hides very different spend (a hotel stay, a
// bus ticket, a bottle of whisky). A categorizer maps a free-text description
// to a finer category using substring keyword matching. ONLY applied to
// General / uncategorized expense rows (see parse.js).
//
// Rules are ordered — the FIRST rule with a matching keyword wins, so put the
// less ambiguous buckets first. Users can edit these in the UI; the defaults
// live here.

export const DEFAULT_RULES = [
  { category: 'Accommodation', keywords: ['stay', 'hotel', 'resort', 'lodge', 'homestay', 'hostel', 'airbnb', 'room', 'check-in', 'checkin'] },
  { category: 'Transport',     keywords: ['cab', 'taxi', 'auto ', 'rickshaw', 'bus', 'train', 'traveller', 'traveler', 'trvaeller', 'flight', 'plane', 'uber', 'ola', 'fuel', 'petrol', 'diesel', 'parking', 'toll', 'airport', 'ferry', 'metro', 'ride'] },
  { category: 'Liquor',        keywords: ['alcohol', 'beer', 'wine', 'whisky', 'whiskey', 'pipers', 'chakna', 'liquor', 'rum', 'vodka', 'tequila', 'pub', 'brewery'] },
  { category: 'Groceries',     keywords: ['grocery', 'groceries', 'basket', 'instamart', 'blinkit', 'zepto', 'supermarket', 'vegetable', 'fruit', 'mart'] },
  { category: 'Activities',    keywords: ['museum', 'elephant', 'safari', 'zoo', 'park', 'entry', 'ticket', 'tour', 'trek', 'boating', 'sightsee', 'plantation', 'falls', 'temple', 'fort', 'garden', 'palace', 'show', 'entrance'] },
  { category: 'Food & drinks', keywords: ['lunch', 'dinner', 'breakfast', 'brunch', 'cafe', 'coffee', 'restaurant', 'snack', 'cuisine', 'cusine', 'meal', 'tea', 'juice', 'sugarcane', 'paneer', 'chicken', 'pizza', 'biryani', 'dosa', 'food'] },
  { category: 'Shopping',      keywords: ['shopping', 'souvenir', 'gift', 'clothes', 'shirt', 'mall'] },
  { category: 'Household',     keywords: ['kitchen', 'household', 'supplies', 'water deposit', 'detergent', 'cleaning'] },
];

// Build a categorizer function from a rules array.
// Returns (description) => refined category string, or null if nothing matched.
export function makeCategorizer(rules = DEFAULT_RULES) {
  const prepared = (rules || [])
    .filter((r) => r && r.category && Array.isArray(r.keywords) && r.keywords.length)
    .map((r) => ({ category: r.category, keywords: r.keywords.map((k) => String(k).toLowerCase()).filter(Boolean) }));
  return (description) => {
    const d = String(description || '').toLowerCase();
    if (!d.trim()) return null;
    for (const rule of prepared) {
      if (rule.keywords.some((kw) => d.includes(kw))) return rule.category;
    }
    return null;
  };
}

// Default categorizer, backed by DEFAULT_RULES.
export const categorize = makeCategorizer(DEFAULT_RULES);
