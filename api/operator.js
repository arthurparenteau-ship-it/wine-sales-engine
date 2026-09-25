import {headers,failure,AppError} from '../lib/http.js';
import {guardPost} from '../lib/search-input.js';
import {operatorConfigured,isOperator,equalSecret,sessionToken,sessionCookie} from '../lib/operator.js';
export default async function handler(req,res) {
 headers(res);
 try {
  if(req.method==='GET')return res.status(200).json({success:true,configured:operatorConfigured(),authenticated:isOperator(req),scheduler_configured:Boolean(process.env.CRON_SECRET?.length>=32)});
  if(req.method!=='POST'){res.setHeader('Allow','GET, POST');throw new AppError('METHOD_NOT_ALLOWED',405);}
  guardPost(req);
  if(req.body?.action==='logout'){res.setHeader('Set-Cookie',sessionCookie('',0));return res.status(200).json({success:true});}
  if(!operatorConfigured())throw new AppError('OPERATOR_NOT_CONFIGURED',503);
  if(req.body?.action!=='login'||typeof req.body?.key!=='string'||req.body.key.length>256||!equalSecret(req.body.key,process.env.WSE_OPERATOR_KEY))throw new AppError('UNAUTHORIZED',401);
  res.setHeader('Set-Cookie',sessionCookie(sessionToken()));
  return res.status(200).json({success:true});
 }catch(error){return failure(res,error);}
}
