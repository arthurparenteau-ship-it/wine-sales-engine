# Wine Sales Engine — autonomous workspace

## What this release adds

- Daily research campaigns rotating Belgium, France, United Kingdom and Switzerland.
- Finite run budgets (1–60), maximum one scheduled attempt/day across campaigns, maximum ten campaign attempts/day including manual runs; each research run makes at most seven Brave queries.
- Persistent run history, global claim lock, request identifiers, interruption recovery, three-failure pause and completion when the budget is consumed.
- Priorities: due follow-ups, explicit human priority, then existing opportunity assessment. Customer and Not Relevant accounts are excluded from this list.
- French/English approach drafts grounded in the dossier; a cautious request to identify the buyer when unknown. Sources are shown for review. No sending integration exists.
- Private commercial status, note, priority rating and follow-up date; formula-safe company CSV export.
- Operator access with an eight-hour signed HttpOnly, SameSite=Strict cookie, Secure in production. The browser never stores the operator key or Supabase secret. Rotating the operator key revokes all sessions.

## Activate on the existing Vercel project

1. Apply `supabase/migrations/20260925081338_autonomous_workspace.sql` once to the existing Supabase project. It adds two tables, two service-role-only RPCs and a nullable follow-up date. It does not change existing scores or evidence. Back up as part of your normal release process.
2. In Vercel > wine-sales-engine > Environment Variables, add two independent random secrets of at least 32 characters, Production only: `WSE_OPERATOR_KEY` (operator login) and `CRON_SECRET` (scheduler authentication). Use a password manager and retain the operator key there. Never put either value into the repository, chat or frontend. Existing SUPABASE and BRAVE variables remain as configured.
3. Deploy this release. Vercel will register `/api/cron` for 07:00 UTC daily. On the current Hobby plan the invocation may occur within the hour; UTC does not follow French daylight-saving changes. It only runs in Production. The route fails closed without the cron secret.
4. Open the production domain, click Operator access, and enter the operator key. Once that key is configured, all existing data/search APIs also require the operator session. The cron worker has an internal server-only entry point into the same pipeline.
5. Create “Gensac · European buyers”, select all four markets, Importer / Distributor, Wine + Armagnac and 12 runs. It starts paused. Run the next segment once to inspect the result, then activate the daily schedule. Twelve runs cover three passes over the four markets.
6. Create additional paused campaigns for Premium Caviste or Spirits Buyer if needed. The scheduler selects the oldest due active campaign; one scheduled segment total per day prevents unbounded parallel spending.

## Daily use

Review Today’s priorities. Open a company, inspect current evidence and gaps, then Prepare approach. Edit and copy the draft only after reviewing it. Save your commercial status and a follow-up date. The date becomes a priority in the workspace when due; it does not send an email or calendar reminder.

A paused campaign may still be run manually by an authenticated operator. Run count is an attempt budget, not a guaranteed count of successful searches or new prospects. Existing search cache may reuse a completion within six hours. A result with zero new companies can still be correct: duplicates are matched to existing records.

## Operational boundaries

This is a single-estate operator workspace, not a multi-tenant SaaS. Anyone with the shared operator key has the same permissions. There are no individual accounts, role administration, automatic email, inbox/CRM synchronization, LLM generation, or document catalogue. Drafts are evidence-guided templates, not model-generated prose. User-edited draft text is copied from the dossier and is not automatically saved or sent; private notes are saved in Supabase.

Autonomy executes one bounded search per daily invocation, not continuous crawling. Contact extraction and buying signals depend on available sources and may stay Unknown. Evidence rules are unchanged and are not calibrated purchase probabilities. The latest 1,000 private reviews and 50 campaigns are loaded; this is designed for the current MVP, not an unbounded CRM.

If a function is interrupted, the next claim reconciles it against the search record after three minutes. It never blindly replays an ambiguous import. Repeated scheduled failures pause that campaign after three attempts. Inspect history; fix provider/configuration errors before reactivation. Rotating CRON_SECRET requires a redeploy. Pause all active campaigns to stop future research; an already running request finishes within its bounded timeout.

## Validation

```
node --test tests/autonomy.test.mjs tests/workspace-ui.test.mjs tests/companies.test.mjs tests/company.test.mjs tests/dashboard.test.mjs tests/db.test.mjs tests/search.test.mjs tests/search-ui.test.mjs tests/signals.test.mjs tests/intelligence-ui.test.mjs
```

Migration and lifecycle invariants were also exercised on isolated embedded PostgreSQL: rotation, concurrent-claim guard, finite budget, idempotent completion, failure pause, once-per-day scheduling, interrupted-worker recovery and service-role-only access. Browser QA used a local-only adapter, separate from live research and never deployed.

Sources: [Vercel cron authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Supabase API key security](https://supabase.com/docs/guides/getting-started/api-keys).
