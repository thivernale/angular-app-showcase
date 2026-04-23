export const CATEGORIES = [
  'business',
  'entertainment',
  'general',
  'health',
  'science',
  'sports',
  'technology'
] as const;
export type Category = typeof CATEGORIES[number];

export const LANGUAGES = ['ar', 'de', 'en', 'es', 'fr', 'he', 'it', 'nl', 'no', 'pt', 'ru', 'se', 'ud', 'zh'];
export type Language = typeof LANGUAGES[number];

export const COUNTRIES = ['ae', 'ar', 'at', 'au', 'be', 'bg', 'br', 'ca', 'ch', 'cn', 'co', 'cu', 'cz', 'de', 'eg', 'fr', 'gb', 'gr', 'hk', 'hu', 'id', 'ie', 'il', 'in', 'it', 'jp', 'kr', 'lt', 'lv', 'ma', 'mx', 'my', 'ng', 'nl', 'no', 'nz', 'ph', 'pl', 'pt', 'ro', 'rs', 'ru', 'sa', 'se', 'sg', 'si', 'sk', 'th', 'tr', 'tw', 'ua', 'us', 've', 'za'] as const;
export type Country = typeof COUNTRIES[number];

export const SEARCH_TYPES = ['everything', 'top-headlines'] as const;
export type SearchType = typeof SEARCH_TYPES[number];

export const SEARCH_IN = ['title', 'description', 'content'] as const;
export type SearchIn = typeof SEARCH_IN[number];

export const SORT_BY = ['relevancy', 'popularity', 'publishedAt'] as const;
export type SortBy = typeof SORT_BY[number];

export const INITIAL_SEARCH_QUERY = 'today';
