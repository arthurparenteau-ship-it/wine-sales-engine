import {AppError,boundedJSON} from './http.js';
export const searchFields='id,market,prospect_type,product_focus,status,prospects_found,created_at,updated_at,error_code,metrics';
export function database(env=process.env) {
  let origin; const key=env.SUPABASE_SECRET_KEY?.trim();
  try { origin=new URL(env.SUPABASE_URL?.trim());
    if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||!key?.startsWith('sb_secret_')||/\s/.test(key)) throw Error();
  } catch { throw new AppError('CONFIGURATION_ERROR',500); }
  async function request(path, {method='GET',body,signal,prefer}={}) {
    // GET and assignment-only PATCH calls can safely retry a transient connection
    // failure. Never replay POST RPCs: their transaction may already have committed.
    let response;
    const attempts = method === 'GET' || method === 'PATCH' ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const timeout = AbortSignal.timeout(attempts === 2 ? 5000 : 10000);
      try {
        response = await fetch(new URL(`/rest/v1/${path}`, origin), {
          method, redirect:'error',
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
          headers:{apikey:key, Accept:'application/json', ...(body ? {'Content-Type':'application/json'} : {}), ...(prefer ? {Prefer:prefer} : {})},
          ...(body ? {body:JSON.stringify(body)} : {})
        });
        break;
      } catch {
        if (!signal?.aborted && attempt + 1 < attempts) continue;
        throw new AppError(signal?.aborted || timeout.aborted ? 'TIMEOUT' : 'DATABASE_UNAVAILABLE');
      }
    }
    if(!response.ok) { await response.body?.cancel(); throw new AppError('DATABASE_UNAVAILABLE'); }
    if(response.status===204) return null;
    return boundedJSON(response,1500000);
  }
  return {request, rpc:(name,body,signal)=>request(`rpc/${name}`,{method:'POST',body,signal}),
    async recent(id) { const query=new URLSearchParams({select:searchFields,order:'created_at.desc',limit:'20'});if(id)query.set('id',`eq.${id}`);
      return request(`searches?${query}`); }
  };
}
