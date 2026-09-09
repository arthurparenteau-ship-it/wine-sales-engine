# Wine Sales Engine

Wine and spirits commercial prioritization: vanilla HTML/CSS/JS, Vercel Node.js functions, Supabase/PostgreSQL. No framework migration, LLM scoring, outbound messaging, or new runtime dependencies.

## Implemented

- Supabase pipeline sorted by stored Opportunity Score (unknown last).
- Responsive company dossier with six metrics, contacts, signals, source links, and rule-based next action.
- Quick Search and New Search use the same validated search API.
- Persistent pending → running → completed/failed lifecycle, recent search history, retry, safe request replay, and dashboard refresh.
- Provider adapter, conservative evidence verification, normalization, deduplication, deterministic scoring and atomic company/contact/signal persistence.
- Real Brave Search adapter and local-only evidence-file adapter. No fallback demo generation.
- Database-backed live signals and exact total (research/scoring provenance is excluded from the buying-signal count).

## Architecture / lifecycle

Browser → `POST /api/search` → atomic request claim → provider → normalization → evidence checks → batch dedup → qualification/scoring → atomic database import + completion → dashboard refresh.

This release runs bounded research synchronously within the POST request; it does not enqueue work that depends on a serverless process surviving after response. Status/history reads show persisted state while POST runs. Search budget is 35 seconds, individual database requests 10 seconds, cleanup is bounded; Vercel function maxDuration is 60 seconds. Interrupted pending/running searches older than two minutes become failed on the next history/status read or submission. No cron is required. Future high-volume research needs a durable job runner.

A request UUID makes network retries replay the same search without duplicate execution. Explicit retry of a failed search creates a new UUID. Database admission is serialized: one active search project-wide, ten new searches per hour. These conservative global limits bound anonymous usage; they are not user authentication. Import and completion run in one transaction, so failed imports cannot leave partial prospects.

## API

| Route | Methods | Behavior |
|---|---|---|
| `/api/companies` | GET | Company list, selected dashboard fields |
| `/api/company?id=<uuid>` | GET | Company + related contacts/signals |
| `/api/signals` | GET | Up to 50 strongest signals, date tie-breaker, exact total |
| `/api/search` | POST | Validate, persist and execute a search |
| `/api/search?id=<uuid>` | GET | Persisted search details/status/metrics |
| `/api/searches` | GET | Latest 20 searches and provider availability |

POST requires JSON with exactly `market`, `prospect_type`, `product_focus`, `request_id` (UUID). Supported markets: Belgium, France, United Kingdom, Switzerland. Types: Importer / Distributor, Premium Caviste, Restaurant, Spirits Buyer. Products: Wine + Armagnac, Wine, Armagnac. Input limit: 2 KB. Provider-unavailable attempts create a failed search and return 503; empty verified results are a legitimate completed search with zero prospects. A 202 replay means the original request is still pending/running; inspect status/history.

All APIs use no-store. Errors are stable codes and safe messages, never raw database/provider bodies. Logs contain only search ID, stage, provider identifier and numeric counts.

## Configuration

Existing server variables: `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (modern secret key, sent only as the server `apikey` header).

For autonomous discovery configure these **server-side Vercel environment variables** and redeploy:

- `RESEARCH_PROVIDER=brave`
- `BRAVE_SEARCH_API_KEY`: an active Brave Web Search API subscription key. Obtain from the Brave API dashboard; never paste it into source, browser code or logs. Choose a subscription whose terms allow the intended storage of result excerpts.

No provider key is bundled. A connected assistant web-search tool is not available inside Vercel functions. If these variables are absent, history and the POST failure explicitly say provider unavailable. Supabase setup alone cannot provide web discovery.

Local evidence mode: `RESEARCH_PROVIDER=evidence-file`, `RESEARCH_EVIDENCE_FILE=/absolute/path/to/verified-evidence.json`. It is disabled when `VERCEL` is set or NODE_ENV is production. The file must contain your real, reviewed public-source excerpts following [the provider contract](docs/research.md); no fixture dataset ships as a production provider.

## Database migrations

Versioned SQL is in `supabase/migrations/`. The search migration adds only request_id, updated_at, error_code and metrics to searches, plus indexes and transactional helper functions. The second migration adds a signal count function. Existing companies, contacts and signals are not modified by migrations. New functions are SECURITY INVOKER with fixed search_path, revoked from PUBLIC/anon/authenticated, executable by service_role. Existing RLS is preserved.

Apply migrations before deploying the new endpoints. They were applied to the connected project for this release; do not rerun the same SQL manually. Helper functions are not public SQL proxies and accept only structured application arguments.

## Evidence, scoring, deduplication

See [research rules and provider contract](docs/research.md) for exact weights, thresholds, acceptance rules and limits. Missing facts remain null. A total is generated only when all scoring dimensions have evidence. Existing populated scores are preserved; candidate calculations are recorded separately as scoring evidence. No premium positioning, capacity, openness, organic or terroir metric is invented.

Canonical domain ignores HTTP/HTTPS, www, case, path and trailing slash. Database matching prefers domain; normalized name + country is used only when one domain is absent. Serialized imports prevent duplicates across simultaneous pipeline calls. External/manual database writers must use equivalent checks. Existing data is never deleted; populated fields and existing contacts are preserved. New verified missing company values and previously unseen evidence/contacts are appended transactionally. Ambiguous same-name companies with different domains remain separate.

## Security boundary

The application still has no authentication. Read endpoints expose their allowlisted fields (including contact details) publicly through server privileges that bypass RLS. The search endpoint can create bounded searches and verified imports; it is not a generic database proxy. Use Vercel deployment access protection for private commercial data. Origin checks block cross-site browser POSTs but do not authenticate direct API clients. Global database-backed limits bound provider spending; a future authenticated workspace is required for multi-user production.

No candidate website is fetched by the server. The only external research request is to a hardcoded HTTPS Brave API endpoint with redirects disabled. Citation URLs reject non-HTTP(S), credentials, IP literals, local names, nonstandard ports and whitespace; validation is not permission to fetch them. A future crawler must add DNS/IP pinning, private-address rejection and redirect revalidation. Provider responses are capped at 512 KB; database responses at 1.5 MB. The browser uses DOM/textContent, with validated HTTP(S) links and noopener/noreferrer. No arbitrary SQL, table, column, provider URL or filter is accepted from a client.

## Local checks

Requires Node 22+ (built-in fetch, AbortSignal, node:test). No dependencies to install:

```
node --test tests/*.test.mjs
node --env-file=.env.local scripts/dev.mjs
```

Use an ignored `.env.local` with server variables, or run the dev server without it to test missing configuration. Open http://127.0.0.1:3000. Never commit .env files. The developer server exposes only exact application routes/assets.

Automated tests mock provider/database responses and do not generate production prospects. The rollback-only PostgreSQL integration check in `tests/database.sql` verifies request replay, import, repeated-search dedup, preservation of existing data, and function privileges. It was run on the connected database without retaining fixture rows.

## Production verification

1. Confirm Vercel deployed the latest main commit and the existing Supabase variables remain configured.
2. Check `/api/companies`, `/api/signals`, `/api/searches`; open a dossier and inspect stored sources.
3. Submit Belgium / Importer / Distributor / Wine + Armagnac. Confirm a real search record and its outcome in history.
4. Without a provider key, expect persisted failed + PROVIDER_UNAVAILABLE, no added companies. With a key, expect only evidence-accepted prospects or a legitimate zero-result completion.
5. Retry the same request UUID: no extra search/import. Retry failed research using the UI: new search record.
6. Check counts, descending score order, recent history, drawer, mobile layout and console. API methods/invalid inputs must return safe 4xx errors.

## Planned, not implemented

Durable background jobs, broad crawling, richer multilingual entity extraction, manually reviewed evidence changes, automatic refreshing of reviewed scores, authentication/tenancy, CRM/billing/outreach. The initial adapter intentionally favors false negatives over unsupported claims.
