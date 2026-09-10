import {AppError} from './http.js';
export const markets=['Belgium','France','United Kingdom','Switzerland'];
export const types=['Importer / Distributor','Premium Caviste','Restaurant','Spirits Buyer'];
export const products=['Wine + Armagnac','Wine','Armagnac'];
export const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function validateInput(body) {
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['market','prospect_type','product_focus','request_id','refresh'].includes(k))||
    (body.refresh!==undefined&&typeof body.refresh!=='boolean')||!markets.includes(body.market)||!types.includes(body.prospect_type)||!products.includes(body.product_focus)||!uuid(body.request_id)) throw new AppError('INVALID_INPUT',400);
  return body;
}
export function guardPost(req) {
  if(!String(req.headers?.['content-type']||'').toLowerCase().split(';')[0].trim().match(/^application\/json$/)) throw new AppError('INVALID_INPUT',415);
  const origin=req.headers?.origin;
  if(origin) { let parsed; try{parsed=new URL(origin);}catch{throw new AppError('FORBIDDEN',403);}
    if(parsed.host!==req.headers.host||!['https:','http:'].includes(parsed.protocol)) throw new AppError('FORBIDDEN',403); }
  if(req.headers?.['sec-fetch-site']==='cross-site') throw new AppError('FORBIDDEN',403);
  if(Number(req.headers?.['content-length'])>2048||Buffer.byteLength(JSON.stringify(req.body??''))>2048) throw new AppError('TOO_LARGE',413);
}
