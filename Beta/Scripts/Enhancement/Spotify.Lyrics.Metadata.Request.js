function trackId(url){
  const token=String(url||'').match(/\/metadata\/\d+\/track\/([a-f\d]{32}|[A-Za-z\d]{22})(?:[\/?]|$)/i)?.[1]||'';
  if(token.length===32)return token;
  return token||'unknown';
}

export default async function(ctx){
  const request=ctx.request||{},method=String(request.method||'GET').toUpperCase(),id=trackId(request.url);
  if(method==='OPTIONS'){
    console.log('[MultiLyrics] metadata request method=OPTIONS track='+id+'，原样放行等待真实 GET');
    return;
  }
  if(method!=='GET'){
    console.log('[MultiLyrics] metadata request method='+method+' track='+id+'，原样放行');
    return;
  }
  const url=String(request.url)+(String(request.url).includes('?')?'&':'?')+'lyrics_nonce='+Date.now().toString(36);
  // Only change the query string. Do not change request headers: custom
  // Cache-Control/Accept-Encoding headers can create another CORS preflight.
  console.log('[MultiLyrics] metadata request method=GET track='+id+'，仅使用 nonce 刷新资料');
  return {url};
}
