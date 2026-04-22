import { Category, Country, Language, SortBy } from './constants';

export interface Article {
  source: {
    id: string,
    name: string,
  };
  author?: string;
  title: string;
  description: string;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string;
}

export interface ArticlesResponse {
  status: 'ok' | 'error';
  totalResults: number;
  articles: Article[];
  code?: string;
  message?: string;
}

export interface SearchParams {
  q?: string;
  from?: string;
  to?: string;
  language?: Language;
  sources?: string;
  sortBy?: SortBy;
  page: number;
  pageSize: number;
}

export interface TopHeadlinesParams extends SearchParams {
  category?: Category;
  country?: Country;
}

export type NewsResult =
  | { state: 'loading' }
  | { state: 'ok'; data: ArticlesResponse }
  | { state: 'error'; code: string; message: string };
