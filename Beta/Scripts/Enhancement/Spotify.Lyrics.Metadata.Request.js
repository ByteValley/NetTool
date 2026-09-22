function trackId(url){
  const token=String(url||'').match(/\/metadata\/\d+\/track\/([a-f\d]{32}|[A-Za-z\d]{22})(?:[/?]|$)/i)?.[1]||'';
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
  const rawUrl=String(request.url);
  // Egern can replay a request that has already been refreshed (and our
  // diagnostics may also include a nonce). Do not append a second nonce:
  // Spotify returns HTTP 400 for duplicate `lyrics_nonce` parameters.
  if(/[?&]lyrics_nonce=[^&#]*/i.test(rawUrl)){
    console.log('[MultiLyrics] metadata request method=GET track='+id+'，已有 nonce，原样放行');
    return;
  }
  const url=rawUrl+(rawUrl.includes('?')?'&':'?')+'lyrics_nonce='+Date.now().toString(36);
  // Only change the query string. Adding Cache-Control/Accept-Encoding here
  // causes Chromium to send another CORS preflight and can prevent the real
  // metadata GET from being issued. A nonce is enough to bypass Spotify's
  // cached `has_lyrics=false` result without changing the CORS shape.
  console.log('[MultiLyrics] metadata request method=GET track='+id+'，仅使用 nonce 刷新资料');
  return {url};
}
