import companyHandler from './company.js';
import {approach} from '../lib/approach.js';
import {headers,failure,AppError} from '../lib/http.js';
export default async function handler(req,res) {
 headers(res);if(req.method!=='GET'){res.setHeader('Allow','GET');return failure(res,new AppError('METHOD_NOT_ALLOWED',405));}
 let payload,status;
 const capture={setHeader(){},status(n){status=n;return this;},json(v){payload=v;return this;}};
 await companyHandler(req,capture);
 if(status!==200)return res.status(status).json(payload);
 return res.status(200).json({success:true,brief:approach(payload.company,payload.intelligence,req.query?.language==='en'?'en':'fr')});
}
