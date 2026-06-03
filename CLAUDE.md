# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start              # Dev server at http://0.0.0.0:4200
npm run build          # Production build
npm run lint           # ESLint via angular-eslint
npm test               # Run tests with Vitest (watch mode)
npm run test:ci        # Run tests headless (CI)
npm run test:browser   # Run tests in Chromium
npm run test:docker    # Run tests inside Docker (no local Node/npm required)
```

To run a single test file:
```bash
npx vitest run src/app/path/to/file.spec.ts
```

### Docker

`Dockerfile` uses `mcr.microsoft.com/playwright:v1.58.2-noble` as the base image — Chromium is pre-installed, so no browser download happens during the build. The image version is pinned to match the `playwright` package version in `package.json` to avoid browser binary revision mismatches.

`npm run test:docker` builds the image (Docker layer cache makes subsequent builds fast) then runs `test:ci` inside the container.

## Architecture

Angular 21 app using **standalone components** exclusively — no NgModules. All feature imports are declared directly in each component's `imports: []` array.

### Feature Modules

- **`auth/`** — Login/register components, `AuthService` (signal-based), `authGuard` (blocks logged-in users from `/auth/*` routes), and `authInterceptor` (appends `Authorization: Token <token>` from localStorage to HTTP requests). Backend: `https://api.realworld.show`.
- **`todos/`** — Full CRUD todos. `TodosService` uses Angular signals exclusively.
- **`articles/`** — Article search against the realworld.show API. Uses `toObservable/toSignal` interop to drive HTTP calls from a signal-based search query.
- **`news/`** — News search via NewsAPI (proxied at `/newsapi/v2`). Supports two search modes (`everything` / `top-headlines`), URL-synced filters, and pagination. The `newsInterceptor` enables a mock-response mode: it activates automatically on 429/401 by setting `localStorage['mock-response']='true'` and reloading; subsequent requests return local fixture data instead of hitting the API.
- **`fleet/`** — Vehicle management with action history. `VehicleService` uses RxJS `BehaviorSubject`/`Subject` (older pattern, in contrast to todos).
- **`calendar/`** — Displays activities from a static JSON data file passed via route `data`.
- **`gallery/`** — Image gallery backed by `ImageService`, rendered via `CarouselComponent` with signal-driven autoplay using `effect()`.
- **`components/`** — Shared: `AlertComponent` (toast notifications), `SidebarComponent`, `MainComponent` (router outlet wrapper), `PaginationComponent`, `CarouselComponent`.
- **`interval-timer/`** — Countdown interval timer with configurable rounds and duration. Uses `signal()` for internal state, `effect()` to manage a `setInterval` tied to a wall-clock `targetTime`, and `computed()` for per-interval remaining seconds. Supports pause/resume and optional beep sounds via the Web Audio API.
- **`directives/`** — `ClickOutsideDirective`: emits `clickOutsideRef` when a click occurs outside the host element.

### State Management

Two patterns coexist — use signals for new feature work:

1. **Angular Signals** (preferred, used in `TodosService`, `AuthService`, `AppComponent`, `NewsComponent`):
   - `signal()` for writable state, `.asReadonly()` for public exposure
   - `computed()` for derived state
   - Child components receive signals via `input()` / `input.required()`
   - `toObservable()` / `toSignal()` bridge when an HTTP call must be driven by a signal (see `NewsComponent`, `ArticlesComponent`)

2. **RxJS** (legacy, used in `VehicleService`, `AlertService`):
   - `BehaviorSubject<T>` for stateful streams
   - `Subject<T>` for event-only streams

### Routing

`app.routes.ts` defines top-level lazy routes. Default redirect goes to `/todos`. The `authGuard` (canActivateChild) protects `/auth/**` — it grants access only when the user is **not** logged in.

### HTTP Interceptors

Two functional interceptors are registered globally in `app.config.ts`:
- `authInterceptor` — adds the auth token to requests targeting the realworld API
- `newsInterceptor` — handles mock-mode and rate-limit fallback for the NewsAPI proxy

### Environment Config

`src/environments/environment.ts` (prod) and `environment.development.ts` (dev) expose `authUrl`, `newsApiKey`, and `history_steps`. Angular build swaps the file automatically based on build configuration.

### TypeScript

Strict mode is fully enabled including `noImplicitOverride` and `noPropertyAccessFromIndexSignature`. Always use the `override` keyword when overriding class members.