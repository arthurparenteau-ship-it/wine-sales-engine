const signalFields = ['id', 'company_id', 'signal_type', 'description', 'signal_date', 'source_url', 'strength', 'created_at'];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const fail = (status, code, message) => res.status(status).json({ success: false, error: { code, message } });

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return fail(405, 'METHOD_NOT_ALLOWED', 'Use GET to retrieve signals.');
  }

  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  let base;
  try {
    base = new URL(process.env.SUPABASE_URL?.trim());
    if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' ||
        base.search || base.hash || !key?.startsWith('sb_secret_') || /\s/.test(key)) throw new Error();
  } catch {
    return fail(500, 'CONFIGURATION_ERROR', 'Check server SUPABASE_URL and SUPABASE_SECRET_KEY configuration.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const signalUrl = new URL('/rest/v1/signals', base);
    signalUrl.searchParams.set('select', signalFields.join(','));
    signalUrl.searchParams.set('order', 'strength.desc');
    signalUrl.searchParams.set('limit', '50');

    const companyUrl = new URL('/rest/v1/companies', base);
    companyUrl.searchParams.set('select', 'id,name');
    companyUrl.searchParams.set('limit', '500');

    const headers = { apikey: key, Accept: 'application/json' };
    const [signalResponse, companyResponse] = await Promise.all([
      fetch(signalUrl, { headers, signal: controller.signal, redirect: 'error' }),
      fetch(companyUrl, { headers, signal: controller.signal, redirect: 'error' })
    ]);

    if (!signalResponse.ok || !companyResponse.ok) {
      console.error('Signals query failed', { signals: signalResponse.status, companies: companyResponse.status });
      return fail(502, 'SUPABASE_QUERY_ERROR', 'Unable to retrieve buying signals from the database.');
    }

    const [signalRows, companyRows] = await Promise.all([signalResponse.json(), companyResponse.json()]);
    if (!Array.isArray(signalRows) || !Array.isArray(companyRows)) {
      return fail(502, 'INVALID_DATABASE_RESPONSE', 'The database returned an unexpected response.');
    }

    const companyNames = new Map(companyRows.map(row => [row.id, row.name ?? null]));
    const signals = signalRows.map(row => ({
      id: row.id ?? null,
      company_id: row.company_id ?? null,
      company_name: companyNames.get(row.company_id) ?? null,
      signal_type: row.signal_type ?? null,
      description: row.description ?? null,
      signal_date: row.signal_date ?? null,
      source_url: row.source_url ?? null,
      strength: row.strength ?? null,
      created_at: row.created_at ?? null
    }));

    return res.status(200).json({ success: true, count: signals.length, signals });
  } catch {
    return fail(controller.signal.aborted ? 504 : 502,
      controller.signal.aborted ? 'DATABASE_TIMEOUT' : 'DATABASE_UNAVAILABLE',
      'Unable to load buying signals right now. Please try again.');
  } finally {
    clearTimeout(timer);
  }
}
