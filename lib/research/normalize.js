// These URLs are validated for identity/citation only. The server NEVER fetches candidate URLs.
export function publicURL(value) {
  if(typeof value!=='string'||value.length>2048||/[\s\u0000-\u001f\u007f]/.test(value))return null;
  try {const u=new URL(value);const h=u.hostname.toLowerCase();
    if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port||!h.includes('.')||
      h.endsWith('.local')||h.endsWith('.localhost')||h.endsWith('.internal')||h==='localhost'||h.includes(':')||/^[\d.]+$/.test(h))return null;
    u.hostname=h.replace(/\.$/,'');u.hash='';return u.href;
  }catch{return null;}
}
export const domain=value=>{const url=publicURL(value);return url?new URL(url).hostname.replace(/^www\./,'').toLowerCase():null;};
export const normalizedName=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
