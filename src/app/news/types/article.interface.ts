export interface Article {
  source: {
    id: string,
    name: string,
  };
  author?: string;
  title: string;
  description: string;
  url: string;
  urlToImage: string;
  publishedAt: string;
  content: string;
}

export interface ArticlesResponse {
  status: string;
  totalResults: number;
  articles: Article[];
}

export interface ErrorResponse {
  code: string;
  status: string;
  message: string;
}

export interface SearchParams {
  q?: string;
  from?: string;
  to?: string;
  language?: string;
  sources?: string;
  sortBy?: string;
  page: number;
  pageSize: number;
}

export interface TopHeadlinesParams extends SearchParams {
  // supported only by top-headlines endpoint
  category?: string;
  country?: string;
}
