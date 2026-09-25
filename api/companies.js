import {analyse,summary} from '../lib/intelligence/analyse.js';
import {boundedJSON} from '../lib/http.js';
// Only fields used by this dashboard are exposed by this public, read-only route.
const fields = ['id', 'name', 'country', 'city', 'company_type', 'description',
  'buying_intent', 'opportunity_score', 'website', 'wine_fit', 'armagnac_fit',
  'commercial_potential', 'accessibility', 'created_at', 'updated_at'];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const fail = (status, code, message) => res.status(status).json({
    success: false, error: { code, message }
  });
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return fail(405, 'METHOD_NOT_ALLOWED', 'Use GET to retrieve companies.');
  }

  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  let base;
  try {
    base = new URL(process.env.SUPABASE_URL?.trim());
    if (base.protocol !== 'https:' || base.username || base.password ||
        base.pathname !== '/' || base.search || base.hash ||
        !key?.startsWith('sb_secret_') || /\s/.test(key)) throw new Error();
  } catch {
    return fail(500, 'CONFIGURATION_ERROR', 'Check server SUPABASE_URL and SUPABASE_SECRET_KEY configuration.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const companies = [];
    let enriched = true;
    // Page explicitly: Supabase's default row limit must not silently hide companies.
    for (;;) {
      const url = new URL('/rest/v1/companies', base);
      url.searchParams.set('select', (enriched
        ? [...fields, 'last_researched_at', 'research_profile', 'contacts(full_name,job_title,email,phone,linkedin_url,confidence,source)']
        : fields).join(','));
      if (enriched) url.searchParams.set('contacts.limit', '20');
      url.searchParams.set('order', 'id.asc');
      url.searchParams.set('limit', '10');
      url.searchParams.set('offset', String(companies.length));
      const response = await fetch(url, {
        headers: { apikey: key, Accept: 'application/json' },
        signal: controller.signal,
        redirect: 'error'
      });
      if (!response.ok) {
        // Missing optional research columns/relationship must not block the MVP schema.
        // Inspect only the error code; never log or return upstream error details.
        if (enriched && [400, 404].includes(response.status)) {
          const error = await boundedJSON(response, 16000);
          if (['42703', 'PGRST200', 'PGRST204', 'PGRST205'].includes(error?.code)) {
            enriched = false;
            companies.length = 0;
            continue;
          }
        }
        return fail(502, response.status === 401 || response.status === 403
          ? 'SUPABASE_ACCESS_ERROR' : 'SUPABASE_QUERY_ERROR',
        response.status === 401 || response.status === 403
          ? 'Database access failed. Check the deployed project URL, secret key and table permissions.'
          : 'Unable to retrieve companies from the database.');
      }
      const rows = await boundedJSON(response, 1500000);
      if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
        return fail(502, 'INVALID_DATABASE_RESPONSE', 'The database returned an unexpected response.');
      }
      if (!rows.length) break;
      companies.push(...rows.map(row => {
        const company = Object.fromEntries(fields.map(field => [field, row[field] ?? null]));
        // Stored MVP scores remain usable until research evidence actually exists.
        if (enriched && Array.isArray(row.research_profile?.evidence) && row.research_profile.evidence.length) {
          company.intelligence = summary(analyse(row, Array.isArray(row.contacts) ? row.contacts : []));
        }
        return company;
      }));
    }
    return res.status(200).json({ success: true, count: companies.length, companies });
  } catch {
    return fail(controller.signal.aborted ? 504 : 502,
      controller.signal.aborted ? 'DATABASE_TIMEOUT' : 'DATABASE_UNAVAILABLE',
      'Unable to load companies right now. Please try again.');
  } finally {
    controller.abort();
    clearTimeout(timer);
  }
}
