import {createHash, createHmac, timingSafeEqual, randomBytes} from 'node:crypto';
import {AppError} from './http.js';
export const operatorConfigured = () => typeof process.env.WSE_OPERATOR_KEY === 'string' && process.env.WSE_OPERATOR_KEY.length >= 32;
export const equalSecret = (a,b) => typeof a === 'string' && typeof b === 'string' && timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
const signature = value => createHmac('sha256',process.env.WSE_OPERATOR_KEY).update(value).digest('base64url');
export function sessionToken(now=Date.now()) {
 if(!operatorConfigured())throw new AppError('OPERATOR_NOT_CONFIGURED',503);
 const payload=`${now + 8*60*60*1000}.${randomBytes(24).toString('base64url')}`;
 return `${payload}.${signature(payload)}`;
}
export function isOperator(req,now=Date.now()) {
 if(!operatorConfigured())return false;
 const cookie=String(req.headers?.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('wse_session='))?.slice(12);
 if(!cookie||cookie.length>200)return false;
 const parts=cookie.split('.');if(parts.length!==3||!/^\d+$/.test(parts[0]))return false;
 const expiry=Number(parts[0]);return expiry>now&&expiry<=now+8*60*60*1000&&equalSecret(parts[2],signature(parts.slice(0,2).join('.')));
}
export function requireOperator(req) {if(!isOperator(req))throw new AppError('UNAUTHORIZED',401);}
export function sessionCookie(value,maxAge=28800) {
 return `wse_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.VERCEL||process.env.NODE_ENV==='production'?'; Secure':''}`;
}

export const internalSearch = Symbol("internalSearch");
