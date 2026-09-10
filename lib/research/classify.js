import {findClaim,sentences} from './evidence.js';
const rules=[
 ['Importer',/\b(importer|importateur|importeur|direct[- ]import)\b/i],['Distributor',/\b(distributor|distributeur|distributie)\b/i],
 ['Wholesaler',/\b(wholesal\w*|grossiste|groothandel)\b/i],['HORECA Supplier',/\b(horeca|suppl(?:y|ies) restaurants|livraisons? professionnelles?)\b/i],
 ['Restaurant Group',/\b(restaurant group|groupe de restaurants|restaurant chain)\b/i],['Retail Chain',/\b(retail chain|chain of stores|réseau de magasins)\b/i],
 ['E-commerce retailer',/\b(online shop|online store|boutique en ligne|webshop)\b/i],['Agent / Broker',/\b(wine agent|wine broker|courtier en vins)\b/i],
 ['Premium Caviste',/\b(premium wine merchant|premium caviste|caviste haut de gamme)\b/i],['Wine Merchant',/\b(wine merchant|caviste|wijnhandel)\b/i],
 ['Spirits Specialist',/\b(spirits specialist|spécialiste des spiritueux)\b/i],['Restaurant',/\b(?:we are a|is a|our|notre) restaurant\b/i]
];
export function classify(evidence) {
 const matches=rules.map(([name,pattern])=>({name,claim:findClaim(evidence,pattern,`${name} activity documented`)})).filter(x=>x.claim);
 const names=matches.map(x=>x.name);
 const producer=findClaim(evidence,/\b(we (?:produce|make|grow)|our (?:vineyards|distillery)|nous produisons|nos vignes|wine producer|wine estate)\b/i,'Producer activity');
 const business=names.some(n=>['Importer','Distributor','Wholesaler','HORECA Supplier','Agent / Broker'].includes(n));
 if(producer&&!business)return {type:'Producer / competitor',claims:[producer],excluded:true};
 if(names.includes('Importer')&&names.includes('Distributor'))return {type:'Importer / Distributor',claims:matches.map(x=>x.claim),excluded:false};
 return {type:names[0]||'Unknown',claims:matches.map(x=>x.claim),excluded:false};
}
const location={Belgium:/\b(?:based in|located in|basé[e]? en|situé[e]? en|gevestigd in) (?:Belgium|Belgique|Belgi[eë])\b|\b(?:Belgian|belge|Belgische) (?:wine |spirits |wijn)?(?:importer|importateur|importeur|distributor|wholesaler|merchant|restaurant)\b|\b(?:importateur|distributeur|grossiste|caviste) belge\b/i,France:/\b(?:based in|located in|basé[e]? en|situé[e]? en) France\b|\bFrench (?:wine )?(?:importer|distributor|merchant)\b/i,'United Kingdom':/\b(?:based in|located in) (?:the )?(?:UK|United Kingdom|Britain)\b|\bBritish (?:wine )?(?:importer|distributor|merchant)\b/i,Switzerland:/\b(?:based in|located in|basé[e]? en|situé[e]? en) (?:Switzerland|Suisse)\b|\b(?:Swiss|Schweizer) (?:wine |wein)?(?:importer|importeur|distributor|merchant)\b/i};
export const geography=(evidence,market)=>location[market]?findClaim(evidence,location[market],`Business located in ${market}`):null;
export function matchesTarget(type,input,evidence) {
 if(input.prospect_type==='Importer / Distributor')return ['Importer','Distributor','Importer / Distributor','Wholesaler','HORECA Supplier','Agent / Broker'].includes(type);
 if(input.prospect_type==='Restaurant')return ['Restaurant','Restaurant Group'].includes(type);
 if(input.prospect_type==='Premium Caviste')return ['Wine Merchant','Premium Caviste'].includes(type)&&Boolean(findClaim(evidence,/premium|haut de gamme|high-end/i,'Premium positioning'));
 return ['Importer','Distributor','Importer / Distributor','Wholesaler','Spirits Specialist','HORECA Supplier'].includes(type)&&Boolean(findClaim(evidence,/\b(spirits|spiritueux|armagnac)\b/i,'Spirits portfolio'));
}
