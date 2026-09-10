// Uses the existing DOM helpers and dashboard refresh functions; no credentials or provider calls here.
(() => {
  const status=document.getElementById('searchStatus');
  const history=document.getElementById('recentSearches');
  let busy=false, lastInput, lastRequest, pollTimer;
  const failureText={PROVIDER_UNAVAILABLE:'Provider unavailable. Configure the server research provider before retrying.',
    TIMEOUT:'Research timed out. Retry the search.',SEARCH_EXPIRED:'Search was interrupted. Retry the search.',
    PROVIDER_FAILED:'The research provider failed. Please retry.',DATABASE_UNAVAILABLE:'Database unavailable. Please retry.',
    SEARCH_BUSY:'Another search is running. Please wait.',RATE_LIMITED:'Search limit reached. Try again later.'};
  function summary(row) {
    const metrics=row.metrics||{};
    if(row.status==='completed')return `${row.prospects_found??0} accepted from ${metrics.raw_results??metrics.discovered??'unknown'} raw results · ${metrics.inserted??0} new · ${metrics.matched??0} existing${row.prospects_found===0?' · No evidence-backed prospects accepted':''}`;
    if(row.status==='failed')return failureText[row.error_code]||'Search failed. Please retry.';
    return row.status==='running'?'Research running':'Search pending';
  }
  function inputs(prefix) {return {market:document.getElementById(prefix?'modalMarket':'market').value,
    prospect_type:document.getElementById(prefix?'modalType':'type').value,product_focus:document.getElementById(prefix?'modalProduct':'product').value,refresh:Boolean(document.getElementById(prefix?'modalRefreshResearch':'refreshResearch')?.checked)};}
  async function request(url,options={},timeout=12000) {
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
    try {const response=await fetch(url,{...options,cache:'no-store',signal:controller.signal});
      const data=await response.json();return {response,data};}finally{clearTimeout(timer);}
  }
  function display(row,companies=[],cached=false) {
    status.replaceChildren(element('p','search-message',`${cached?'Reused completed search · ':''}${row.market} · ${row.status}: ${summary(row)}`));
    if(row.status==='failed') {
      const retry=element('button','action','Retry search');retry.disabled=busy;
      retry.addEventListener('click',()=>submit({market:row.market,prospect_type:row.prospect_type,product_focus:row.product_focus},true));status.append(retry);
    }
    const details=element('details','search-details');details.append(element('summary','','Search quality details'));
    details.append(element('p','detail-note',`${row.market} · ${row.prospect_type||'Unknown type'} · ${row.product_focus||'Unknown product'} · ${row.created_at||'Date unknown'}`));
    const m=row.metrics||{};
    for(const [label,key]of [['Raw results','raw_results'],['Unique candidates','unique_candidates'],['Verified candidates','verified_candidates'],['Accepted companies','accepted_companies'],['Contacts found','contacts_found'],['Signals found','signals_found'],['Scored companies','scored_companies'],['Provider requests','provider_request_count'],['Duration (ms)','duration_ms']])details.append(element('p','detail-note',`${label}: ${m[key]??'Not recorded'}`));
    for(const key of ['duplicate','irrelevant','insufficient_evidence','wrong_geography','competitor_producer','weak_business_relevance','unsafe_source','unsupported_type','candidate_limit'])if(m.rejection_reasons?.[key])details.append(element('p','detail-note',`${key.replaceAll('_',' ')}: ${m.rejection_reasons[key]}`));
    companies.forEach(c=>{const b=element('button','action',c.name);b.addEventListener('click',()=>openCompany(c.id,b));details.append(b);});
    status.append(details);
  }
  async function loadHistory() {
    try {
      const {response,data}=await request('/api/searches');
      if(!response.ok||!data.success||!Array.isArray(data.searches))throw Error();
      document.getElementById('providerState').textContent=data.provider?.available?'Public web discovery is available.':'Research provider unavailable. Searches record this failure; no demo prospects are generated.';
      history.replaceChildren();
      if(!data.searches.length)history.append(element('p','detail-note','No searches yet. Choose a market to begin.'));
      data.searches.forEach(row=>{
        const card=element('div','search-row');
        const text=element('div','');text.append(element('strong','',`${row.market} · ${row.prospect_type}`),
          element('p','detail-note',`${row.product_focus} · ${new Date(row.created_at).toLocaleString()}`),element('p','detail-note',summary(row)));
        const button=element('button',`action search-${row.status}`,row.status);
        button.addEventListener('click',async()=>{
          try {const {response,data}=await request(`/api/search?id=${encodeURIComponent(row.id)}`);if(!response.ok||!data.search)throw Error();display(data.search,data.companies||[],data.cached);}
          catch {status.replaceChildren(element('p','data-state','Search status could not be loaded. Refresh and try again.'));}
        });
        card.append(text,button);history.append(card);
      });
    }catch{history.replaceChildren(element('p','data-state','Recent searches could not be loaded. Use Refresh to retry.'));}
  }
  async function submit(input,newAttempt=false) {
    if(busy)return;
    if(newAttempt||!lastRequest||JSON.stringify(input)!==JSON.stringify(lastInput))lastRequest=crypto.randomUUID();
    lastInput=input;busy=true;
    for(const id of ['runSearch','modalRun'])document.getElementById(id).disabled=true;
    document.getElementById('modal').classList.add('hidden');
    status.replaceChildren(element('p','search-message','Submitting search. The persisted lifecycle appears below.'));
    document.getElementById('searchHistoryPanel').scrollIntoView({behavior:'smooth',block:'nearest'});
    let polling=true;
    async function poll(){await loadHistory();if(polling)pollTimer=setTimeout(poll,2000);}
    pollTimer=setTimeout(poll,500);
    try {
      const {response,data}=await request('/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,request_id:lastRequest})},55000);
      if(data.search) {
        display(data.search,data.companies||[],data.cached);
        if(['completed','failed'].includes(data.search.status))lastRequest=null;
        if(data.search.status==='completed')await Promise.all([loadCompanies(),loadSignals()]);
      }else {
        status.replaceChildren(element('p','data-state',failureText[data.error?.code]||'Search could not be started. Please retry.'));
      }
      if(!response.ok&&!data.search)throw Error('request-failed');
    }catch(error) {
      if(error.message!=='request-failed')status.replaceChildren(element('p','data-state','The search response was interrupted. Refresh history or retry this submission safely.'));
      const retry=element('button','action','Retry submission');retry.addEventListener('click',()=>submit(lastInput));status.append(retry);
    }finally {
      busy=false;polling=false;clearTimeout(pollTimer);
      for(const id of ['runSearch','modalRun'])document.getElementById(id).disabled=false;
      // Re-enable Retry controls created while the submission was busy.
      for(const button of status.querySelectorAll('button'))button.disabled=false;
      await loadHistory();
    }
  }
  document.getElementById('runSearch').onclick=()=>submit(inputs(false),true);
  document.getElementById('modalRun').onclick=()=>submit(inputs(true),true);
  document.getElementById('refreshSearches').onclick=loadHistory;
  loadHistory();
})();
