let workspaceCompanies=[], workspaceReviews=[], workspaceAuthenticated=false;
const workspaceGet=id=>document.getElementById(id);
function refreshWorkspacePriorities(rows=workspaceCompanies) {
 workspaceCompanies=rows;
 const list=workspaceGet('priorityList');if(!list)return;list.replaceChildren();
 const today=new Date().toISOString().slice(0,10),reviews=new Map(workspaceReviews.map(r=>[r.company_id,r]));
 const ranked=rows.map(c=>({c,r:reviews.get(c.id)||{}})).filter(({r})=>!['Not Relevant','Customer'].includes(r.commercial_status)).map(v=>({...v,due:Boolean(v.r.next_followup_at&&v.r.next_followup_at<=today)})).sort((a,b)=>Number(b.due)-Number(a.due)||(b.r.user_priority_rating||0)-(a.r.user_priority_rating||0)||(researchScore(b.c)??-1)-(researchScore(a.c)??-1));
 if(!ranked.length)list.append(element('p','detail-note','No actionable companies yet. Start a research campaign or adjust your follow-ups.'));
 ranked.slice(0,6).forEach(({c,r,due})=>{const b=element('button','priority-card');b.append(element('strong','',known(c.name)),element('span',`priority-label${due?' due-label':''}`,due?'Follow-up due':r.commercial_status||c.intelligence?.action?.action||'Review company'),element('span','',`${known(c.country)} · opportunity ${researchScore(c)??'Unknown'}`),element('span','',due?`Planned: ${r.next_followup_at}`:c.intelligence?.action?.rationale||'Confirm available evidence before contacting.'));b.onclick=()=>openCompany(c.id,b);list.append(b);});
}
async function workspaceRequest(url,body) {
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),65000);
 try{const response=await fetch(url,{cache:'no-store',signal:controller.signal,...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok||!data.success)throw Error(data.error?.message||'The operation did not finish. Refresh the workspace before retrying.');return data;}finally{clearTimeout(timer);}
}
function workspaceMessage(message,error=false){const n=workspaceGet('workspaceMessage');n.textContent=message;n.className=error?'workspace-error':'workspace-success';}
async function refreshWorkspace() {
 try {
  const state=await workspaceRequest('/api/operator');workspaceAuthenticated=state.authenticated;
  if(state.configured&&!state.authenticated)workspaceGet('operatorPanel').classList.remove('hidden');
  workspaceGet('operatorState').textContent=!state.configured?'Private controls need WSE_OPERATOR_KEY configured on the server.':state.authenticated?'Workspace unlocked for this browser session.':'Enter your operator key. It is not saved in the browser.';
  workspaceGet('operatorLogin').classList.toggle('hidden',state.authenticated||!state.configured);workspaceGet('operatorLogout').classList.toggle('hidden',!state.authenticated);
  workspaceGet('workspaceLocked').classList.toggle('hidden',state.authenticated);workspaceGet('workspacePrivate').classList.toggle('hidden',!state.authenticated);
  workspaceGet('operatorToggle').textContent=state.authenticated?'Workspace unlocked':'Operator access';
  workspaceGet('automationState').textContent=state.scheduler_configured?'Daily scheduler configured · 07:00 UTC window · campaigns start paused.':'Scheduled execution needs CRON_SECRET on Vercel. Manual campaign runs are available after operator login.';
  if(!state.authenticated){workspaceReviews=[];refreshWorkspacePriorities();return;}
  const data=await workspaceRequest('/api/workspace');workspaceReviews=data.reviews;refreshWorkspacePriorities();
  const list=workspaceGet('campaignList');list.replaceChildren();
  if(!data.campaigns.length)list.append(element('p','detail-note','No campaigns yet. Create your first research plan above.'));
  data.campaigns.forEach(c=>{
   const card=element('article','campaign-card'),title=element('h4','',c.name);title.append(element('span','badge',c.status));card.append(title,element('p','detail-note',c.segments.map(s=>s.market).join(' → ')),element('p','detail-note',`${c.runs_used}/${c.run_budget} runs used · ${c.segments[0]?.prospect_type} · ${c.segments[0]?.product_focus}`),element('p','detail-note',c.status==='active'?`Next eligible run: ${new Date(c.next_run_at).toLocaleString()}`:'Scheduled runs paused. Run one segment manually to inspect the results.'));
   const actions=element('div','button-row');
   const run=element('button','action','Run next segment');run.disabled=c.runs_used>=c.run_budget;run.onclick=()=>command({action:'run_campaign',id:c.id},run);
   const toggle=element('button','action',c.status==='active'?'Pause schedule':'Activate daily schedule');toggle.disabled=c.runs_used>=c.run_budget||(!state.scheduler_configured&&c.status!=='active');toggle.onclick=()=>command({action:'campaign_status',id:c.id,status:c.status==='active'?'paused':'active'},toggle);
   actions.append(run,toggle);card.append(actions);list.append(card);
  });
  const runs=workspaceGet('campaignRuns');runs.replaceChildren();data.runs.forEach(r=>runs.append(element('p','detail-note',`${new Date(r.started_at).toLocaleString()} · ${data.campaigns.find(c=>c.id===r.campaign_id)?.name||'Campaign'} · ${r.status}${r.error_code?' · '+r.error_code:''}`)));
 }catch(error){workspaceMessage(error.message,true);}
}
async function command(body,button) {
 if(button)button.disabled=true;workspaceMessage(body.action==='run_campaign'?'Researching the next market. You can refresh later to inspect its persisted result.':'Saving…');
 try{const data=await workspaceRequest('/api/workspace',body);workspaceMessage(data.idle?data.reason:data.search?`Research completed: ${data.search.prospects_found} companies accepted.`:'Saved.');await refreshWorkspace();if(data.search)await Promise.all([loadCompanies(),loadSignals()]);}
 catch(error){workspaceMessage(error.message,true);await refreshWorkspace();}finally{if(button)button.disabled=false;}
}
function renderCommercialTools(data) {
 const section=detailSection('Approach to validate');section.append(element('p','detail-note','Evidence-grounded draft, prepared from the company dossier. Review names, relevance and terms before copying. Nothing is sent.'));
 const language=element('select','');language.setAttribute('aria-label','Draft language');for(const [v,t]of [['fr','Français'],['en','English']]){const o=element('option','',t);o.value=v;language.append(o);}
 const generate=element('button','action','Prepare approach'),draft=element('div','');section.append(language,generate,draft);
 generate.onclick=async()=>{generate.disabled=true;draft.replaceChildren(element('p','detail-note','Preparing the evidence brief…'));try{
  const {brief}=await workspaceRequest(`/api/brief?id=${encodeURIComponent(data.company.id)}&language=${language.value}`);
  draft.replaceChildren(element('p','detail-note',`Recommended: ${brief.action.action}. ${brief.why_now}`));
  const subject=element('input','draft-subject');subject.value=brief.subject;subject.setAttribute('aria-label','Message subject');
  const body=element('textarea','draft-text');body.value=brief.body;body.setAttribute('aria-label','Message draft');
  const copy=element('button','action','Copy draft');copy.onclick=async()=>{try{await navigator.clipboard.writeText(subject.value+'\n\n'+body.value);copy.textContent='Copied';}catch{copy.textContent='Select and copy the text above';}};
  draft.append(element('p','detail-note',`Recipient: ${brief.recipient||'Unknown · identify the right contact first'}`),subject,body,copy);
  brief.sources.forEach(s=>{const row=element('p','detail-note',s.label+' ');sourceLink(row,s.url,'Evidence');draft.append(row);});brief.followups.forEach(s=>draft.append(element('p','detail-note',s)));
 }catch(error){draft.replaceChildren(element('p','workspace-error',error.message));}finally{generate.disabled=false;}};
 const review=detailSection('Private commercial follow-up');
 if(!workspaceAuthenticated){const unlock=element('button','action','Unlock operator access');unlock.onclick=()=>{drawer.close();workspaceGet('operatorPanel').classList.remove('hidden');workspaceGet('operatorPanel').scrollIntoView({behavior:'smooth'});};review.append(element('p','detail-note','Private notes and follow-ups require operator access.'),unlock);return;}
 const saved=workspaceReviews.find(r=>r.company_id===data.company.id)||{},form=element('form','review-form');
 const add=(title,node)=>{const label=element('label','',title);label.append(node);form.append(label);return node;};
 const status=add('Commercial status',element('select',''));['New','To Contact','Contacted','Qualified','Not Relevant','Customer','Monitor'].forEach(v=>{const o=element('option','',v);o.value=v;status.append(o);});status.value=saved.commercial_status||'New';
 const rating=add('Your priority (1–5, optional)',element('input',''));rating.type='number';rating.min='1';rating.max='5';rating.value=saved.user_priority_rating||'';
 const date=add('Next follow-up',element('input',''));date.type='date';date.value=saved.next_followup_at||'';
 const note=add('Private note',element('textarea',''));note.maxLength=1200;note.value=saved.user_note||'';
 const save=element('button','primary','Save follow-up');save.type='submit';const feedback=element('p','detail-note');feedback.setAttribute('role','status');form.append(save,feedback);
 form.onsubmit=async event=>{event.preventDefault();save.disabled=true;try{await workspaceRequest('/api/workspace',{action:'review',company_id:data.company.id,commercial_status:status.value,user_note:note.value,user_priority_rating:rating.value?Number(rating.value):null,next_followup_at:date.value||null});feedback.textContent='Saved privately.';await refreshWorkspace();}catch(error){feedback.textContent=error.message;}finally{save.disabled=false;}};review.append(form);
}
workspaceGet('operatorToggle').onclick=()=>{workspaceGet('operatorPanel').classList.toggle('hidden');workspaceGet('operatorPanel').scrollIntoView({behavior:'smooth'});};
workspaceGet('operatorLogin').onsubmit=async e=>{e.preventDefault();const key=workspaceGet('operatorKey');try{await workspaceRequest('/api/operator',{action:'login',key:key.value});key.value='';await refreshWorkspace();await Promise.all([loadCompanies(),loadSignals()]);workspaceMessage('Workspace unlocked.');}catch(error){workspaceMessage(error.message,true);}finally{key.value='';}};
workspaceGet('operatorLogout').onclick=async()=>{try{await workspaceRequest('/api/operator',{action:'logout'});if(drawer.open)drawer.close();detailBody.replaceChildren();await refreshWorkspace();await Promise.all([loadCompanies(),loadSignals()]);}catch(error){workspaceMessage(error.message,true);}};
workspaceGet('campaignForm').onsubmit=e=>{e.preventDefault();command({action:'create_campaign',name:workspaceGet('campaignName').value,markets:[...document.querySelectorAll('[name=campaignMarket]:checked')].map(n=>n.value),prospect_type:workspaceGet('campaignType').value,product_focus:workspaceGet('campaignProduct').value,run_budget:Number(workspaceGet('campaignBudget').value)},e.submitter);};
workspaceGet('refreshWorkspace').onclick=refreshWorkspace;
workspaceGet('exportCompanies').onclick=()=>{const columns=['name','country','city','company_type','website','opportunity_score','buying_intent'];const escape=v=>'"'+String(v??'Unknown').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';const csv=[columns.join(','),...workspaceCompanies.map(c=>columns.map(k=>escape(c[k])).join(','))].join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}));const a=element('a','');a.href=url;a.download='gensac-companies.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
refreshWorkspacePriorities(typeof pipelineCompanies==='undefined'?[]:pipelineCompanies);
refreshWorkspace();
