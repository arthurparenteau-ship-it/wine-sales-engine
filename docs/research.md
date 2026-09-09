# Evidence pipeline v1

## Provider contract

A server adapter exposes `name` and `discover(input, AbortSignal)`, returning at most 20 candidates. Each candidate supplies name, website, source_url, and quote (verbatim public-source excerpt, max 6,000 characters). Optional city, contacts[] and events[] are evidence proposals, never trusted facts. No browser request can supply candidates or choose a source file/URL.

A contact proposal has full_name, job_title, source and optionally email, phone, linkedin_url. A dated event has type and ISO date. The evidence-file adapter reads a developer-supplied JSON array; it has no built-in/demo results and cannot run in Vercel. Local unit tests contain clearly labelled synthetic fixtures only.

The Brave adapter makes one Web Search request with market/type/product and country bias, count 20 and extra snippets. It uses root-page results only, strips search highlighting tags, derives a name from the first title segment and requires that name in the excerpt. It does not treat titles, result ranking or country bias as evidence of company relevance. It extracts only explicit “Full Name, job title” contacts (with email in that sentence) and ISO-dated event sentences. No guessed emails, private profiles, or LLM output are used. Unsupported results are rejected, so coverage is deliberately limited. Search snippets may be stale or incorrectly attributed; human review remains appropriate before outreach.

Official Brave API: https://api-dashboard.search.brave.com/api-reference/web/search/get

## Acceptance

- Valid public-looking HTTP(S) website and citation on the same canonical domain.
- Non-generic name occurring in excerpt, max 160 characters.
- Explicit location language (based/located in the market, or a country adjective tied to a buyer channel), target category terms and wine/spirits relevance in non-negated sentences.
- Wine-only searches require wine terms; Armagnac-only requires Armagnac; combined focus accepts either.
- Optional city only if it occurs in the excerpt.
- Country requires explicit location wording, not a TLD, search query, shipping destination or product origin. Premium Caviste also requires a premium-positioning phrase. Spirits Buyer requires an explicit buying/import/wholesale channel. These lexical checks are conservative, not independent corporate-registry verification.
- Contact name and relevant job title must occur together in a sentence, source domain must match, and optional contact details must be literally present in that same sentence. Confidence 70 denotes excerpt-backed, not independently contacted/confirmed.
- Events require an exact ISO date and supported event phrase in the same non-negated sentence. Future/invalid dates rejected. Undated activity never becomes recent intent.

## Exact scoring rules

Rule version: evidence-v1. Input date is explicit for reproducible recency tests.

| Stored dimension | Evidence rule |
|---|---|
| wine_fit | Wine/vin/wijn term in accepted affirmative excerpt → 70; otherwise null |
| armagnac_fit | Armagnac term → 80; otherwise null |
| commercial_potential | Explicit wholesale/import/distribution/HORECA term → 70; otherwise null. This is a channel proxy, not claimed revenue/capacity. |
| buying_intent | Highest supported dated event strength; absent evidence → null |
| accessibility | Verified named contact with public email/phone → 80; named relevant contact only → 50; otherwise null |
| opportunity_score | 40% commercial + 30% product fit + 20% buying intent + 10% accessibility, rounded; only if every dimension is known |

Product fit uses wine_fit for Wine, armagnac_fit for Armagnac, maximum known fit for Wine + Armagnac (either product is commercially relevant). Null is never silently replaced by zero or an average. Scores remain 0–100. We deliberately omit speculative premium/new-brand openness/geography/bio weights until reliable structured evidence is available.

Event strengths within 180 days: new_producers 90, portfolio_expansion 80, business_expansion 75, buyer_hiring 70, professional_event 60. At 181–365 days halve and round; older events keep their source/date but have null strength and contribute no intent. Generic wholesale activity affects only commercial_potential, not buying_intent.

Signals store source_url and the supporting excerpt. research_evidence preserves source text; scoring_evidence stores version, as-of date, product focus, dimensions/weights and calculated values. These audit records have null signal_date/strength and are excluded from the live buying-signals count. The as-of date is observation/calculation time, never presented as the source's publication date.

Existing populated company values—including test/reviewed scores—are never overwritten by automated candidates. Missing values may be filled. Therefore scoring_evidence describes the candidate calculation and may differ from the preserved company score; the UI/notes identify that distinction.

## Dedup and persistence

Within a batch, same canonical domain merges (longer quoted evidence wins). Database imports take a project transaction lock and prefer existing domain. Fallback uses normalized name/country only when a domain is absent. Different known domains are not silently merged on name alone. No destructive merge/deletion is performed. This guarantees dedup among pipeline writes, not arbitrary concurrent external/manual writes.

Missing company fields are filled; populated values are preserved. Signals dedup on company/type/source/description/date. Contacts dedup on normalized name within company; existing contacts are preserved for manual review. Scoring evidence includes as-of day, so later-day research can add a new dated calculation audit without claiming a new buying event.

Successful import + search completion is atomic. Failure rolls back the entire import. An HTTP timeout after commit is reconciled by reading stored completion before reporting failure. Search diagnostics: discovered, verified, qualified, rejected, batch deduplicated, existing matched, inserted, updated. Counts describe candidates returned by the adapter, not an exhaustive count of the web.

## Limits and next adapter improvements

One provider request, 20 candidates, 35-second workflow budget, 512 KB provider response, first-party root pages, conservative multilingual keyword/identity extraction. Broad site crawling, entity resolution, public-contact attribution across separate pages and semantic fact verification are intentionally not claimed. Implement a new adapter behind the same contract when richer evidence is available; do not relax evidence gates to increase apparent results.
