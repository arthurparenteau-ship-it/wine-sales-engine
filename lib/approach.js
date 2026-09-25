// Evidence-grounded templates. No invented purchase intent, contact details or prices.
export function approach(company,i,language='fr') {
 const french=language==='fr', name=company.name||'Unknown';
 const contact=i.best_contact;
 const sources=(i.positive_factors||[]).filter(x=>x.source_url).slice(0,3).map(x=>({label:x.label,url:x.source_url,quote:x.quote||''}));
 const wine=i.scores?.wine_fit,armagnac=i.scores?.armagnac_fit;
 const focus=armagnac!==null&&armagnac>=70&&(wine===null||armagnac>wine)?'Armagnac':'Wine + Armagnac';
 const organic=sources.some(s=>s.label==='Organic or biodynamic range documented');
 const brandy=sources.some(s=>s.label==='Armagnac explicitly listed');
 const angle=french?(organic?'Votre sélection bio ou biodynamique nous donne un point de départ pour cet échange. ':brandy?'La présence d’Armagnac dans votre offre nous donne un point de départ pour cet échange. ':''):(organic?'Your documented organic or biodynamic range offers a starting point for this conversation. ':brandy?'The Armagnac category documented in your range offers a starting point for this conversation. ':'');
 const target=contact?.decision_maker&&contact.confidence>=70?contact.full_name:null;
 const greeting=french?`Bonjour${target?' '+target:''},`:`Hello${target?' '+target:''},`;
 const subject=french?`Château de Gensac — échange avec ${name}`:`Château de Gensac — an introduction for ${name}`;
 const body=french?`${greeting}\n\nJe suis Arthur, responsable commercial au Château de Gensac, dans le Gers. Nous produisons des vins et des Armagnacs.\n\n${angle}Je vous contacte pour savoir si notre gamme pourrait correspondre à votre sélection chez ${name}. ${focus==='Armagnac'?'Je souhaiterais notamment vous présenter nos Armagnacs.':'Je peux vous présenter nos vins ainsi que nos Armagnacs, selon vos catégories prioritaires.'}\n\nÊtes-vous la bonne personne pour un premier échange sur votre sélection de producteurs ? Si oui, puis-je vous transmettre une présentation adaptée à vos besoins ?\n\nBien cordialement,\nArthur\nChâteau de Gensac`:`${greeting}\n\nI’m Arthur, commercial manager at Château de Gensac in Gascony, France. We produce wines and Armagnacs.\n\n${angle}I’m reaching out to explore whether our range could fit your selection at ${name}. ${focus==='Armagnac'?'I would particularly like to introduce our Armagnacs.':'I can introduce our wines and Armagnacs depending on the categories you are currently considering.'}\n\nAre you the right person to speak with about your producer selection? If so, may I send a short introduction tailored to your needs?\n\nBest regards,\nArthur\nChâteau de Gensac`;
 return {company_id:company.id,language,subject,body,product_focus:focus,recipient:contact?.email||null,contact_name:target,action:i.action,why_now:i.timing_summary,sources,gaps:i.risks||[],review_required:true,generated_by:'evidence-template-v1',followups:french?['J+7 : vérifier le bon interlocuteur avant une relance courte.','J+14 : proposer un échange uniquement si le contact reste pertinent.']:['Day 7: confirm the right buyer before a short follow-up.','Day 14: propose a conversation only if the contact remains relevant.']};
}
