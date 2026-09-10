export const MAX_QUERIES=7;
export const RESULTS_PER_QUERY=10;
const marketWords={Belgium:['Belgium','Belgique','België'],France:['France','France','France'],'United Kingdom':['United Kingdom','United Kingdom','United Kingdom'],Switzerland:['Switzerland','Suisse','Schweiz']};
export function discoveryQueries(input) {
 const [en,fr,nl]=marketWords[input.market];
 const product=input.product_focus==='Wine'?'wine':input.product_focus==='Armagnac'?'armagnac spirits':'wine armagnac spirits';
 const target={'Importer / Distributor':'importer distributor wholesaler','Premium Caviste':'premium wine merchant caviste',Restaurant:'restaurant group wine buyer','Spirits Buyer':'spirits importer buyer'}[input.prospect_type];
 const french=input.prospect_type==='Restaurant'?'groupe restaurants acheteur vins':input.prospect_type==='Premium Caviste'?'caviste premium vins':input.prospect_type==='Spirits Buyer'?'importateur spiritueux armagnac':'importateur distributeur vins spiritueux';
 const base=[`${en} ${product} ${target}`,`${en} ${target} ${product} French producers portfolio`,`${en} ${target} ${product} horeca wholesale new suppliers`];
 if(input.market==='United Kingdom')base.push(`${en} ${target} ${product} purchasing manager portfolio`,`UK ${target} ${product} direct import new brands`);
 else base.push(`${fr} ${french} ${input.product_focus==='Armagnac'?'armagnac':'producteurs français'} catalogue nouveautés`,
  input.market==='Belgium'?`${nl} ${product} importeur groothandel horeca assortiment`:input.market==='Switzerland'?`${nl} ${product} importeur wein spirituosen sortiment`:`France ${french} achats nouveaux fournisseurs`);
 return [...new Set(base)].slice(0,5);
}
export const enrichmentQuery=(host,input)=>`site:${host} ${input.product_focus==='Armagnac'?'armagnac':'wine vins spirits'} portfolio catalogue new producers nouveaux producteurs buyer acheteur purchasing owner fondateur contact`;
