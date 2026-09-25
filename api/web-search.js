import {database} from '../lib/db.js';
import {headers,failure,AppError} from '../lib/http.js';
import {guardPost} from '../lib/search-input.js';
import {operatorConfigured,requireOperator} from '../lib/operator.js';
import {providerStatus} from '../lib/research/providers.js';
import {webInput,searchWeb} from '../lib/web-search.js';

export default async function handler(req,res) {
  headers(res);
  try {
    if(req.method==='GET')return res.status(200).json({success:true,provider:providerStatus(),daily_limit:100,page_size:20,max_pages:10});
    if(req.method!=='POST'){res.setHeader('Allow','GET, POST');throw new AppError('METHOD_NOT_ALLOWED',405);}
    if(operatorConfigured())requireOperator(req);
    guardPost(req);
    const input=webInput(req.body);
    if(!providerStatus().available)throw new AppError('PROVIDER_UNAVAILABLE',503);
    // Shared, durable quota across serverless instances. Fail closed before spending.
    // A repeated ID never triggers a second provider call, even after a lost response.
    const reservation=await database().rpc('wse_reserve_web_search',{p_request_id:input.request_id});
    if(reservation?.error)throw new AppError(reservation.error,reservation.error==='WEB_REQUEST_USED'?409:429);
    if(reservation?.allowed!==true)throw new AppError('DATABASE_UNAVAILABLE',502);
    const result=await searchWeb(input);
    return res.status(200).json({success:true,...result,remaining_today:reservation.remaining});
  }catch(error){return failure(res,error);}
}
