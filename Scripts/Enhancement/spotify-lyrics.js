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
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  return r.json();
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
  console.log('[Lyrics] v1.1 已触发');
  if (!ctx?.request || !ctx?.response) {
    console.log('[Lyrics] 缺少原生 ctx 请求/响应对象，请检查 Egern 脚本 API 兼容性');
    return;
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
      let t=MANUAL[id];
      if (!t) {
        const token=ctx.request.headers.get('authorization');
        if (!token) throw new Error('没有 Spotify authorization；可在 MANUAL 填写歌曲信息');
        // Token goes only to Spotify, never to lyrics providers; redirects prohibited.
        const r=await json(ctx,`https://api.spotify.com/v1/tracks/${id}`,{Authorization:token,Accept:'application/json'});
        t={title:r.name,artists:(r.artists||[]).map(a=>a.name),album:r.album?.name,duration:r.duration_ms/1000};
      }
      if (!t.title || !t.artists?.length) throw new Error('歌曲信息不完整');
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
export {parseLRC,score,lyricData,protobuf};
