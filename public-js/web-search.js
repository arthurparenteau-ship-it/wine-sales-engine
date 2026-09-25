// General web exploration stays separate from verified company records and scores.
(() => {
  const get=id=>document.getElementById(id),results=get('webResults'),status=get('webSearchStatus'),more=get('webMore');
  const controls=['webQuery','webLocation','webLanguage','webFreshness','webSubmit','webExampleJapan','webExampleKenya','webExampleMexico'];
  const errors={UNAUTHORIZED:'Unlock Operator access to search the web.',PROVIDER_UNAVAILABLE:'The web search engine is not configured. Please check the server settings.',PROVIDER_RATE_LIMITED:'Brave Search has reached its request or subscription limit. Try later or check the Brave plan.',RATE_LIMITED:'Searches are arriving too quickly. Wait a moment, then try again.',WEB_DAILY_LIMIT:'The shared allowance of 100 page requests per 24 hours has been reached. Please try later.',WEB_REQUEST_USED:'This request was already handled. Submit a new search to try again.',INVALID_WEB_INPUT:'Use 1–400 characters for the query, up to 100 for the location and no more than 70 words in total.',TIMEOUT:'The search timed out. Please try again.',DATABASE_UNAVAILABLE:'The search allowance could not be checked. Please try again.',PROVIDER_FAILED:'The search engine could not complete this request. Please try again.'};
  let busy=false,input=null,page=-1,hasMore=false,seen=new Set();
  const node=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text)n.textContent=text;return n;};
  function sourceURL(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
  function render(row){
    const url=sourceURL(row.url);if(!url||seen.has(url))return;seen.add(url);
    const card=node('article','web-result'),link=node('a','web-title',row.title||'Unknown title');link.href=url;link.target='_blank';link.rel='noopener noreferrer';
    card.append(node('p','web-domain',new URL(url).hostname),link,node('p','web-excerpt',row.description||'Description: Unknown'),node('p','detail-note',`Page date: ${row.page_date||'Unknown'}`));results.append(card);
  }
  async function search(append=false){
    if(busy)return;
    if(!append){
      input={query:get('webQuery').value.trim(),location:get('webLocation').value.trim(),language:get('webLanguage').value,freshness:get('webFreshness').value};
      if(!input.query){status.textContent='Enter what you want to find.';return;}
      page=-1;hasMore=false;seen=new Set();results.replaceChildren();
    }
    if(!input||(append&&!hasMore))return;
    busy=true;controls.forEach(id=>get(id).disabled=true);more.disabled=true;more.classList.add('hidden');results.setAttribute('aria-busy','true');
    const next=page+1;status.textContent=`Searching Brave for “${[input.query,input.location].filter(Boolean).join(' ')}”…`;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),28000);
    try{
      const response=await fetch('/api/web-search',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',signal:controller.signal,body:JSON.stringify({...input,page:next,request_id:crypto.randomUUID()})});
      const data=await response.json();if(!response.ok||!data.success)throw Object.assign(new Error(),{code:data.error?.code});
      if(!Array.isArray(data.results))throw Error();
      data.results.forEach(render);page=next;hasMore=data.has_more===true;
      status.textContent=seen.size?`${seen.size} unique web results · Brave Search · page ${page+1}${Number.isInteger(data.remaining_today)?` · ${data.remaining_today} page requests remaining`:''}. Sources are leads to verify, not qualified buyer profiles.`:'No public web results found. Try broader terms, another language or remove the date filter.';
      if(!seen.size)results.append(node('p','data-state','No matching sources were returned. No prospect or score has been invented.'));
    }catch(error){status.textContent=(errors[error.code]||'The search response was interrupted. Please try again.')+(append?' Previous results are preserved.':'');}
    finally{clearTimeout(timer);busy=false;controls.forEach(id=>get(id).disabled=false);more.disabled=false;more.classList.toggle('hidden',!hasMore);results.setAttribute('aria-busy','false');}
  }
  get('webSearchForm').onsubmit=event=>{event.preventDefault();return search();};more.onclick=()=>search(true);
  for(const [id,query,location] of [['webExampleJapan','wine importers distributors','Japan'],['webExampleKenya','luxury hotels','Kenya'],['webExampleMexico','Armagnac distributors','Mexico']])get(id).onclick=()=>{
    get('webQuery').value=query;get('webLocation').value=location;get('webLanguage').value='en';get('webFreshness').value='';get('webQuery').focus();status.textContent='Example ready. Select Search the web to run it.';
  };
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  fetch('/api/web-search',{cache:'no-store',signal:controller.signal}).then(r=>r.json()).then(data=>{
    get('webProvider').textContent=data.success&&data.provider?.available?'Brave Search · Worldwide':'Search engine unavailable';
  }).catch(()=>{get('webProvider').textContent='Search engine status unavailable';}).finally(()=>clearTimeout(timer));
})();
