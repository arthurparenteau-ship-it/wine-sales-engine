export class AppError extends Error {
  constructor(code, status = 502) { super(code); this.code = code; this.status = status; }
}
export const messages = {
  INVALID_INPUT:'Choose a supported market, prospect type and product focus.', INVALID_ID:'A valid ID is required.',
  METHOD_NOT_ALLOWED:'This HTTP method is not supported.', CONFIGURATION_ERROR:'Server database configuration is unavailable.',
  PROVIDER_UNAVAILABLE:'Research provider unavailable. Configure RESEARCH_PROVIDER=brave and BRAVE_SEARCH_API_KEY on the server.',
  PROVIDER_FAILED:'The research provider could not complete this search.', TIMEOUT:'Research timed out. Please retry.',
  DATABASE_UNAVAILABLE:'The database is temporarily unavailable.', RATE_LIMITED:'Search limit reached. Please try again later.',
  SEARCH_BUSY:'Another search is running. Please wait.', NOT_FOUND:'Search not found.', FORBIDDEN:'This request origin is not allowed.',
  INVALID_RESPONSE:'An upstream service returned an invalid response.', TOO_LARGE:'The request or response is too large.',
  IDEMPOTENCY_CONFLICT:'This request ID belongs to different search inputs.', SEARCH_EXPIRED:'Search interrupted or timed out. Please retry.'
};
export function failure(res, error) {
  const code = error instanceof AppError && messages[error.code] ? error.code : 'DATABASE_UNAVAILABLE';
  return res.status(error instanceof AppError ? error.status : 502).json({success:false,error:{code,message:messages[code]}});
}
export function headers(res) { res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff'); }
export async function boundedJSON(response, limit = 512000) {
  if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new AppError('TOO_LARGE'); }
  const reader = response.body?.getReader();
  if (!reader) throw new AppError('INVALID_RESPONSE');
  let size=0; const chunks=[];
  try {
    for (;;) { const {value,done}=await reader.read(); if(done) break; size+=value.byteLength;
      if(size>limit) throw new AppError('TOO_LARGE'); chunks.push(value); }
  } catch(error) { await reader.cancel().catch(()=>{}); throw error; }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AppError('INVALID_RESPONSE'); }
}
export function log(searchId,stage,counts={}) { console.info(JSON.stringify({searchId,stage,...counts})); }
