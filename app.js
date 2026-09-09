const container = document.getElementById('prospects');
const liveSignals = document.getElementById('liveSignals');
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
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-haspopup', 'dialog');
    row.setAttribute('aria-label', `Open prospect: ${company.name || 'Unnamed company'}`);
    row.addEventListener('click', () => openCompany(company.id, row));
    row.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openCompany(company.id, row);
      }
    });
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

function formatSignalType(value) {
  return typeof value === 'string' && value.trim()
    ? value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
    : 'Signal';
}
function renderSignals(signals) {
  liveSignals.replaceChildren();
  document.getElementById('signalCount').textContent = signals.length;
  if (!signals.length) {
    liveSignals.append(element('p', 'data-state', 'No buying signals detected yet.'));
    return;
  }
  const fragment = document.createDocumentFragment();
  signals.slice(0, 6).forEach(signal => {
    const item = element('div', 'signal');
    const strength = scoreValue(signal.strength);
    const dot = element('div', strength !== null && strength >= 85 ? 'signal-dot hot' : 'signal-dot');
    const body = element('div', '');
    body.append(element('strong', '', signal.company_name || 'Unknown company'));
    body.append(element('p', '', signal.description || 'Signal details unavailable'));
    const label = [formatSignalType(signal.signal_type), strength === null ? null : `${strength}/100`].filter(Boolean).join(' · ');
    body.append(element('span', '', label));
    item.append(dot, body);
    if (signal.company_id) {
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.addEventListener('click', () => openCompany(signal.company_id, item));
      item.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openCompany(signal.company_id, item);
        }
      });
    }
    fragment.append(item);
  });
  liveSignals.append(fragment);
}
async function loadSignals() {
  liveSignals.setAttribute('aria-busy', 'true');
  liveSignals.replaceChildren(element('p', 'data-state', 'Loading buying signals…'));
  document.getElementById('signalCount').textContent = '—';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('/api/signals', { signal: controller.signal, cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || data.success !== true || !Array.isArray(data.signals)) throw new Error();
    renderSignals(data.signals);
  } catch {
    const state = element('div', 'data-state');
    state.append(element('p', '', 'Buying signals could not be loaded.'));
    const retry = element('button', 'action', 'Retry');
    retry.addEventListener('click', loadSignals);
    state.append(retry);
    liveSignals.replaceChildren(state);
  } finally {
    clearTimeout(timer);
    liveSignals.setAttribute('aria-busy', 'false');
  }
}

loadCompanies();
loadSignals();

const modal = document.getElementById('modal');
document.getElementById('newSearch').onclick = () => modal.classList.remove('hidden');
document.getElementById('close').onclick = () => modal.classList.add('hidden');
const searchUnavailable = () => alert('Prospect research is not connected yet. No search has been queued.');
document.getElementById('modalRun').onclick = searchUnavailable;
document.getElementById('runSearch').onclick = searchUnavailable;

const drawer = document.getElementById('prospectDrawer');
const detailBody = document.getElementById('detailBody');
const detailTitle = document.getElementById('detailTitle');
let detailRequest;
let detailTrigger;
let detailVersion = 0;
const known = value => typeof value === 'string' && value.trim() ? value : 'Unknown';
const metric = value => scoreValue(value) === null ? 'Unknown' : `${scoreValue(value)}/100`;
function recommendedAction(value) {
  const score = scoreValue(value);
  return score === null ? 'Needs qualification' : score >= 85 ? 'Contact now' : score >= 70 ? 'Qualify and contact' : 'Monitor';
}
function safeURL(value) {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
function detailField(parent, label, value, link = false) {
  const field = element('div', 'detail-field');
  field.append(element('dt', '', label));
  const dd = element('dd', '', known(value));
  const href = link ? safeURL(value) : null;
  if (href) {
    const anchor = element('a', '', value);
    anchor.href = href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    dd.replaceChildren(anchor);
  }
  field.append(dd);
  parent.append(field);
}
function detailSection(title) {
  const section = element('section', 'detail-section');
  section.append(element('h3', '', title));
  detailBody.append(section);
  return section;
}
function renderDetail({company, contacts, signals}) {
  detailTitle.textContent = known(company.name);
  detailBody.replaceChildren();
  const overview = detailSection('Company');
  const facts = element('dl', 'detail-grid');
  for (const [label, key] of [['Company type','company_type'], ['City','city'], ['Country','country'], ['Website','website']]) {
    detailField(facts, label, company[key], key === 'website');
  }
  overview.append(facts, element('p', 'detail-description', known(company.description)));
  const intelligence = detailSection('Commercial intelligence');
  const scores = element('dl', 'detail-grid metrics');
  for (const [label, key] of [['Opportunity Score','opportunity_score'], ['Buying Intent','buying_intent'], ['Commercial Potential','commercial_potential'], ['Wine Fit','wine_fit'], ['Armagnac Fit','armagnac_fit'], ['Accessibility','accessibility']]) {
    detailField(scores, label, metric(company[key]));
  }
  intelligence.append(scores);
  const action = detailSection('Recommended action');
  action.append(element('p', 'next-action', recommendedAction(company.opportunity_score)),
    element('p', 'detail-note', 'Rule-based, not AI-generated. Based only on the stored Opportunity Score: 85+ contact now; 70–84 qualify and contact; below 70 monitor; unknown needs qualification.'));
  const people = detailSection('Contacts');
  if (!contacts.length) people.append(element('p', 'detail-note', 'Decision maker not identified yet.'));
  contacts.forEach(contact => {
    const card = element('dl', 'detail-grid detail-card');
    for (const [label, key] of [['Full name','full_name'], ['Job title','job_title'], ['Email','email'], ['Phone','phone'], ['LinkedIn','linkedin_url']]) {
      detailField(card, label, contact[key], key === 'linkedin_url');
    }
    detailField(card, 'Confidence', metric(contact.confidence));
    people.append(card);
  });
  const evidence = detailSection('Signals');
  if (!signals.length) evidence.append(element('p', 'detail-note', 'No buying signals detected yet.'));
  signals.forEach(signal => {
    const card = element('dl', 'detail-grid detail-card');
    for (const [label, key] of [['Signal type','signal_type'], ['Description','description'], ['Date','signal_date'], ['Source','source_url']]) {
      detailField(card, label, signal[key], key === 'source_url');
    }
    detailField(card, 'Strength', metric(signal.strength));
    evidence.append(card);
  });
}
async function openCompany(id, trigger = detailTrigger) {
  detailRequest?.abort();
  const request = new AbortController();
  detailRequest = request;
  const version = ++detailVersion;
  detailTrigger = trigger;
  detailTitle.textContent = 'Company detail';
  detailBody.replaceChildren(element('p', 'data-state', 'Loading prospect…'));
  detailBody.setAttribute('aria-busy', 'true');
  if (!drawer.open) drawer.showModal();
  drawer.scrollTop = 0;
  const timer = setTimeout(() => request.abort(), 15000);
  try {
    const response = await fetch(`/api/company?id=${encodeURIComponent(id)}`, {cache: 'no-store', signal: request.signal});
    const data = await response.json();
    const row = value => value && typeof value === 'object' && !Array.isArray(value);
    if (!response.ok || data.success !== true || !row(data.company) || data.company.id !== id ||
      !Array.isArray(data.contacts) || !data.contacts.every(row) || !Array.isArray(data.signals) || !data.signals.every(row)) {
      throw new Error(response.status === 404 ? 'not-found' : 'load-failed');
    }
    if (version === detailVersion && drawer.open) renderDetail(data);
  } catch (error) {
    if (version !== detailVersion || !drawer.open) return;
    const message = error.message === 'not-found' ? 'This company could not be found.' : 'Prospect details could not be loaded. Please try again.';
    const retry = element('button', 'action', 'Retry');
    retry.addEventListener('click', () => openCompany(id));
    detailBody.replaceChildren(element('p', 'data-state', message), retry);
  } finally {
    clearTimeout(timer);
    if (version === detailVersion) detailBody.setAttribute('aria-busy', 'false');
  }
}
document.getElementById('closeDetail').addEventListener('click', () => drawer.close());
drawer.addEventListener('close', () => {
  ++detailVersion;
  detailRequest?.abort();
  detailBody.setAttribute('aria-busy', 'false');
  detailTrigger?.focus();
});
