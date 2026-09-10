export const MAX_QUERIES=7;
export const RESULTS_PER_QUERY=10;
export function queryPlan(input) {
 const wine=input.product_focus!=='Armagnac',spirits=input.product_focus!=='Wine';
 const market={Belgium:{en:'Belgium',fr:'Belgique',nl:'België'},France:{en:'France',fr:'France'},Switzerland:{en:'Switzerland',fr:'Suisse',de:'Schweiz'},'United Kingdom':{en:'UK'}}[input.market];
 const target=input.prospect_type;
 const channels={en:target==='Premium Caviste'?'fine wine merchant':target==='Restaurant'?'restaurant group':target==='Spirits Buyer'?'spirits importer wholesaler':'importer distributor',fr:target==='Premium Caviste'?'caviste vins fins':target==='Restaurant'?'groupe restaurants':'importateur distributeur',nl:target==='Premium Caviste'?'wijnhandel kwaliteitswijnen':target==='Restaurant'?'restaurant groep':'importeur groothandel',de:target==='Premium Caviste'?'Weinhandel Spitzenweine':target==='Restaurant'?'Restaurantgruppe':'Importeur Grosshandel'};
 const products={en:wine?'wine':'Armagnac',fr:wine?'vin':'armagnac',nl:wine?'wijn':'armagnac',de:wine?'Wein':'Armagnac'};
 const plan=[];
 for(const [language,country] of Object.entries(market))plan.push({id:`${language}-core`,language,query:`${channels[language]} ${products[language]} ${country}`,family:'core'});
 for(const [language,country] of Object.entries(market)){
  const terms=language==='fr'?(spirits?'spiritueux armagnac':'vins producteurs français'):language==='nl'?(spirits?'sterke drank armagnac':'wijn rechtstreekse invoer'):language==='de'?(spirits?'Spirituosen Armagnac':'Wein Direktimport'):(spirits?'spirits Armagnac':'French wine direct import');
  plan.push({id:`${language}-portfolio`,language,query:`${country} ${channels[language]} ${terms}`,family:'portfolio'});
  plan.push({id:`${language}-professional`,language,query:`${country} ${channels[language]} ${products[language]} ${target==='Premium Caviste'?'premium':language==='fr'?'professionnels horeca':language==='nl'?'horeca assortiment':'wholesale portfolio'}`,family:'professional'});
 }
 if(input.market==='United Kingdom')plan.push({id:'en-specialist',language:'en',family:'specialist',query:`UK ${channels.en} ${spirits?'Armagnac Cognac':'fine wines'} specialist`},{id:'en-independent',language:'en',family:'independent',query:`United Kingdom ${channels.en} ${products.en} independent suppliers`});
 return plan;
}
// Cover each market language first; remaining slots favor languages with verified or identity-backed yield.
export function nextQuery(plan,history) {
 const remaining=plan.filter(q=>!history.some(h=>h.id===q.id));
 const unseen=remaining.find(q=>!history.some(h=>h.language===q.language));if(unseen)return unseen;
 const yieldFor=q=>history.filter(h=>h.language===q.language).reduce((n,h)=>n+3*(h.new_verified||0)+(h.official_candidates||0),0);
 return remaining.sort((a,b)=>yieldFor(b)-yieldFor(a)||plan.indexOf(a)-plan.indexOf(b))[0]||null;
}
export function discoveryQueries(input){const plan=queryPlan(input),history=[];for(let i=0;i<5;i++){const q=nextQuery(plan,history);if(q)history.push(q);}return history.map(q=>q.query);}
export const enrichmentQuery=(host,input)=>`site:${host} ${input.product_focus==='Armagnac'?'Armagnac Cognac':'portfolio vins wine'} contact buyer acheteur inkoper owner gérant zaakvoerder`;
