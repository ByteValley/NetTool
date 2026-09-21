
/* Egern native request script for Spotify metadata. */
function header(headers,name){
  if(!headers)return '';
  if(typeof headers.get==='function'){
    const value=headers.get(name);
    if(value!=null)return Array.isArray(value)?value.join(', '):String(value);
  }
  if(typeof headers.entries==='function'){
    for(const [key,value] of headers.entries())if(String(key).toLowerCase()===name.toLowerCase())return String(value);
  }
  for(const [key,value] of Object.entries(headers))if(key.toLowerCase()===name.toLowerCase())return Array.isArray(value)?value.join(', '):String(value);
  return '';
}
function copyHeaders(headers){
  const out={};
  if(!headers)return out;
  if(typeof headers.entries==='function')for(const [name,value] of headers.entries())out[name]=value;
  else Object.assign(out,headers);
  return out;
}
function trackId(url){
  const token=String(url||'').match(/\/metadata\/\d+\/track\/([a-f\d]{32}|[A-Za-z\d]{22})(?:[\/?]|$)/i)?.[1]||'';
  if(token.length===32)return token;
  return token||'unknown';
}
export default async function(ctx){
  const request=ctx.request||{},method=String(request.method||'GET').toUpperCase(),id=trackId(request.url);
  if(method==='OPTIONS'){
    // Let Spotify's upstream CORS response reach the browser. A synthetic
    // response makes Chromium stop after OPTIONS on some desktop builds.
    console.log('[MultiLyrics] metadata request method=OPTIONS track='+id+'，原样放行等待真实 GET');
    return;
  }
  if(method!=='GET'){
    console.log('[MultiLyrics] metadata request method='+method+' track='+id+'，原样放行');
    return;
  }
  const headers=copyHeaders(request.headers);
  for(const key of Object.keys(headers))if(['if-none-match','if-modified-since','cache-control','pragma'].includes(key.toLowerCase()))delete headers[key];
  headers['Accept-Encoding']='identity';
  headers['Cache-Control']='no-cache';
  const url=String(request.url)+(String(request.url).includes('?')?'&':'?')+'lyrics_nonce='+Date.now().toString(36);
  console.log('[MultiLyrics] metadata request method=GET track='+id+'，要求返回完整资料，已禁用请求缓存');
  return {url,headers};
}
