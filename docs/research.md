# Commercial intelligence v2

The rules produce an inspectable commercial assessment from sourced excerpts. They are not an LLM, an independent company-registry verification, a probability of purchase or a revenue estimate. Source snippets can be stale or misattributed; user review is still needed before outreach.

## Provider and query contract

`discover(input, signal, onProgress)` returns `{results, metrics}`. Results use Brave's `url`, `title`, `description`, `extra_snippets` fields. Raw provider bodies never leave the backend. The development evidence-file adapter accepts these records (or the earlier name/website/quote shape), max 70, only outside Vercel and production.

Five deterministic discovery queries are built from market, target and product in `queries.js`:

1. Market + products + buyer channel.
2. Same, with French producers / portfolio.
3. Same, with HORECA / wholesale / new suppliers.
4. French producer/catalogue terms for Belgium, France and Switzerland; purchasing terms in English for the UK.
5. Dutch import/groothandel terms for Belgium, German import/sortiment terms for Switzerland, French supplier terms for France, English new-brand terms for the UK.

At most two accepted domains receive a `site:domain` follow-up for portfolio, new producers, purchasing, owners and contact information. No arbitrary website is fetched. Hard limits: seven Brave calls, ten results per call, 70 raw results, 20 accepted companies, 12 pages per company and 1,600 characters per page excerpt. Stop discovery early if 20 candidates already qualify. Provider calls have five-second timeouts within the existing 35-second search budget. A failed provider call fails the run; partial discovery is not presented as completed.

Official contract: https://api-dashboard.search.brave.com/api-reference/web/search/get

## Identity, clustering and rejection

URLs are validated for HTTP(S), public-looking hostnames, no credentials, IP literals, local names, whitespace or nonstandard ports. These checks are not a crawler SSRF defence: the only actual external fetch goes to the fixed Brave HTTPS origin with redirects forbidden.

Duplicate URL results are counted before domain clustering. Company identity requires a homepage (or language homepage) title whose company name occurs in its own excerpt. Generic headings and list titles are rejected. Same-domain portfolio/contact/news pages can then contribute evidence. A search result's country bias, domain suffix, shipping destinations and French product origin never establish company location.

Verification requires explicit geographic wording and a supported buyer channel. Producers without import/distribution activity are excluded. Unsupported names, wrong geography, irrelevant activity, unsupported type, weak business relevance, unsafe URLs, duplicates and candidate-limit overflow have aggregate counters. Counts distinguish raw provider records from company candidates; they do not describe an exhaustive web search.

## Source tiers

| Tier | Current recognition | Quality multiplier |
|---|---|---|
| A | Exact company website domain; path labels portfolio, news or contact | 1.00 |
| B | Explicit allowlist: Decanter, The Drinks Business, Drinks International, ProWein, Wine Paris | 0.80 |
| C | Known directory domains: Europages, Kompass, Yelp | 0.40 |
| D | Unknown external source or unsafe URL | 0.20 / 0 |

Tier A means first-party, not independently audited. LinkedIn profiles, partner relationships and registries are not automatically labelled official. Unrecognized partners remain external until attribution is verified. Discovery currently verifies first-party domains; B/C/D support is chiefly useful for existing stored evidence and future adapters. B sources do not independently create a company identity. C/D claims cannot establish fit/capacity/geography or headline intent.

Evidence records retain quote, URL, source type, tier, quality, confidence, claim type and date when explicitly available. Extracted snippets have evidence confidence 80; pre-existing sourced summaries have 60 and are visibly labelled legacy. Confidence is a deterministic evidence-strength indicator, not a statistically calibrated probability.

## Classification and portfolio rules

Classification recognizes Importer, Distributor, combined Importer / Distributor, Wholesaler, HORECA Supplier, Restaurant Group, Retail Chain, E-commerce retailer, Agent / Broker, Premium Caviste, Wine Merchant, Spirits Specialist, Restaurant, Producer / competitor and Unknown. Affirmative explicit terms are required. Obvious negated sentences are excluded. Classification is lexical; ambiguous entities should be researched further.

Wine fit: explicit wine range starts at 55; French producers +20, independent estates/direct import +10, premium +5, organic/biodynamic +5, cap 95. Organic positioning alone never establishes commercial opportunity.

Armagnac fit: explicitly listed Armagnac 90; Cognac/calvados plus spirits 60; generic spirits 35; absent evidence null. Adjacent category fit is labelled as such and never claims Armagnac demand. Product focus selects the relevant fit; Wine + Armagnac uses the maximum supported fit.

Commercial potential requires import or B2B/wholesale evidence: base 45, wholesale/HORECA +15, import capability +10, national footprint +10, logistics/professional delivery +10, explicit scale +5, cap 95. No revenue, staff count, store count or warehouse is invented. A scale indicator requires a quoted numerical count (at least 10 stores or 100 wines/brands).

Premium/capacity: premium language 60, scale-only 60, both 80. Channel relevance: core import/distribution/wholesale/HORECA 90, restaurant 45, other recognized channels 65, producer-only 0, unknown null. Geography: explicit location in the requested market 100, otherwise null.

## Signals and time decay

| Type | Base strength |
|---|---:|
| Explicit supplier search / brands wanted | 100 |
| Adding new producers | 95 |
| Portfolio/category expansion | 90 |
| Purchasing role hiring | 90 |
| Store/cellar/warehouse or market/channel expansion | 80 |
| Catalogue refresh | 65 |
| Professional event | 60 |
| Digital/B2B expansion | 50 |
| Individual product announcement | 35 |

`current strength = round(base × recency × source quality × evidence confidence)`.

Recency: 0–30 days 1.00; 31–90 .90; 91–180 .65; 181–365 .35; older .10. Undated, invalid and future events have null current strength and no recent flag. Dates require ISO YYYY-MM-DD or an explicit day/month/year in English/French in the same sentence as the event. Search indexing dates are never treated as event dates. Legacy stored signal dates are retained as previously recorded, with reduced evidence confidence.

Buying intent is the maximum supported dated event from an A/B source. “Strong recent” requires age ≤90 days and current strength ≥45. New-brand openness uses the maximum decayed supplier/new-producer/portfolio event. Generic wholesale activity affects commercial potential, never timing. Individual product announcements are weak; frequency is not fabricated from a single announcement. Old records remain in signals and the dossier's collapsed archive.

The live signals panel ranks current timing strength across the newest 200 stored signal records and shows up to six. Its exact database count excludes research/scoring audit records. Legacy signal confidence is conservatively 60 in this panel; the dossier evaluates its latest evidence profile. This bounded panel is not an exhaustive ranking of every historical signal.

## Contacts and accessibility

Extraction accepts an explicit `Full Name, role` sentence on a first-party source. Name and exact role are kept; public email, international phone or LinkedIn URL must appear in that same sentence. Emails are never generated from name patterns. Existing sourced contacts can be ranked without being re-extracted. Unknown roles are shown as stored records but not promoted as decision makers.

Role priority = 55% role relevance + 30% evidence confidence + 15% contactability. A distributor/wholesaler/chain with capacity ≥75 favors buyer/purchasing/portfolio/category roles (100 vs owner/management 75); other companies favor owner/management (95 vs buyer 85). Professional/HORECA contacts have relevance 55 and are not automatically decision makers. This is an explicit capacity proxy, not an invented company-size fact.

Contactability: published direct email 100; phone/LinkedIn 70; generic email 45; named only 20. Known generic local parts include info, contact, hello, office, sales, commercial and orders. Stored contact confidence is reduced by source quality. Duplicate names retain the highest-priority supported record. A preferred contact requires confidence ≥60 and priority ≥60.

Accessibility: decision maker + direct email 90; named contact + public route 65; supported name only 40; generic first-party contact information 25; missing evidence null. No named buyer is invented for a contact form.

## Opportunity, coverage and confidence

Weights: commercial potential 20%, product fit 15%, premium/capacity 10%, channel 10%, new-brand openness 10%, buying intent 20%, accessibility 10%, geography 5%.

For each known dimension, confidence is the mean of cited claim confidence × source quality. Coverage is the sum of weights for known dimensions. Overall confidence is the sum of weight × dimension confidence divided by 100 (missing evidence reduces it).

Opportunity is the confidence-weighted mean of known dimensions: `sum(value × weight × confidence) / sum(weight × confidence)`, rounded. A headline score requires at least 50% coverage plus known commercial potential and product fit. Missing values remain null, and all scores are bounded 0–100. A partial score must always be shown with confidence and coverage.

The research assessment is computed from the same latest evidence profile for list and dossier. It changes as signals age. Legacy/stored company scores remain untouched and are separately visible in the dossier. New imports can fill missing legacy score fields, but v2 UI uses the current research assessment. The latest profile is a bounded research snapshot; historical sources remain in append-only signals and the archive.

## Actions and explanations

- Low priority: score <40 with coverage ≥60.
- Qualify first: unknown score, confidence <50 or coverage <60.
- Contact now: score ≥70, intent ≥60, strong recent evidence, accessibility ≥65 and a decision maker with confidence ≥70.
- Contact this week: score ≥65, intent ≥45 and strong recent evidence, when Contact now criteria fail.
- Monitor: adequate evidence/fit but no strong recent signal.
- Otherwise qualify first.

Each recommendation returns an action, urgency and rationale. Positive factors link to the matched claim's source. Gaps expose absent dimensions, unclear Armagnac fit, missing direct buyer email, stale events and legacy evidence. Why now cites at most three strong recent events; otherwise it explicitly says none were detected.

## Persistence, cache, freshness and private feedback

`research_profile` stores the latest bounded evidence snapshot; `last_researched_at` is set only by an accepted import, not by opening the dashboard or migrating legacy data. `last_signal_at`, current scores/confidence and contact priority are derived rather than duplicated in schema. `search_companies` links actual imported/matched companies to searches.

The service-only import function serializes pipeline writes, matches canonical domain first and normalized name + country only when a domain is absent, preserves populated company fields/contacts, deduplicates signal identity and commits the entire import with completion. Failures roll back profiles, links, companies, contacts and signals together.

Completed v2 searches with identical market/type/product are reused for six hours. Cache returns the existing search ID and date, makes no provider call and performs no import. `refresh:true` bypasses cache while preserving request-ID replay for executed searches. Failed searches never cache. One active run and ten new runs/hour remain global limits: worst-case 70 provider calls/hour. Cache does not reset freshness or pretend to be a fresh search.

Search metrics expose raw/unique/verified/accepted/rejected counts, contact/signal/scored totals, provider request count, duration and aggregate rejection reasons. Search detail links to accepted companies. No raw provider diagnostics, API keys or URL list of rejected candidates is exposed. Safe structured logs contain IDs, stages, counts and timing.

`company_reviews` is a private foundation for rating 1–5, note (2,000 characters), commercial status and review timestamp. It has RLS, no public grants/policies, no browser writes and no public feedback API. Authenticated role/workspace authorization must be designed before enabling editing. Private notes are excluded from public read endpoints.

## Remaining limitations

No crawler, independent registry verification, official LinkedIn/partner resolution, semantic entity disambiguation, score learning or background worker. Local/legacy evidence can be displayed without provider credentials; real discovery requires a configured Brave key. The initial extraction favors explicit EN/FR terms, with some Dutch/German classification/location terms. Neither title parsing nor negation detection is complete natural-language understanding. Review source claims and contact attribution before commercial use.
