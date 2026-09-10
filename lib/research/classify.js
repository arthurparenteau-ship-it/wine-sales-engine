import {findClaim,sentences} from './evidence.js';
const rules=[
 ['Importer',/\b(importer|importateur|importeur|wijnimporteur|drankenimporteur|importateurs?|importeren|importons|direct[- ]import)\b/i],['Distributor',/\b(distributor|distributeur|distributie|distributeurs?|wijndistributeur)\b/i],
 ['Wholesaler',/\b(wholesal\w*|grossiste|groothandel)\b/i],['HORECA Supplier',/\b(horeca|suppl(?:y|ies) restaurants|livraisons? professionnelles?)\b/i],
 ['Restaurant Group',/\b(restaurant group|groupe de restaurants|restaurant chain)\b/i],['Retail Chain',/\b(retail chain|chain of stores|réseau de magasins)\b/i],
 ['E-commerce retailer',/\b(online shop|online store|boutique en ligne|webshop)\b/i],['Agent / Broker',/\b(wine agent|wine broker|courtier en vins)\b/i],
 ['Premium Caviste',/\b(fine wine merchant|fine wine specialist|premium wine merchant|premium caviste|caviste haut de gamme)\b/i],['Wine Merchant',/\b(wine merchant|caviste|wijnhandel|wijnhuis|wine shop)\b/i],
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
const localities={Belgium:'Brussels|Bruxelles|Brussel|Antwerp|Antwerpen|Anvers|Namur|Liège|Liege|Gent|Ghent|Gand|Bruges|Brugge|Heusden-Zolder|Battice|Genappe|Leuven|Louvain|Mouscron|Luik|Tournai|Kortrijk|Courtrai|Oostende|Zaventem|Wavre',France:'Paris|Lyon|Bordeaux|Marseille|Lille', 'United Kingdom':'London|Bristol|Manchester|Edinburgh|Glasgow|Birmingham|Leeds|Liverpool|Cardiff',Switzerland:'Genève|Geneva|Zürich|Zurich|Lausanne|Basel|Bern'};
export function geography(evidence,market) {
 const direct=location[market]&&findClaim(evidence,location[market],`Business located in ${market}`);if(direct)return direct;
 const countries={Belgium:'Belgium|Belgique|België|Belgische|Belgian|belge',France:'France', 'United Kingdom':'UK|United Kingdom|British',Switzerland:'Switzerland|Suisse|Schweiz|Swiss'};
 if(!countries[market])return null;
 const activity='(?:import[a-zé]*|distribut[a-z]*|groothandel|wijnhandel|wholesal[a-z]*|caviste|merchant|wine shop)';
 const pattern=new RegExp(`\\b${activity}[^.!?]{0,65}\\b(?:in|en|from|de|du|van) (?:the )?(?:${countries[market]})(?=[ ,.!?]|$)|\\b(?:${countries[market]}) ${activity}\\b`,'i');
 const country=findClaim(evidence,pattern,`Business located in ${market}`);if(country)return country;
 const cityPattern=new RegExp(`(?:based in|located in|situé[e]? à|basé[e]? à|gevestigd in|importateur[^.!?]{0,35} à|caviste à|wine merchant in|wijnhandel in|wholesaler in) (${localities[market]})(?=[ ,.!?]|$)`,'i');
 return findClaim(evidence,cityPattern,`Business locality documented in ${market}`);
}
export function matchesTarget(type,input,evidence) {
 if(input.prospect_type==='Importer / Distributor')return ['Importer','Distributor','Importer / Distributor','Wholesaler','HORECA Supplier','Agent / Broker'].includes(type);
 if(input.prospect_type==='Restaurant')return ['Restaurant','Restaurant Group'].includes(type);
 if(input.prospect_type==='Premium Caviste')return Boolean(findClaim(evidence,/\b(caviste|wine merchant|wine shop|wijnhandel|wijnhuis)\b/i,'Wine merchant'))&&Boolean(findClaim(evidence,/premium|haut de gamme|high-end|fine wines?|vins fins|kwaliteitswijnen/i,'Premium positioning'));
 return ['Importer','Distributor','Importer / Distributor','Wholesaler','Spirits Specialist','HORECA Supplier'].includes(type)&&Boolean(findClaim(evidence,/\b(spirits|spiritueux|armagnac)\b/i,'Spirits portfolio'));
}
