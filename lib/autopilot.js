import {internalSearch} from './operator.js';
import searchHandler from '../api/search.js';
import {database} from './db.js';
import {markets,types,products,uuid} from './search-input.js';
import {AppError} from './http.js';
export function campaignInput(body) {
 if(!body||typeof body.name!=='string'||!body.name.trim()||body.name.length>80||!Array.isArray(body.markets)||!body.markets.length||body.markets.length>4||!body.markets.every(m=>markets.includes(m))||!types.includes(body.prospect_type)||!products.includes(body.product_focus)||!Number.isInteger(body.run_budget)||body.run_budget<1||body.run_budget>60)throw new AppError('INVALID_INPUT',400);
 return {name:body.name.trim(),segments:[...new Set(body.markets)].map(market=>({market,prospect_type:body.prospect_type,product_focus:body.product_focus})),run_budget:body.run_budget};
}
export async function runCampaign(id=null) {
 if(id!==null&&!uuid(id))throw new AppError('INVALID_ID',400);
 const db=database();
 const claim=await db.rpc('wse_claim_campaign',{p_id:id});
 if(!claim?.run)return {success:true,idle:true,reason:claim?.reason||'No campaign due'};
 const {run,segment}=claim;let payload,httpStatus;
 const capture={setHeader(){},status(n){httpStatus=n;return this;},json(v){payload=v;return this;}};
 try {
  await searchHandler({[internalSearch]:true,method:'POST',headers:{'content-type':'application/json'},body:{...segment,request_id:run.request_id,refresh:false}},capture);
  await db.rpc('wse_complete_campaign_run',{p_run:run.id,p_search:payload?.search?.id||null,p_ok:payload?.search?.status==='completed',p_error:payload?.error?.code||null});
  return {success:payload?.search?.status==='completed',run_id:run.id,search:payload?.search||null,error:payload?.error||null,http_status:httpStatus};
 }catch(error){
  // A killed function is recovered on the next claim; never replay an ambiguous import.
  try{await db.rpc('wse_complete_campaign_run',{p_run:run.id,p_search:payload?.search?.id||null,p_ok:false,p_error:'DATABASE_UNAVAILABLE'});}catch{}
  throw error;
 }
}
