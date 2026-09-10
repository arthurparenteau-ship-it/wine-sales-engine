// Public presentation only. All research, evidence evaluation and secrets stay on the server.
function sourceLink(parent,url,label='Source') {
 const href=safeURL(url);if(!href)return;
 const a=element('a','evidence-link',label);a.href=href;a.target='_blank';a.rel='noopener noreferrer';parent.append(a);
}
function renderIntelligence(data) {
 const i=data.intelligence;if(!i)return false;
 detailTitle.textContent=known(data.company.name);detailBody.replaceChildren();
 const overview=detailSection('Commercial assessment');
 overview.append(element('p','detail-note',[data.company.company_type,data.company.city,data.company.country].filter(Boolean).join(' · ')));
 sourceLink(overview,data.company.website,'Company website');
 const metrics=element('dl','detail-grid metrics');
 for(const [label,value]of [['Research opportunity',metric(i.opportunity_score)],['Evidence confidence',`${i.confidence}%`],['Evidence coverage',`${i.dimensions_known}/${i.dimensions_total} dimensions · ${i.evidence_coverage}% weight`]])detailField(metrics,label,value);
 overview.append(metrics,element('p','detail-note',`Assessed ${i.as_of} · ${i.product_focus} · ${i.version}. Stored opportunity: ${metric(data.company.opportunity_score)}. Research values are a separate assessment.`));
 overview.append(element('p','detail-note',i.last_researched_at?`Last researched: ${new Date(i.last_researched_at).toLocaleString()}`:'Fresh research date unknown; existing sourced records are assessed without claiming new research.'));
 const action=detailSection('Recommended action');action.append(element('p','next-action',i.action.action),element('p','detail-description',i.action.rationale),element('p','detail-note',`Timing: ${i.action.urgency}. Deterministic evidence rules, not an AI-generated recommendation.`));
 const timing=detailSection('Why now?');timing.append(element('p','detail-description',i.timing_summary));
 i.why_now.forEach(reason=>{const row=element('p','insight',`${reason.label} · ${reason.date} · ${reason.strength}/100 `);sourceLink(row,reason.source_url);timing.append(row);});
 const fit=detailSection('Commercial fit');const scores=element('dl','detail-grid metrics');
 for(const [label,key]of [['Wine fit','wine_fit'],['Armagnac fit','armagnac_fit'],['Commercial potential','commercial_potential'],['Current buying intent','buying_intent'],['Accessibility','accessibility']])detailField(scores,label,metric(i.scores[key]));
 fit.append(scores,element('p','detail-note',`Evidence-based classification: ${i.classification}.`));
 const why=detailSection('Why this score');
 if(!i.positive_factors.length)why.append(element('p','detail-note','More sourced evidence is needed.'));
 i.positive_factors.slice(0,10).forEach(reason=>{const row=element('p','insight',reason.label+' ');sourceLink(row,reason.source_url);why.append(row);});
 const dimensions=element('details','score-details');dimensions.append(element('summary','','Scoring dimensions and weights'));
 Object.entries(i.dimensions).forEach(([name,d])=>dimensions.append(element('p','detail-note',`${name.replaceAll('_',' ')}: ${metric(d.value)} · weight ${d.weight}% · confidence ${d.confidence}%`)));why.append(dimensions);
 const risks=detailSection('Risks / gaps');i.risks.forEach(r=>risks.append(element('p','detail-note',r)));
 const best=detailSection('Best person to contact');
 if(i.best_contact){const c=i.best_contact;best.append(element('strong','',c.full_name),element('p','detail-description',c.job_title),element('p','detail-note',`Contact priority ${c.priority_score}/100 · confidence ${c.confidence}%${c.email_kind==='generic'?' · Generic business email':''}${!c.decision_maker?' · Decision-making authority unconfirmed':''}`));sourceLink(best,c.source,'Contact evidence');}
 else best.append(element('p','detail-note','No sufficiently supported decision maker identified.'));
 const contacts=detailSection('All contacts');
 const ranked=new Map(i.contacts.map(c=>[c.full_name,c]));
 const people=[...i.contacts,...data.contacts.filter(c=>!ranked.has(c.full_name))];
 if(!people.length)contacts.append(element('p','detail-note','Decision maker not identified yet.'));
 people.forEach(c=>{const card=element('dl','detail-grid detail-card');for(const [label,key]of [['Name','full_name'],['Role','job_title'],['Email','email'],['Phone','phone'],['LinkedIn','linkedin_url'],['Source','source']])detailField(card,label,c[key],key==='source'||key==='linkedin_url');contacts.append(card);});
 const signals=detailSection('Buying signals');
 if(!i.signals.length)signals.append(element('p','detail-note','No supported buying event detected. Undated portfolio evidence appears below.'));
 i.signals.slice(0,12).forEach(s=>{const card=element('div','detail-card');card.append(element('strong','',s.label),element('p','detail-description',s.description),element('p','detail-note',`${s.signal_date||'Date unknown'} · current strength ${metric(s.strength)} · source tier ${s.tier}${s.age_days!==null?' · '+s.age_days+' days old':''}`));sourceLink(card,s.source_url);signals.append(card);});
 const archiveRows=data.signals.filter(s=>s.signal_type!=='scoring_evidence');
 if(archiveRows.length){const archive=element('details','evidence-group');archive.append(element('summary','',`Stored evidence archive (${archiveRows.length})`));archiveRows.slice(0,50).forEach(s=>{const p=element('p','detail-note',`${s.signal_type} · ${s.signal_date||'Date unknown'} · ${s.description} `);sourceLink(p,s.source_url);archive.append(p);});if(archiveRows.length>50)archive.append(element('p','detail-note','Showing the first 50 stored records. All records remain in the database.'));signals.append(archive);}
 const sources=detailSection('Sources / evidence');
 const groups={Company:[],Portfolio:[],Signals:[],Contacts:[]};
 i.evidence.forEach(e=>{const group=e.signal_type?'Signals':/portfolio|catalog|armagnac|wine|vins/i.test(e.source_url)?'Portfolio':'Company';groups[group].push(e);});
 i.contacts.forEach(c=>groups.Contacts.push({source_url:c.source,quote:c.full_name+' · '+c.job_title,type:'contact_record',tier:'Recorded'}));
 Object.entries(groups).forEach(([group,rows])=>{if(!rows.length)return;const details=element('details','evidence-group');details.append(element('summary','',`${group} (${rows.length})`));rows.slice(0,12).forEach(e=>{const p=element('p','detail-note',`${e.quote} · ${e.type||'Stored evidence'} · ${e.tier}${e.legacy?' · Stored summary':''} `);sourceLink(p,e.source_url);details.append(p);});sources.append(details);});
 const feedback=detailSection('Commercial review');feedback.append(element('p','detail-note','Status and private feedback editing will become available with authenticated access. No public edits are enabled.'));
 return true;
}
