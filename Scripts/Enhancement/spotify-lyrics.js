/* Spotify lyrics fallback for Egern native ctx API. Experimental client integration.
 * Sources: LRCLIB + NetEase. No audio downloads or third-party executable sources.
 */
const MANUAL = {
  // 'Spotify的22位歌曲ID': {title:'歌名', artists:['歌手'], album:'专辑', duration:240},
};
const norm = s => String(s || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
const versions = s => ['live','remix','instrumental','karaoke','acoustic','现场','伴奏'].filter(x => String(s).toLowerCase().includes(x)).join(',');
function score(t, c) {
  if (norm(t.title) !== norm(c.title) || versions(t.title) !== versions(c.title)) return -1;
  if (!t.artists.some(a => c.artists.some(b => norm(a) === norm(b)))) return -1;
  const delta = Math.abs((t.duration || 0) - (c.duration || 0));
  if (t.duration && c.duration && delta > 5) return -1;
  return 80 + (norm(t.album) && norm(t.album) === norm(c.album) ? 15 : 0) + (delta < 2 ? 5 : 0);
}
function parseLRC(text) {
  const offset = Number(String(text).match(/\[offset:([+-]?\d+)\]/i)?.[1] || 0);
  const lines = [];
  for (const row of String(text || '').split(/\r?\n/)) {
    const tags = [...row.matchAll(/\[(\d+):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    const words = row.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of tags) {
      if (+m[2] >= 60) continue;
      lines.push({ startTimeMs: String(Math.max(0, +m[1]*60000 + +m[2]*1000 + +(m[3] || '').padEnd(3,'0') + offset)), words, syllables: [], endTimeMs:'0' });
    }
  }
  return lines.sort((a,b) => +a.startTimeMs - +b.startTimeMs);
}
function lyricData(c, synced, plain) {
  let lines = parseLRC(synced), syncType = 'LINE_SYNCED';
  if (!lines.some(l => l.words)) {
    syncType = 'UNSYNCED';
    lines = String(plain || '').split(/\r?\n/).map(words => ({startTimeMs:'0', words:words.trim(), syllables:[], endTimeMs:'0'})).filter(l => l.words);
  }
  if (!lines.some(l => l.words) || lines.length > 3000) return null;
  return {lyrics:{syncType, lines, provider:c.source, providerLyricsId:String(c.id), providerDisplayName:c.source, syncLyricsUri:'', isDenseTypeface:false, alternatives:[], language:'', isRtlLanguage:false}, colors:{background:-16777216,text:-1,highlightText:-1}, hasVocalRemoval:false};
}
async function json(ctx, url, headers = {}) {
  const r = await ctx.http.get(url, {headers, timeout:4500, credentials:'omit', redirect:'error'});
  if (r.status !== 200) {
    const e = new Error(`${new URL(url).hostname}: HTTP ${r.status}`);
    e.status = r.status;
    const retry = r.headers?.get?.('retry-after');
    e.retryMs = /^\d+$/.test(retry || '') ? Number(retry)*1000 : Math.max(0, Date.parse(retry || '')-Date.now()) || 60000;
    throw e;
  }
  return r.json();
}
function metadataCache(ctx, id) {
  try {
    let d=ctx.storage.getJSON('DualSubs');
    if (typeof d==='string') d=JSON.parse(d);
    let rows=d?.Spotify?.Caches?.Metadatas?.Tracks;
    if (typeof rows==='string') rows=JSON.parse(rows);
    const r=Array.isArray(rows)?rows.find(x=>x[0]===id)?.[1]:rows?.[id];
    if (r?.track && r?.artist) return {title:r.track,artists:[r.artist],album:r.album,duration:0};
  } catch (_) {}
  return null;
}
function trackMetadata(r, expected) {
  if (!r || typeof r !== 'object') return null;
  const uri = r.uri || r.track?.uri;
  const id = /^spotify:track:([A-Za-z0-9]{22})$/.exec(uri || '')?.[1] || r.id;
  if (!/^[A-Za-z0-9]{22}$/.test(id || '') || (expected && id !== expected)) return null;
  const title = r.name || r.title || r.metadata?.title;
  const artists = (Array.isArray(r.artists) ? r.artists : r.artists?.items || [])
    .map(a => a.name || a.profile?.name).filter(a => typeof a === 'string' && a.trim());
  if (!artists.length && r.metadata?.artist_name) artists.push(r.metadata.artist_name);
  if (typeof title !== 'string' || !title.trim() || !artists.length) return null;
  const ms = r.duration_ms || r.duration?.totalMilliseconds || (typeof r.duration === 'number' ? r.duration : 0) || Number(r.metadata?.duration);
  return {id, title, artists, album:r.album?.name || r.albumOfTrack?.name || r.metadata?.album_title || '', duration:Number.isFinite(ms) && ms>0 ? ms/1000 : 0};
}
function collectMetadata(root) {
  const found = {}, pending=[root]; let count=0;
  while(pending.length && count++<30000) {
    const r=pending.pop();
    if(!r || typeof r!=='object') continue;
    const t=trackMetadata(r);
    if(t) found[t.id]=t;
    for(const v of Object.values(r)) if(v && typeof v==='object') pending.push(v);
  }
  return found;
}
function embedMetadata(html,id) {
  const tag=html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if(!tag) throw new Error('嵌入页缺少结构化歌曲信息');
  const d=JSON.parse(tag[1]);
  const t=trackMetadata(d.props?.pageProps?.state?.data?.entity,id);
  if(!t) throw new Error('嵌入页歌曲 ID 或元数据不匹配');
  return t;
}
async function publicMetadata(ctx,id) {
  const key='spotify-embed-retry-at', until=Number(ctx.storage.getJSON(key)||0);
  if(until>Date.now()) throw new Error('公开歌曲页冷却中，请稍后重试');
  const r=await ctx.http.get(`https://open.spotify.com/embed/track/${id}`, {
    headers:{Accept:'text/html'}, timeout:6000, credentials:'omit', redirect:'error'
  });
  if(r.status!==200) {
    if(r.status===429) {
      const v=r.headers?.get?.('retry-after');
      const wait=/^\d+$/.test(v||'') ? +v*1000 : Math.max(0,Date.parse(v||'')-Date.now())||60000;
      ctx.storage.setJSON(key,Date.now()+Math.max(1000,wait));
    }
    throw new Error(`open.spotify.com: HTTP ${r.status}`);
  }
  return embedMetadata(await r.text(),id);
}
async function lrclib(ctx,t) {
  const query = new URLSearchParams({track_name:t.title, artist_name:t.artists[0]});
  const rows = await json(ctx, `https://lrclib.net/api/search?${query}`);
  const candidates = (Array.isArray(rows) ? rows : []).map(r => ({...r, title:r.trackName, artists:[r.artistName], album:r.albumName, source:'LRCLIB'})).filter(c => score(t,c)>=80 && !c.instrumental).sort((a,b)=>score(t,b)-score(t,a));
  return candidates.map(c=>lyricData(c,c.syncedLyrics,c.plainLyrics)).find(Boolean) || null;
}
async function netease(ctx,t) {
  const headers = {Referer:'https://music.163.com'};
  const query = new URLSearchParams({type:'1',limit:'12',s:`${t.title} ${t.artists[0]}`});
  const data = await json(ctx,`https://music.163.com/api/cloudsearch/pc?${query}`,headers);
  const candidates = (data.result?.songs || []).map(r=>({id:r.id,title:r.name,artists:(r.ar||r.artists||[]).map(a=>a.name),album:(r.al||r.album)?.name,duration:(r.dt||r.duration)/1000,source:'NetEase'})).filter(c=>score(t,c)>=80).sort((a,b)=>score(t,b)-score(t,a)).slice(0,2);
  for (const c of candidates) {
    const r = await json(ctx,`https://music.163.com/api/song/lyric?id=${encodeURIComponent(c.id)}&lv=-1&tv=-1`,headers);
    if (r.nolyric || r.uncollected) continue;
    const data = lyricData(c,r.lrc?.lyric,null);
    if (data) return data;
  }
  return null;
}
// Minimal ColorLyrics protobuf writer: only core lyrics fields are emitted.
// App protocol is unofficial; validate on the target Spotify version.
function varint(n) { const a=[]; do { let b=n%128; n=Math.floor(n/128); a.push(b|(n?128:0)); } while(n); return a; }
function field(n,b) { return [...varint(n*8+2),...varint(b.length),...b]; }
function str(n,s) { return field(n,[...new TextEncoder().encode(s)]); }
function protobuf(data) {
  const l=data.lyrics;
  let lyrics=[8,l.syncType==='LINE_SYNCED'?1:0];
  for (const row of l.lines) lyrics.push(...field(2,[8,...varint(+row.startTimeMs),...str(2,row.words)]));
  lyrics.push(...str(3,l.provider),...str(4,l.providerLyricsId),...str(5,l.providerDisplayName));
  return new Uint8Array(field(1,lyrics));
}
export default async function(ctx) {
  console.log('[Lyrics] v1.3 已触发');
  if (!ctx?.request || !ctx?.response) {
    console.log('[Lyrics] 缺少原生 ctx 请求/响应对象，请检查 Egern 脚本 API 兼容性');
    return;
  }
  const requestURL=new URL(ctx.request.url);
  if(!requestURL.pathname.startsWith('/color-lyrics/v2/track/')) {
    if(ctx.response.status!==200) return;
    const contentType=ctx.response.headers?.get?.('content-type') || '';
    if(!contentType.includes('json')) return;
    let original;
    try {
      original=await ctx.response.text();
      const found=collectMetadata(JSON.parse(original));
      const n=Object.keys(found).length;
      if(n) {
        const cache=ctx.storage.getJSON('spotify-metadata-v1')||{};
        for(const [id,t] of Object.entries(found)) {delete cache[id];cache[id]=t;}
        ctx.storage.setJSON('spotify-metadata-v1',Object.fromEntries(Object.entries(cache).slice(-200)));
        console.log(`[Lyrics] 已采集 ${n} 首歌曲元数据`);
      }
    } catch(e) {console.log('[Lyrics] 元数据采集跳过：'+e.message);}
    // Explicitly restore consumed stream, including malformed JSON.
    return original===undefined ? undefined : {body:original};
  }
  const match = ctx.request.url.match(/\/color-lyrics\/v2\/track\/([A-Za-z0-9]{22})(?:[/?]|$)/);
  if (!match) {
    console.log('[Lyrics] 跳过：URL 中未识别到 22 位歌曲 ID');
    return;
  }
  console.log(`[Lyrics] track=${match[1]}, HTTP=${ctx.response.status}`);
  // Preserve successful official lyrics and auth/rate-limit/server failures.
  if (ctx.response.status !== 404) {
    console.log('[Lyrics] 跳过：本版仅补 HTTP 404；200 响应（包括空歌词）也保留原样');
    return;
  }
  console.log('[Lyrics] 命中 404，开始检查缓存和外部歌词');
  const id=match[1], key='spotify-lyrics-v1';
  try {
    const cache=ctx.storage.getJSON(key)||{};
    let data=cache[id]?.expires>Date.now()?cache[id].data:null;
    if (!data) {
      const ownMetadata=ctx.storage.getJSON('spotify-metadata-v1')||{};
      let t=MANUAL[id] || ownMetadata[id] || metadataCache(ctx,id);
      if (t) console.log('[Lyrics] 使用已有歌曲信息，无需请求 Spotify 曲目接口');
      if (!t) {
        console.log('[Lyrics] 缓存未命中，读取 Spotify 公开嵌入页');
        t=await publicMetadata(ctx,id);
        console.log(`[Lyrics] 获取歌曲信息成功：${t.title} / ${t.artists.join('、')}`);
      }
      if (!t.title || !t.artists?.length) throw new Error('歌曲信息不完整');
      delete ownMetadata[id];
      ownMetadata[id]=t;
      ctx.storage.setJSON('spotify-metadata-v1',Object.fromEntries(Object.entries(ownMetadata).slice(-200)));
      const results=await Promise.allSettled([lrclib(ctx,t),netease(ctx,t)]);
      const found=[];
      results.forEach((r,i)=>{ if(r.status==='fulfilled'&&r.value) found.push(r.value); else console.log(`[Lyrics] ${['LRCLIB','NetEase'][i]}: ${r.status==='rejected'?r.reason.message:'没有匹配歌词'}`); });
      data=found.find(x=>x.lyrics.syncType==='LINE_SYNCED')||found[0];
      if (!data) return;
      cache[id]={expires:Date.now()+86400000,data};
      const keep=Object.entries(cache).filter(([,v])=>v.expires>Date.now()).sort((a,b)=>b[1].expires-a[1].expires).slice(0,60);
      ctx.storage.setJSON(key,Object.fromEntries(keep));
    }
    const url=new URL(ctx.request.url);
    const isJSON=url.searchParams.get('format')==='json'||ctx.request.headers.get('accept')?.includes('application/json');
    console.log(`[Lyrics] ${id}: ${data.lyrics.provider} / ${data.lyrics.syncType}`);
    return {status:200,headers:{'Content-Type':isJSON?'application/json; charset=utf-8':'application/protobuf','Cache-Control':'no-store'},body:isJSON?JSON.stringify(data):protobuf(data)};
  } catch(e) { console.log(`[Lyrics] 补词失败，保留原响应: ${e.message}`); }
}
export {parseLRC,score,lyricData,protobuf,collectMetadata,embedMetadata};
