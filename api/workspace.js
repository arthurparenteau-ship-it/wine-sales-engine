import {database} from '../lib/db.js';
import {headers,failure,AppError} from '../lib/http.js';
import {guardPost,uuid} from '../lib/search-input.js';
import {requireOperator} from '../lib/operator.js';
import {campaignInput,runCampaign} from '../lib/autopilot.js';
const statuses=['New','To Contact','Contacted','Qualified','Not Relevant','Customer','Monitor'];
export default async function handler(req,res) {
 headers(res);
 try {
  requireOperator(req);
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');throw new AppError('METHOD_NOT_ALLOWED',405);}
  const db=database();
  if(req.method==='GET') {
   const [campaigns,runs,reviews]=await Promise.all([
    db.request('wse_campaigns?select=id,name,segments,status,run_budget,runs_used,consecutive_failures,next_run_at,created_at&order=created_at.desc&limit=50'),
    db.request('wse_campaign_runs?select=id,campaign_id,search_id,status,error_code,started_at,finished_at&order=started_at.desc&limit=30'),
    db.request('company_reviews?select=company_id,user_note,commercial_status,user_priority_rating,next_followup_at,reviewed_at&order=reviewed_at.desc&limit=1000')
   ]);
   return res.status(200).json({success:true,campaigns,runs,reviews});
  }
  guardPost(req);const b=req.body;
  if(b?.action==='create_campaign') {
   const input=campaignInput(b);
   const rows=await db.request('wse_campaigns',{method:'POST',body:input,prefer:'return=representation'});
   return res.status(201).json({success:true,campaign:rows[0]});
  }
  if(b?.action==='campaign_status') {
   if(!uuid(b.id)||!['active','paused'].includes(b.status))throw new AppError('INVALID_INPUT',400);
   if(b.status==='active'&&(!process.env.CRON_SECRET||process.env.CRON_SECRET.length<32))throw new AppError('SCHEDULER_NOT_CONFIGURED',503);
   const rows=await db.request(`wse_campaigns?id=eq.${b.id}&runs_used=lt.60`,{method:'PATCH',body:{status:b.status,consecutive_failures:0},prefer:'return=representation'});
   if(!rows.length)throw new AppError('CAMPAIGN_UNAVAILABLE',409);
   return res.status(200).json({success:true,campaign:rows[0]});
  }
  if(b?.action==='run_campaign') {
   if(!uuid(b.id))throw new AppError('INVALID_ID',400);
   const result=await runCampaign(b.id);return res.status(result.success?200:502).json(result);
  }
  if(b?.action==='review') {
   if(!uuid(b.company_id)||!statuses.includes(b.commercial_status)||typeof b.user_note!=='string'||b.user_note.length>1200||!(b.user_priority_rating===null||(Number.isInteger(b.user_priority_rating)&&b.user_priority_rating>=1&&b.user_priority_rating<=5))||!(b.next_followup_at===null||(typeof b.next_followup_at==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(b.next_followup_at)&&Number.isFinite(Date.parse(b.next_followup_at)))))throw new AppError('INVALID_INPUT',400);
   await db.request('company_reviews?on_conflict=company_id',{method:'POST',body:{company_id:b.company_id,commercial_status:b.commercial_status,user_note:b.user_note,user_priority_rating:b.user_priority_rating,next_followup_at:b.next_followup_at,reviewed_at:new Date().toISOString()},prefer:'resolution=merge-duplicates,return=minimal'});
   return res.status(200).json({success:true});
  }
  throw new AppError('INVALID_INPUT',400);
 }catch(error){return failure(res,error);}
}
