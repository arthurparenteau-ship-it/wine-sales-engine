import operator from '../api/operator.js';
import workspace from '../api/workspace.js';
import cron from '../api/cron.js';
import brief from '../api/brief.js';
// Minimal local Vercel-style adapter; exact route/file allowlists, no directory traversal.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import companies from '../api/companies.js';
import company from '../api/company.js';
import signals from '../api/signals.js';
import search from '../api/search.js';
import searches from '../api/searches.js';
const routes={'/api/operator':operator,'/api/workspace':workspace,'/api/cron':cron,'/api/brief':brief,'/api/companies':companies,'/api/company':company,'/api/signals':signals,'/api/search':search,'/api/searches':searches};
const assets={'/public-js/workspace.js':['public-js/workspace.js','text/javascript'],'/public-js/intelligence.js':['public-js/intelligence.js','text/javascript'],'/public-js/filters.js':['public-js/filters.js','text/javascript'],'/':['index.html','text/html'],'/index.html':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/styles.css':['styles.css','text/css'],'/public-js/search.js':['public-js/search.js','text/javascript']};
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  res.status=n=>{res.statusCode=n;return res;};res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
  try {
    if(routes[url.pathname]) {
      req.query=Object.fromEntries(url.searchParams);
      for(const key of url.searchParams.keys())if(url.searchParams.getAll(key).length>1)req.query[key]=url.searchParams.getAll(key);
      if(req.method==='POST') {
        let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>2048)return res.status(413).json({success:false,error:{code:'TOO_LARGE'}});}
        try{req.body=JSON.parse(body);}catch{return res.status(400).json({success:false,error:{code:'INVALID_INPUT'}});}
      }
      await routes[url.pathname](req,res);
    } else if(assets[url.pathname]&&req.method==='GET') {
      const [file,type]=assets[url.pathname];res.setHeader('Content-Type',type);res.end(await readFile(new URL(`../${file}`,import.meta.url)));
    }else res.status(404).json({success:false});
  }catch{if(!res.headersSent)res.status(500).json({success:false,error:{code:'LOCAL_SERVER_ERROR'}});else res.end();}
}).listen(Number(process.env.PORT)||3000,'127.0.0.1',()=>console.info(`Wine Sales Engine: http://127.0.0.1:${process.env.PORT||3000}`));
