let pipelineCompanies=[];
const researchScore=c=>c.intelligence?scoreValue(c.intelligence.opportunity_score):scoreValue(c.opportunity_score);
function filteredCompanies(rows,filters) {
 const numeric=(v,min)=>!min||(v!==null&&v>=min);
 const filtered=rows.filter(c=>(!filters.country||c.country===filters.country)&&(!filters.type||c.company_type===filters.type)&&numeric(researchScore(c),Number(filters.score))&&numeric(c.intelligence?scoreValue(c.intelligence.buying_intent):scoreValue(c.buying_intent),Number(filters.intent))&&(!filters.contact||c.intelligence?.has_decision_maker)&&(!filters.recent||c.intelligence?.has_recent_signal));
 const value=c=>filters.sort==='intent'?c.intelligence?.buying_intent:filters.sort==='signal'?Date.parse(c.intelligence?.last_signal_at)||null:filters.sort==='researched'?Date.parse(c.intelligence?.last_researched_at)||null:researchScore(c);
 return [...filtered].sort((a,b)=>(value(b)??-1)-(value(a)??-1)||String(a.name).localeCompare(String(b.name)));
}
function applyPipelineFilters() {
 const get=id=>document.getElementById(id);
 const rows=filteredCompanies(pipelineCompanies,{country:get('filterCountry').value,type:get('filterType').value,score:get('filterScore').value,intent:get('filterIntent').value,contact:get('filterContact').checked,recent:get('filterRecent').checked,sort:get('pipelineSort').value});
 renderCompanies(rows,true);get('filterCount').textContent=`${rows.length} of ${pipelineCompanies.length} companies`;
 if(!rows.length&&pipelineCompanies.length)container.replaceChildren(element('p','data-state','No companies match these filters. Try reducing the thresholds.'));
}
function setPipelineCompanies(rows) {
 pipelineCompanies=rows;
 for(const [id,key]of [['filterCountry','country'],['filterType','company_type']]) {
  const select=document.getElementById(id),previous=select.value;
  const all=element('option','','All '+(key==='country'?'countries':'types'));all.value='';select.replaceChildren(all);
  [...new Set(rows.map(c=>c[key]).filter(Boolean))].sort().forEach(value=>{const option=element('option','',value);option.value=value;select.append(option);});
  select.value=rows.some(c=>c[key]===previous)?previous:'';
 }
 applyPipelineFilters();
}
for(const id of ['filterCountry','filterType','filterScore','filterIntent','filterContact','filterRecent','pipelineSort'])document.getElementById(id).addEventListener('change',applyPipelineFilters);
