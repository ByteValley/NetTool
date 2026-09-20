async function resolveSpotifyMetadata(track, id, transport, storage, log=console.log) {
  if(track?.track && track?.artist) return track;
  if(!/^[A-Za-z0-9]{22}$/.test(id||'')) throw Error('缺少有效 Spotify track ID');
  const key='MultiLyrics.Metadata.'+id;
  try {const cached=JSON.parse(storage.getItem(key)||'null');if(cached?.id===id&&cached.track&&cached.artist){log('[MultiLyrics] 命中歌曲资料缓存');return cached;}}catch{}
  log('[MultiLyrics] DualSubs 歌曲资料缺失，读取 Spotify 公开嵌入页');
  let timer;
  try {
    const response=await Promise.race([transport({url:'https://open.spotify.com/embed/track/'+id,method:'GET',headers:{Accept:'text/html'},timeout:5000}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('歌曲资料请求超时')),5000)})]);
    if(Number(response.statusCode??response.status)!==200)throw Error('歌曲资料 HTTP '+(response.statusCode??response.status));
    const match=String(response.body||'').match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if(!match)throw Error('歌曲资料页面缺少结构化数据');
    const entity=JSON.parse(match[1])?.props?.pageProps?.state?.data?.entity;
    if(entity?.id!==id&&entity?.uri!=='spotify:track:'+id)throw Error('歌曲资料 ID 不一致');
    const result={id,track:entity.name||entity.title,artist:entity.artists?.[0]?.name,duration_ms:entity.duration};
    if(!result.track||!result.artist)throw Error('歌曲资料缺少歌名或歌手');
    storage.setItem(key,JSON.stringify(result));log('[MultiLyrics] 歌曲资料已补齐，开始多源检索');return result;
  } finally {clearTimeout(timer);}
}
