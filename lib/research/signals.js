import {clamp,sentences} from './evidence.js';
export const taxonomy={
 supplier_search:[100,/\b(seeking (?:new )?(?:suppliers|brands|producers)|new brands wanted|recherchons (?:des )?(?:producteurs|fournisseurs))\b/i,'Explicit supplier search'],
 new_producers:[95,/\b((?:adding|new|added) producers|nouveaux producteurs|new suppliers)\b/i,'New producers announced'],
 portfolio_expansion:[90,/\b(new portfolio|portfolio expansion|nouvelle gamme|new category|nouvelle catégorie)\b/i,'Portfolio expansion'],
 buyer_hiring:[90,/\b(hiring|recruiting|recrute)\b[^.!?]{0,80}\b(buyer|purchasing|acheteur|achats)\b/i,'Purchasing role hiring'],
 business_expansion:[80,/\b(new (?:store|cellar|warehouse)|opened|opening|nouveau (?:magasin|chai|entrepôt))\b/i,'Commercial expansion'],
 market_expansion:[80,/\b(new market|new wholesale channel|nouveau marché)\b/i,'Market expansion'],
 catalogue_refresh:[65,/\b(new (?:professional )?catalogue|catalogue refresh|nouveau catalogue)\b/i,'Catalogue refreshed'],
 professional_event:[60,/\b(trade fair|professional tasting|salon professionnel|professional event)\b/i,'Professional event'],
 digital_expansion:[50,/\b(new (?:website|online site|webshop)|nouveau site|new B2B service)\b/i,'Digital or B2B expansion'],
 product_announcement:[35,/\b(new product|new wine release|nouveau produit)\b/i,'Product announcement']
};
export function ageDays(date,now=new Date()) {
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
 const d=new Date(date+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==date)return null;
 const age=Math.floor((+now-+d)/86400000);return age<0?null:age;
}
export const decay=age=>age===null?0:age<=30?1:age<=90?.9:age<=180?.65:age<=365?.35:.1;
const months={january:1,janvier:1,february:2,février:2,march:3,mars:3,april:4,avril:4,may:5,mai:5,june:6,juin:6,july:7,juillet:7,august:8,août:8,september:9,septembre:9,october:10,octobre:10,november:11,novembre:11,december:12,décembre:12};
export function explicitDate(text) {
 const iso=text.match(/\b\d{4}-\d{2}-\d{2}\b/);if(iso)return iso[0];
 const match=text.toLowerCase().match(/\b(\d{1,2}) ([a-zéû]+) (20\d{2})\b/);
 return match&&months[match[2]]?`${match[3]}-${String(months[match[2]]).padStart(2,'0')}-${match[1].padStart(2,'0')}`:null;
}
export function extractSignals(evidence,now=new Date()) {
 const output=[],seen=new Set();
 for(const e of evidence) {
  for(const sentence of sentences(e.quote)) {
   const date=e.signal_date||explicitDate(sentence);
   for(const [type,[base,pattern,label]] of Object.entries(taxonomy)) {
    // A legacy type is retained as a claim; extraction from snippets still requires explicit language.
    if(!(e.legacy&&e.signal_type===type)&&!pattern.test(sentence))continue;
    const key=[type,date,e.source_url,sentence].join('|');if(seen.has(key))continue;seen.add(key);
    const age=ageDays(date,now);
    const strength=age===null?null:Math.round(base*decay(age)*e.quality/100*e.confidence/100);
    output.push({signal_type:type,description:sentence,signal_date:age===null?null:date,source_url:e.source_url,strength,base_strength:base,age_days:age,quality:e.quality,confidence:e.confidence,tier:e.tier,label,claim_type:'signal',recent:age!==null&&age<=90});
   }
  }
 }
 return output.sort((a,b)=>(b.strength??-1)-(a.strength??-1)||(a.age_days??Infinity)-(b.age_days??Infinity)).slice(0,30);
}
