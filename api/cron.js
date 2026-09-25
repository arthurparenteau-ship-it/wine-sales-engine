import {headers,failure,AppError} from '../lib/http.js';
import {equalSecret} from '../lib/operator.js';
import {runCampaign} from '../lib/autopilot.js';
export default async function handler(req,res) {
 headers(res);
 try {
  if(req.method!=='GET'){res.setHeader('Allow','GET');throw new AppError('METHOD_NOT_ALLOWED',405);}
  if(!process.env.CRON_SECRET||process.env.CRON_SECRET.length<32)throw new AppError('SCHEDULER_NOT_CONFIGURED',503);
  if(!equalSecret(req.headers?.authorization,`Bearer ${process.env.CRON_SECRET}`))throw new AppError('UNAUTHORIZED',401);
  const result=await runCampaign();return res.status(result.success?200:502).json(result);
 }catch(error){return failure(res,error);}
}
