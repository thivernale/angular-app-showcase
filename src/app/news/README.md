# News Feature

Searches and displays news articles via [NewsAPI](https://newsapi.org/docs). Supports two endpoints, a full filter form, URL-synced state, pagination, and an automatic mock-data fallback when the API rate limit is hit.

## API endpoints

Requests are proxied through `/newsapi/v2` (configured in `angular.json`) so the API key is never exposed in browser traffic.

### Everything — `GET /v2/everything`

[Docs](https://newsapi.org/docs/endpoints/everything). Searches across all articles. Supports `q`, `from`, `to`, `language`, `sources`, `sortBy`, `page`, `pageSize`.

### Top Headlines — `GET /v2/top-headlines`

[Docs](https://newsapi.org/docs/endpoints/top-headlines). Returns breaking news. Supports `q`, `language`, `sources`, `category`, `country`, `page`, `pageSize`. Does **not** support `from`, `to`, or `sortBy`.

### Error responses

NewsAPI returns errors with `status: 'error'` in the same response shape as success:

```json
{ "status": "error", "code": "parametersMissing", "message": "..." }
```

| Code | Trigger | HTTP status |
|---|---|---|
| `parametersMissing` | No narrowing params supplied (e.g. no `q`, `sources`, etc.) | 200 |
| `rateLimited` | >100 requests / 24 h on developer plan | 429 |
| `unauthorized` | Invalid or missing API key | 401 |

`NewsService.errorResponse()` maps `HttpErrorResponse` to an `ArticlesResponse` with `status: 'error'` so the component never receives a thrown error — error state is always handled reactively via `newsSignal`.

## Filter form (`NewsFilterFormComponent`)

`NewsFilterFormComponent` owns the reactive form and emits a `FilterSubmitEvent` to `NewsComponent` on submit. The endpoint toggle (`everything` / `top-headlines`) is part of the form component.

Field availability depends on the selected endpoint:

| Field | Everything | Top Headlines |
|---|---|---|
| q (free text) | ✓ | ✓ |
| from / to | ✓ | — |
| language | ✓ | ✓ |
| sortBy | ✓ | — |
| sources | ✓ | ✓ |
| category | — | ✓ |
| country | — | ✓ |

**Sources mutual exclusivity**: selecting any source disables `category` and `country` (NewsAPI rejects requests that combine them). The available sources list is filtered reactively by the current `language`, `category`, and `country` values.

**URL sync**: on submit, `NewsComponent` writes all active params to the URL as query params (`replaceUrl: true`). On page load, `NewsFilterFormComponent` reads `ActivatedRoute.snapshot.queryParams` and auto-submits if any params are present — making filters bookmarkable.

## State and data flow

```
NewsFilterFormComponent
  └─ submitted (output) ──► NewsComponent
                              ├─ searchType signal
                              ├─ searchParamsSignal
                              └─ querySignal (computed)
                                   └─ toObservable → switchMap
                                        └─ NewsService.searchEverything / searchTopHeadlines
                                             └─ newsSignal (toSignal) → template
```

`newsSignal` holds a `NewsResult` discriminated union: `loading | ok | error`. The `loading` state is emitted via `startWith` before each HTTP request completes, so the spinner appears immediately on every new search.

## Mock mode and rate-limit fallback

`newsInterceptor` (registered globally in `app.config.ts`) intercepts all `/newsapi/v2` requests:

- If `localStorage['mock-response'] === 'true'`, it returns paginated data from `services/tmp-data.json` instead of making a real HTTP call.
- On a `429` or `401` response from the real API, it sets `localStorage['mock-response'] = 'true'` and reloads the page — subsequent requests then serve mock data automatically.

To reset: `localStorage.removeItem('mock-response')` in the browser console.

## Key files

| File | Purpose |
|---|---|
| `news.component.ts` | Orchestrates state, URL sync, pagination |
| `components/filter-form/` | Reactive form, endpoint toggle, URL restore |
| `services/news.service.ts` | HTTP calls, `buildParams`, mock response |
| `interceptors/news-interceptor.ts` | Mock mode, rate-limit fallback |
| `types/article.interface.ts` | `SearchParams`, `TopHeadlinesParams`, `NewsResult` |
| `types/constants.ts` | Typed option arrays for all filter fields |