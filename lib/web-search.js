import {AppError, boundedJSON} from './http.js';
import {uuid} from './search-input.js';
import {providerStatus} from './research/providers.js';
import {publicURL} from './research/normalize.js';

export const webLanguages = ['en','fr','de','es','it','pt-br','pt-pt','nl','ja','ko','zh-hans','zh-hant','ar','hi','ru','uk','pl','tr','sv','da','fi','nb','vi','id','th'];
const clean = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max) : '';
export function webInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k=>!['query','location','language','freshness','page','request_id'].includes(k))) throw new AppError('INVALID_WEB_INPUT',400);
  const {query,location='',language='en',freshness='',page=0,request_id}=body;
  if (typeof query!=='string' || typeof location!=='string' || query.length>400 || location.length>100 || /[\u0000-\u001f\u007f]/.test(query+location) || !query.trim() || !webLanguages.includes(language) || !['','pd','pw','pm','py'].includes(freshness) || !Number.isInteger(page) || page<0 || page>9 || !uuid(request_id)) throw new AppError('INVALID_WEB_INPUT',400);
  const q=[query.trim(),location.trim()].filter(Boolean).join(' ');
  if(q.length>500 || q.split(/\s+/u).length>70)throw new AppError('INVALID_WEB_INPUT',400);
  return {query:query.trim(),location:location.trim(),language,freshness,page,request_id,q};
}

export async function searchWeb(input, {env=process.env, signal}={}) {
  if(!providerStatus(env).available)throw new AppError('PROVIDER_UNAVAILABLE',503);
  const url=new URL('https://api.search.brave.com/res/v1/web/search');
  url.search=new URLSearchParams({q:input.q,country:'ALL',search_lang:input.language,count:'20',offset:String(input.page),safesearch:'moderate',spellcheck:'false',text_decorations:'false',result_filter:'web'});
  if(input.freshness)url.searchParams.set('freshness',input.freshness);
  const timeout=AbortSignal.timeout(12000);
  let data;
  try {
    const response=await fetch(url,{headers:{Accept:'application/json','X-Subscription-Token':env.BRAVE_SEARCH_API_KEY.trim()},redirect:'error',signal:signal?AbortSignal.any([signal,timeout]):timeout});
    if(!response.ok){await response.body?.cancel();throw new AppError(response.status===429?'PROVIDER_RATE_LIMITED':'PROVIDER_FAILED',response.status===429?429:502);}
    data=await boundedJSON(response);
  }catch(error){
    if(timeout.aborted||signal?.aborted)throw new AppError('TIMEOUT',504);
    if(error instanceof AppError)throw error;
    throw new AppError('PROVIDER_FAILED',502);
  }
  if(!data || typeof data!=='object' || Array.isArray(data) || (data.web!=null && !Array.isArray(data.web.results)))throw new AppError('INVALID_RESPONSE',502);
  const rows=data.web?.results??[], seen=new Set(),results=[];
  for(const row of rows.slice(0,20)) {
    const link=publicURL(row?.url);if(!link||seen.has(link))continue;seen.add(link);
    results.push({url:link,domain:new URL(link).hostname,title:clean(row.title,300)||null,description:clean(row.description,1800)||null,page_date:clean(row.page_age,80)||null});
  }
  return {provider:'Brave Search',query:input.query,location:input.location,language:input.language,freshness:input.freshness,page:input.page,
    results,has_more:input.page<9 && (data.query?.more_results_available===true || (data.query?.more_results_available!==false && rows.length===20)),searched_at:new Date().toISOString()};
}
