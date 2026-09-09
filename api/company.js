import {boundedJSON} from '../lib/http.js';
// Only fields used by this dashboard are exposed by this public, read-only route.
const companyFields = ['id', 'name', 'country', 'city', 'company_type', 'description',
  'website', 'buying_intent', 'opportunity_score', 'commercial_potential', 'wine_fit', 'armagnac_fit', 'accessibility'];
const contactFields = ['full_name', 'job_title', 'email', 'phone', 'linkedin_url', 'confidence', 'source'];
const signalFields = ['signal_type', 'description', 'signal_date', 'strength', 'source_url'];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const fail = (status, code, message) => res.status(status).json({
    success: false, error: { code, message }
  });
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return fail(405, 'METHOD_NOT_ALLOWED', 'Use GET to retrieve companies.');
  }

  const id = req.query?.id;
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return fail(400, 'INVALID_COMPANY_ID', 'Provide a valid company ID.');
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
    async function readRows(table, fields, filter, single = false) {
      const result = [];
      for (;;) {
        const url = new URL(`/rest/v1/${table}`, base);
        url.searchParams.set('select', fields.join(','));
        url.searchParams.set(filter, `eq.${id}`);
        url.searchParams.set('order', 'id.asc');
        url.searchParams.set('limit', single ? '1' : '50');
        url.searchParams.set('offset', String(result.length));
        const response = await fetch(url, {
          headers: { apikey: key, Accept: 'application/json' },
          signal: controller.signal, redirect: 'error'
        });
        if (!response.ok) throw new Error('Database query failed');
        const rows = await boundedJSON(response, 1500000);
        if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
          throw new Error('Invalid database response');
        }
        result.push(...rows.map(row => Object.fromEntries(fields.map(field => [field, row[field] ?? null]))));
        if (single || !rows.length) return result;
      }
    }
    const [company] = await readRows('companies', companyFields, 'id', true);
    if (!company) return fail(404, 'COMPANY_NOT_FOUND', 'Company not found.');
    const [contacts, signals] = await Promise.all([
      readRows('contacts', contactFields, 'company_id'),
      readRows('signals', signalFields, 'company_id')
    ]);
    return res.status(200).json({ success: true, company, contacts, signals });
  } catch {
    return fail(controller.signal.aborted ? 504 : 502,
      controller.signal.aborted ? 'DATABASE_TIMEOUT' : 'DATABASE_UNAVAILABLE',
      'Unable to load companies right now. Please try again.');
  } finally {
    controller.abort();
    clearTimeout(timer);
  }
}
