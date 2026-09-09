const container = document.getElementById('prospects');
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const scoreValue = value => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
};
function updateStats(companies) {
  const scores = companies?.map(c => scoreValue(c.opportunity_score)).filter(s => s !== null) ?? [];
  document.getElementById('trackedCount').textContent = companies ? companies.length : '—';
  document.getElementById('scoredCount').textContent = companies ? scores.length : '—';
  document.getElementById('averageScore').textContent = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : '—';
  const markets = new Set(companies?.map(c => c.country).filter(Boolean));
  document.getElementById('marketCount').textContent = companies
    ? `Across ${markets.size} recorded markets` : 'Waiting for companies';
}
function renderCompanies(companies) {
  container.replaceChildren();
  if (!companies.length) {
    container.append(element('p', 'data-state', 'No companies yet. Add companies in Supabase to see them here.'));
    return;
  }
  const fragment = document.createDocumentFragment();
  companies.forEach(company => {
    const row = element('div', 'prospect');
    const info = element('div', '');
    info.append(element('div', 'company', company.name || 'Unnamed company'));
    info.append(element('div', 'meta', [company.company_type, company.city, company.country].filter(Boolean).join(' · ') || 'Details not provided'));
    if (company.description) info.append(element('div', 'meta', company.description));
    const score = element('div', 'score', scoreValue(company.opportunity_score) ?? '—');
    score.append(element('small', '', 'OPPORTUNITY'));
    const intent = element('div', 'hide-mobile');
    const value = scoreValue(company.buying_intent);
    intent.append(element('span', 'badge', value === null ? 'Intent unknown' : `${value} intent`));
    row.append(info, score, intent);
    fragment.append(row);
  });
  container.append(fragment);
}
async function loadCompanies() {
  container.setAttribute('aria-busy', 'true');
  container.replaceChildren(element('p', 'data-state', 'Loading companies…'));
  updateStats(null);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('/api/companies', { signal: controller.signal, cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || data.success !== true || !Array.isArray(data.companies) ||
      data.companies.some(c => !c || typeof c !== 'object' || Array.isArray(c))) throw new Error();
    renderCompanies(data.companies);
    updateStats(data.companies);
  } catch {
    const state = element('div', 'data-state');
    state.append(element('p', '', 'Companies could not be loaded. Please try again.'));
    const retry = element('button', 'action', 'Retry');
    retry.addEventListener('click', loadCompanies);
    state.append(retry);
    container.replaceChildren(state);
  } finally {
    clearTimeout(timer);
    container.setAttribute('aria-busy', 'false');
  }
}
loadCompanies();

const modal = document.getElementById('modal');
document.getElementById('newSearch').onclick = () => modal.classList.remove('hidden');
document.getElementById('close').onclick = () => modal.classList.add('hidden');
const searchUnavailable = () => alert('Prospect research is not connected yet. No search has been queued.');
document.getElementById('modalRun').onclick = searchUnavailable;
document.getElementById('runSearch').onclick = searchUnavailable;
