/* DualSubs external-lyrics source selector. Original addition, 2026-09-20.
 * Transport is injected from DualSubs; never forwards Spotify request headers.
 */
async function resolveBestLyrics(track, transport, log = console.log) {
  if (!track?.track || !track?.artist) throw Error('DualSubs 没有缓存到歌名/歌手，保留原响应');
  const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
  const versions=s=>['live','remix','instrumental','karaoke','acoustic','cover','现场','伴奏','钢琴','翻唱'].filter(v=>String(s||'').toLowerCase().includes(v)).join(',');
  const timed=s=>/\[\d+:\d{2}(?:[.:]\d+)?\]/.test(s||'');
  const plain=s=>typeof s==='string' && s.replace(/\[[^\]]*\]/g,'').trim().length>0;
  const query=p=>Object.entries(p).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
  const score=c=>{
    if(norm(c.title)!==norm(track.track) || versions(c.title)!==versions(track.track)) return -1;
    if(!c.artists.some(a=>norm(a)===norm(track.artist))) return -1;
    const seconds=Number(track.duration_ms)/1000 || Number(track.duration) || 0;
    if(seconds && c.duration && Math.abs(seconds-c.duration)>5) return -1;
    return 100+(track.album&&norm(c.album)===norm(track.album)?15:0)+(seconds&&c.duration&&Math.abs(seconds-c.duration)<=2?5:0);
  };
  async function request(url,body,referer) {
    const options={url,method:body?'POST':'GET',timeout:4000,headers:{Accept:'application/json'}};
    if(referer)options.headers.Referer=referer;
    if(body){options.body=JSON.stringify(body);options.headers['Content-Type']='application/json';}
    // Transport timeout plus a hard promise deadline; late results cannot affect selection.
    let timer;
    try {
      const r=await Promise.race([transport(options),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('请求超时')),4000);})]);
      const code=r.statusCode??r.status;
      if(code && Number(code)!==200)throw Error('HTTP '+code);
      return JSON.parse(r.body);
    } finally {clearTimeout(timer);}
  }
  const candidates=(rows)=>rows.map(c=>({...c,matchScore:score(c)})).filter(c=>c.matchScore>=100).sort((a,b)=>b.matchScore-a.matchScore).slice(0,2);
  function quality(c,l) {
    const word=!!l.klyric && /\(\d+,\d+,\d+\)/.test(l.klyric);
    const line=timed(l.lyric)&&plain(l.lyric);
    const text=plain(l.plain);
    if(!word&&!line&&!text)return null;
    if(/^(纯音乐|此歌曲为没有填词的纯音乐)/.test(String(l.lyric||'').replace(/\[[^\]]*\]/g,'').trim()))return null;
    return {...l,source:c.source,id:String(c.id),matchScore:c.matchScore,qualityScore:(word?30:line?20:0)+(timed(l.tlyric)?3:0),plain:line||word?'':l.plain};
  }
  async function netease(){
    const d=await request('https://music.163.com/api/cloudsearch/pc?'+query({s:track.track+' '+track.artist,type:1,limit:15}),null,'https://music.163.com');
    const cs=candidates((d.result?.songs||[]).map(x=>({source:'NeteaseMusic',id:x.id,title:x.name,artists:(x.ar||x.artists||[]).map(a=>a.name),album:(x.al||x.album)?.name,duration:(x.dt||x.duration)/1000})));
    return Promise.all(cs.map(async c=>{try{const d=await request('https://music.163.com/api/song/lyric?'+query({id:c.id,lv:-1,yv:-1,tv:-1}),null,'https://music.163.com');return quality(c,{lyric:d.lrc?.lyric,klyric:d.yrc?.lyric,tlyric:d.tlyric?.lyric,lyricUser:d.lyricUser?.nickname});}catch(e){log('[MultiLyrics] 网易候选失败: '+e.message);return null;}}));
  }
  async function qq(){
    const key='music.search.SearchCgiService';
    const d=await request('https://u.y.qq.com/cgi-bin/musicu.fcg',{[key]:{module:key,method:'DoSearchForQQMusicDesktop',param:{query:track.track+' '+track.artist,num_per_page:15,page_num:1,search_type:0}}},'https://y.qq.com');
    const cs=candidates((d[key]?.data?.body?.song?.list||[]).map(x=>({source:'QQMusic',id:x.mid,title:x.name,artists:(x.singer||[]).map(a=>a.name),album:x.album?.name,duration:x.interval})));
    return Promise.all(cs.map(async c=>{try{const d=await request('https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?'+query({songmid:c.id,g_tk:5381,format:'json',nobase64:1}),null,'https://y.qq.com');return quality(c,{lyric:d.lyric,tlyric:d.trans});}catch(e){log('[MultiLyrics] QQ候选失败: '+e.message);return null;}}));
  }
  async function lrclib(){
    const d=await request('https://lrclib.net/api/search?'+query({track_name:track.track,artist_name:track.artist}));
    return candidates((Array.isArray(d)?d:[]).filter(x=>!x.instrumental).map(x=>({...x,source:'LRCLIB',title:x.trackName,artists:[x.artistName],album:x.albumName}))).map(c=>quality(c,{lyric:c.syncedLyrics,plain:c.plainLyrics}));
  }
  const settled=await Promise.allSettled([netease(),qq(),lrclib()]);
  const all=[];
  settled.forEach((r,i)=>{const name=['网易云','QQ音乐','LRCLIB'][i];if(r.status==='fulfilled'){const valid=r.value.filter(Boolean);all.push(...valid);log(`[MultiLyrics] ${name}: ${valid.length} 个匹配歌词`);}else log(`[MultiLyrics] ${name}: ${r.reason.message}`);});
  // Identity/album confidence comes first; timing and translation break ties.
  all.sort((a,b)=>b.matchScore-a.matchScore||b.qualityScore-a.qualityScore||a.source.localeCompare(b.source));
  if(!all.length)throw Error('所有来源无可靠匹配，保留原响应');
  const best=all[0];log(`[MultiLyrics] 选用 ${best.source}，匹配=${best.matchScore}，歌词质量=${best.qualityScore}`);
  return best;
}
