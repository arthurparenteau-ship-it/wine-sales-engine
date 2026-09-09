import {database} from '../lib/db.js';
import {headers,failure,AppError} from '../lib/http.js';
import {providerStatus} from '../lib/research/providers.js';
export default async function handler(req,res) {
  headers(res);
  if(req.method!=='GET'){res.setHeader('Allow','GET');return failure(res,new AppError('METHOD_NOT_ALLOWED',405));}
  try {const db=database();await db.rpc('wse_expire_searches',{});const searches=await db.recent();
    return res.status(200).json({success:true,searches,provider:providerStatus()});
  }catch(error){return failure(res,error);}
}
