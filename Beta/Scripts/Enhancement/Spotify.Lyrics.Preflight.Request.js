/* Egern native request script for Spotify color-lyrics CORS preflight. */
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

function preflightResponse(request){
  const origin=header(request.headers,'origin')||'https://xpui.app.spotify.com';
  const requestedMethod=header(request.headers,'access-control-request-method')||'GET';
  const requestedHeaders=header(request.headers,'access-control-request-headers')||'accept,authorization,origin,content-type,spotify-app-version,app-platform,client-token';
  const headers={
    'Access-Control-Allow-Origin':origin,
    'Access-Control-Allow-Credentials':'true',
    'Access-Control-Allow-Methods':requestedMethod+', OPTIONS',
    'Access-Control-Allow-Headers':requestedHeaders,
    'Access-Control-Max-Age':'60',
    'Vary':'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'
  };
  if(header(request.headers,'access-control-request-private-network'))headers['Access-Control-Allow-Private-Network']='true';
  return {status:200,headers,body:''};
}

export default async function(ctx){
  const request=ctx.request||{},method=String(request.method||'GET').toUpperCase();
  if(method!=='OPTIONS')return;
  console.log('[MultiLyrics] color-lyrics request method=OPTIONS，原生返回 CORS 预检响应');
  return ctx.respond(preflightResponse(request));
}
