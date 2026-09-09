# Wine Sales Engine

Vanilla HTML/CSS/JavaScript dashboard with a Vercel Node.js function reading existing Supabase companies. No build step, runtime dependencies, schema changes, or AI processing.

## Architecture

Browser → GET /api/companies → Supabase REST /rest/v1/companies.

`api/companies.js` uses Vercel's default-export `(req, res)` handler. The server sends the modern secret key only in `apikey`, never as a JWT bearer token. The original handler already used this header correctly; an earlier "Invalid API key" cannot be diagnosed from source alone.

The route allows GET only, validates configuration, uses an eight-second overall database timeout, disables redirects and caching, pages through rows in ID order, and returns safe JSON errors without upstream bodies or exception details. Multiple page reads are not a transactional snapshot if records change during loading.

Success: `{ "success": true, "count": 0, "companies": [] }`.
Failure: `{ "success": false, "error": { "code": "...", "message": "..." } }` with HTTP 405, 500 (configuration), 502 (database), or 504 (timeout).

The public response includes only existing dashboard fields: id, name, country, city, company_type, description, buying_intent, opportunity_score. No contacts, outreach, or other tables are queried. The dashboard displays stored scores without calculating a new prioritization model; missing scores remain unknown. Demo companies, signals and totals have been removed. Research controls remain explicitly unavailable.

## Vercel / Supabase configuration

- Repository root must be the Vercel Root Directory, with framework preset Other and no framework build step. Root `api/companies.js` must be deployed as a Node.js function, not exported as a static asset.
- Set `SUPABASE_URL` to the HTTPS project origin and `SUPABASE_SECRET_KEY` to an active `sb_secret_` key from that same project. Values must not have surrounding quotes. Leading/trailing whitespace is trimmed.
- Production variables only apply to Production. Configure Preview/Development separately if those environments need database access. Redeploy after changing environment values.
- Confirm the Supabase Data API is enabled, `public.companies` is exposed, and the server role can select its existing columns. No schema changes or weakened RLS policies are required.
- For `SUPABASE_ACCESS_ERROR`, check the matching URL/key, whether the key was revoked, environment scope, and a fresh deployment. Server logs include only upstream HTTP status.
- Keep secrets in Vercel or a local ignored environment file, never in frontend files. `.env*`, `.vercel`, and dependencies are ignored.

## Security boundary

Authentication is deliberately out of scope. This endpoint is public and reads with elevated server privileges that bypass RLS; anyone able to reach it can read the listed company fields. Do not assume RLS protects these returned fields. Use deployment access protection if the current company data must remain private. No writes or caller-supplied database queries are accepted. Database text is rendered using DOM textContent to prevent HTML/script injection.

## Checks and verification

Run with a modern Node.js installation:

```
node --check api/companies.js
node --check app.js
node --test tests/*.test.mjs
```

Tests mock Supabase and need no credentials. To exercise Vercel routing locally, use `vercel dev` with locally configured server variables; a static file server cannot execute `/api/companies`.

After deploying:
1. Visit `https://YOUR-DEPLOYMENT/api/companies`. Expect HTTP 200 and the success envelope with actual companies or an empty array.
2. Open the dashboard and inspect Network: it should fetch only the same-origin companies endpoint, without Supabase credentials. Verify row count and stored scores against Supabase.
3. An empty table should show the empty state. Block the API request in browser devtools and reload to verify error/Retry; unblock and retry to recover.
4. Check mobile layout, and ensure missing scores appear as a dash rather than zero.

Live credentials and deployment settings are not included in this repository; mocked tests do not verify production connectivity.

References: https://supabase.com/docs/guides/getting-started/api-keys and https://vercel.com/docs/functions/runtimes/node-js
