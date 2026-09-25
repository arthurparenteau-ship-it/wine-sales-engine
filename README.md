# Wine Sales Engine

Commercial prioritization for wine and spirits. Vanilla HTML/CSS/JS → Vercel Node functions → bounded research provider → Supabase/PostgreSQL. No framework migration, runtime dependencies, LLM scoring, outbound messaging or billing.

## Autonomous commercial workspace

Daily bounded campaigns, operator-protected access, private follow-ups, a priority worklist and evidence-guided French/English approach drafts. Read the [activation and operating guide](docs/autonomy.md). Existing research and scoring rules are retained; no email is sent automatically.

## Commercial intelligence release

Quick Search and New Search run multilingual Brave discovery, cluster first-party sources, verify identity/geography/channel, analyse portfolio and capacity, extract dated signals and public contacts, calculate explainable scores, import atomically and refresh the pipeline.

The dossier now shows research opportunity, evidence confidence/coverage, Why now, fit, positive factors, risks, preferred contact, current signal strength and grouped evidence. Original stored scores remain visible separately. Country/type/score/intent/contact/recency filters and four sorts use the current research assessment. Search history shows quality metrics, provider calls, rejection reasons and imported companies.

See [complete research rules](docs/research.md) for query templates, source tiers, signal taxonomy/decay, contact ranking, weights, confidence, recommendations, cache and limitations. These are deterministic evidence indicators, not calibrated probabilities of purchase.

## APIs

| Route | Method | Result |
|---|---|---|
| `/api/companies` | GET | Allowlisted company data + compact current intelligence |
| `/api/company?id=<uuid>` | GET | Company, contacts, stored signals and explained intelligence |
| `/api/signals` | GET | Bounded current-strength ranking and exact stored count |
| `/api/search` | POST | Persist/execute search, or reuse a completed cached search |
| `/api/search?id=<uuid>` | GET | Lifecycle, sanitized quality metrics and accepted company links |
| `/api/searches` | GET | Latest 20 searches and provider availability |

POST JSON: `market`, `prospect_type`, `product_focus`, `request_id` (UUID), optional boolean `refresh`. Supported markets: Belgium, France, United Kingdom, Switzerland. Targets: Importer / Distributor, Premium Caviste, Restaurant, Spirits Buyer. Products: Wine + Armagnac, Wine, Armagnac. No other fields, candidate records, table names, SQL or provider URLs are accepted. Limit 2 KB.

Lifecycle: pending → running → completed/failed. Execution stays inside the POST, max 35 seconds; Vercel maxDuration 60 seconds allows bounded cleanup. Requests interrupted beyond two minutes are expired on the next status/history/submission. Request UUIDs protect retries of executed searches. Cache reuses a completed v2 search for six hours; Fresh research bypasses it. One active run and ten new runs/hour are project-wide, not per user.

## Server configuration

Existing variables: `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (modern sb_secret_ key, server `apikey` header only).

Web discovery requires Vercel Production variables:

- `RESEARCH_PROVIDER=brave`
- `BRAVE_SEARCH_API_KEY` = active Brave Web Search API key

Redeploy after changing environment variables. Never place values in frontend code, commit .env files, or paste credentials into logs. Choose a Brave subscription permitting the intended result/excerpt storage. The assistant's connected search tools do not supply Vercel runtime credentials.

Without a configured provider, searches persist as failed with `PROVIDER_UNAVAILABLE`; no demo company is generated. Provider authentication/upstream errors produce sanitized `PROVIDER_FAILED`. Availability checks confirm configuration presence, not whether a key is valid; an actual run validates the provider.

Local-only evidence adapter: `RESEARCH_PROVIDER=evidence-file`, `RESEARCH_EVIDENCE_FILE=/absolute/path/to/reviewed-evidence.json`. Disabled in Vercel and NODE_ENV=production. Use real reviewed public evidence; shipped unit fixtures never become production prospects.

## Database

Versioned migrations are in `supabase/migrations/` and have been applied to the connected project for this release. Do not rerun their SQL manually.

The intelligence migration adds a bounded company `research_profile`, nullable `last_researched_at`, `search_companies` links and private `company_reviews`. Existing source summaries are marked legacy without asserting fresh research. Original company fields, scores, contacts and signals are preserved. New cache/import helpers retain SECURITY INVOKER, fixed search_path and service-role-only execution. A partial cache index supports identical completed searches; existing domain/name/contact/signal indexes are reused. A second migration aligns SQL domain/name normalization for tracking queries and uppercase accents, rebuilding its existing expression indexes.

Private ratings, notes, commercial statuses and follow-up dates are available only through the authenticated operator workspace. Existing RLS remains enabled; no anon/authenticated policies are added. The security advisor's informational “RLS enabled, no policy” notices reflect this default-deny architecture.

## Security boundary

The dashboard and read APIs require an operator session when WSE_OPERATOR_KEY is configured; until then existing read APIs retain their prior public access. New workspace controls always require an operator session. Server APIs use the service role; RLS is not user authentication. Protect the deployment if the data should be private. Origin checks block cross-site browser POSTs; they do not authenticate direct clients. Rate and concurrency limits bound spending but cannot establish user identity.

Research only fetches the fixed Brave HTTPS endpoint, never a candidate URL. Redirects are forbidden; provider responses capped at 512 KB, database responses at 1.5 MB; explicit timeouts and allowed methods apply. No SQL/URL proxy, secrets in client assets, raw upstream errors or stack traces. Untrusted text uses DOM/textContent and validated HTTP(S) source links. A future crawler requires DNS/private-IP validation and redirect revalidation before fetching websites.

## Local development and tests

Node 22+; no dependencies to install:

```
node --test tests/*.test.mjs
node --env-file=.env.local scripts/dev.mjs
```

Open http://127.0.0.1:3000. The local server exposes exact route/asset allowlists. Run without .env.local to inspect missing-configuration states.

Automated checks cover discovery, classification, trust, recency boundaries, contacts, score completeness, all recommendation branches, API validation/failure/timeout, safe rendering, filters, search lifecycle and drawer behavior. `tests/database.sql` is rollback-only and verifies imports, deduplication, preservation, cache/bypass, freshness, search links, failure atomicity and private permissions. Run it on a development database after migrations and when admission limits permit it; it leaves no fixture records.

## Production verification

1. Confirm Vercel deployed the latest main commit.
2. Open `/api/companies`, `/api/signals`, `/api/searches`; check success and real records.
3. Open a dossier: distinguish original stored scores from current research confidence, coverage and timing. Check sources and contact labels.
4. Filter/sort the pipeline and inspect a previous search's quality details.
5. Submit Belgium / Importer / Distributor / Wine + Armagnac. Missing provider must yield an honest persisted failure. With Brave configured, expect evidence-backed imports or a legitimate zero-result completion.
6. Repeat a completed search within six hours: same cached search, no provider spend. Fresh research bypasses cache. Replaying an executed request UUID must not re-import.
7. Confirm related companies, profile freshness, contacts and signals; validate mobile layout, console, invalid inputs, unsupported methods and safe source links.

## Next

Use bounded campaigns on the four supported markets and review evidence quality with Gensac commercial feedback. Durable jobs, crawling, richer language extraction, CRM/outreach, billing and tenancy remain future work.

## Companies compatibility fix (2026-09-25)

The existing dashboard already fetches `/api/companies`; no demo fallback is used.
The route now supports the original `companies` columns without requiring research
columns or the contacts relationship: recognized missing-schema errors retry once
using only the original allowlisted fields. Other failures remain errors. Stored
scores are used when no research evidence exists; nulls stay null in JSON and are
shown as Unknown in company rows. Research with evidence retains its existing
assessment logic. Reloading clears the filter cache, and stale requests cannot
replace newer results. No scoring rules or database records are changed.

Vercel: keep the existing vanilla/static project rooted at this repository, with
Node 22+ and `api/` functions; no build command or frontend Supabase dependency is
needed. Keep `SUPABASE_URL` and `SUPABASE_SECRET_KEY` server-side. Production-only
variables are not available in Preview: configure the matching Preview environment
if testing a branch deployment, then redeploy. Never copy the key into this README
or into client files. See [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js)
and [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

Targeted checks (no new prospect research or scoring calibration):

```
node --test tests/companies.test.mjs tests/dashboard.test.mjs tests/intelligence-ui.test.mjs tests/company.test.mjs tests/signals.test.mjs tests/search-ui.test.mjs
```

Infrastructure verification on 2026-09-25: the supplied project
`elpazsfbzljmiplazrmg` was resumed from INACTIVE. An early catalog query during
restoration showed no public tables; after restoration completed, all seven
application tables and the search RPC functions were present. No database rebuild
or data recovery is needed. The production domain is
https://wine-sales-engine.vercel.app (individual deployment URLs require Vercel
SSO). The production companies API returned 10 stored companies, and the search
history API confirmed the existing Brave provider configuration.

Search reliability: provider progress stays in memory during discovery and is
persisted with final qualification (or sanitized failure metrics). This avoids
one database round trip before every web query. Transient connection failures on
GET and assignment-only PATCH requests retry once within the existing search
deadline. POST transaction RPCs and HTTP errors are never automatically replayed.
