// These URLs are validated for identity/citation only. The server NEVER fetches candidate URLs.
export function publicURL(value) {
  if(typeof value!=='string'||value.length>2048||/[\s\u0000-\u001f\u007f]/.test(value))return null;
  try {const u=new URL(value);const h=u.hostname.toLowerCase();
    if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port||!h.includes('.')||
      h.endsWith('.local')||h.endsWith('.localhost')||h.endsWith('.internal')||h==='localhost'||h.includes(':')||/^[\d.]+$/.test(h))return null;
    u.hash='';return u.href;
  }catch{return null;}
}
export const domain=value=>{const url=publicURL(value);return url?new URL(url).hostname.replace(/^www\./,'').toLowerCase():null;};
export const normalizedName=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max?value.trim():null;
const terms={
  'Belgium':/\b(belgium|belgique|belgi[eë]|belgian)\b/i,'France':/\bfrance\b/i,
  'United Kingdom':/\b(united kingdom|UK|britain)\b/i,'Switzerland':/\b(switzerland|suisse|schweiz)\b/i,
  'Importer / Distributor':/\b(importer|importateur|distributor|distributeur|groothandel|wholesaler)\b/i,
  'Premium Caviste':/\b(caviste|wine merchant|wijnhandel)\b/i,'Restaurant':/\brestaurant\b/i,'Spirits Buyer':/\b(spirits|spiritueux|distillates)\b/i
};
const locationTerms={
  Belgium:/\b(?:based in|located in|situé[es]? en|basé[es]? en|gevestigd in)\s+(?:belgium|belgique|belgi[eë])\b|\bbelgian (?:wine |spirits )?(?:importer|distributor|wholesaler|merchant|restaurant)\b/i,
  France:/\b(?:based in|located in|situé[es]? en|basé[es]? en)\s+france\b|\bfrench (?:wine |spirits )?(?:importer|distributor|wholesaler|merchant|restaurant)\b/i,
  'United Kingdom':/\b(?:based in|located in)\s+(?:the )?(?:united kingdom|UK|britain)\b|\bbritish (?:wine |spirits )?(?:importer|distributor|wholesaler|merchant|restaurant)\b/i,
  Switzerland:/\b(?:based in|located in|situé[es]? en|basé[es]? en)\s+(?:switzerland|suisse)\b|\bswiss (?:wine |spirits )?(?:importer|distributor|wholesaler|merchant|restaurant)\b/i
};
export function normalizeCandidate(raw,input) {
  if(!raw||typeof raw!=='object')return null;
  const name=text(raw.name,160),website=publicURL(raw.website),source=publicURL(raw.source_url),quote=text(raw.quote,6000);
  if(!name||!website||!source||!quote||domain(website)!==domain(source)||!quote.toLowerCase().includes(name.toLowerCase()))return null;
  // Reject generic page headings, editorial lists and search pages as company identities.
  if(/^(home|welcome|contact|about|accueil|best|top|search|wine|wines|spirits)$/i.test(name)||/\b(top \d+|best \d+|directory|annuaire)\b/i.test(name))return null;
  const sentences=quote.split(/(?<=[.!?])\s+/).filter(s=>! /\b(no|not|never|without|pas|aucun|neither)\b/i.test(s));
  const positive=sentences.join(' ');
  if(!locationTerms[input.market].test(positive)||!terms[input.prospect_type].test(positive)||!/\b(wine|wines|vin|vins|wijn|spirits|spiritueux|armagnac)\b/i.test(positive))return null;
  if(input.prospect_type==='Premium Caviste'&&!/\b(premium|high-end|haut de gamme)\b/i.test(positive))return null;
  if(input.prospect_type==='Spirits Buyer'&&!/\b(buyer|importer|distributor|wholesaler|merchant|acheteur|importateur|grossiste)\b/i.test(positive))return null;
  if(input.product_focus==='Wine'&&!/\b(wine|wines|vin|vins|wijn)\b/i.test(positive))return null;
  if(input.product_focus==='Armagnac'&&!/\barmagnac\b/i.test(positive))return null;
  const city=text(raw.city,100);
  return {name,website:`https://${domain(website)}/`,country:input.market,company_type:input.prospect_type,
    city:city&&positive.includes(city)?city:null,description:quote,source_url:source,quote,positive,
    contacts:Array.isArray(raw.contacts)?raw.contacts.slice(0,5):[],events:Array.isArray(raw.events)?raw.events.slice(0,10):[]};
}
export function deduplicate(candidates) {
  const output=[];
  for(const candidate of candidates) {
    const existing=output.find(c=>(domain(c.website)&&domain(c.website)===domain(candidate.website))||
      ((!domain(c.website)||!domain(candidate.website))&&normalizedName(c.name)===normalizedName(candidate.name)&&c.country===candidate.country));
    if(!existing)output.push(candidate);
    else if(candidate.quote.length>existing.quote.length)Object.assign(existing,candidate);
  }
  return output;
}
