const NAME="京东比价(min)";
const ARG=parseArg($argument);

// 入口
(() => {
  try{
    const url = ($request && $request.url) || "";
    if(!url) return done();

    // 状态查询
    if(/^https?:\/\/(in|item)\.m\.jd\.com\/__\/jdprice_check$/.test(url)){
      return statusCheck();
    }

    // 捕获 token
    if(/apapia-sqk-weblogic\.manmanbuy\.com\/baoliao\/center\/menu$/.test(url)){
      return captureToken();
    }

    // 商品页（响应命中）
    if(/^https?:\/\/(in|item)\.m\.jd\.com\//.test(url)){
      // 1. 命中就先弹
      notify(`${NAME}｜商品页命中`, "", url.slice(0,160));
      // 2. 提取ID
      const id = extractId(url);
      if(!id){ notify(`${NAME}｜未识别商品ID`, "", url); return done({}); }
      // 3. 查价
      return queryHistory(id);
    }

    done();
  }catch(e){
    notify(`${NAME}｜异常`, "", String(e && (e.stack||e)));
    done();
  }
})();

// —— 历史价查询 ——
async function queryHistory(jdId){
  try{
    const devId = getToken();
    if(!devId){
      notify(`${NAME}｜缺少 token`, "先打开慢慢买App → 我的", "或给脚本加 argument=token=你的c_mmbDevId");
      return done({});
    }

    const shareBody = {
      methodName:"trendJava",
      spbh:`1|${jdId}`,
      url:`https://item.jd.com/${jdId}.html`,
      t: Date.now().toString(),
      c_appver:"4.8.3.1",
      c_mmbDevId: devId
    };
    const secret="3E41D1331F5DDAFCD0A38FE2D52FF66F";
    const tokenSrc = encodeURIComponent(secret + jsonToCustomString(shareBody) + secret);
    shareBody.token = md5(tokenSrc).toUpperCase();

    const h1 = {"Content-Type":"application/x-www-form-urlencoded; charset=utf-8","User-Agent":"Mozilla/5.0 (iPhone) mmbWebBrowse ios"};
    const r1 = await post("https://apapia-history-weblogic.manmanbuy.com/app/share", h1, toQuery(shareBody));
    const j1 = toJson(r1.body);
    if(j1.code!==2000 || !j1.data) throw new Error(`share失效:${j1.msg||"no data"}`);

    const sp = new URL(j1.data).searchParams;
    const fields = {shareId:sp.get("shareId"), sign:sp.get("sign"), spbh:sp.get("spbh"), url:sp.get("url")};
    const {body, boundary} = toMultipart(fields);
    const h2 = {"content-type":`multipart/form-data; boundary=${boundary}`};
    const r2 = await post("https://apapia-history-weblogic.manmanbuy.com/h5/share/trendData", h2, body);
    const j2 = toJson(r2.body);

    if(j2.ok!==1){
      notify("比价结果","", j2.msg?`慢慢买：${j2.msg}`:"慢慢买返回异常");
      return done({});
    }

    const res = j2.result;
    const title = res?.trendData?.title || `商品 ${jdId}`;
    const tip = (res?.priceRemark?.Tip||"")+"（仅供参考）";
    const lower = renderLowest(res);
    const summary = renderSummary(res);

    notify(title, `${lower} ${tip}`, summary, {"open-url":`https://item.jd.com/${jdId}.html`, "update-pasteboard":summary});
  }catch(e){
    notify(`${NAME}｜查询异常`,"", String(e && (e.stack||e)));
  }finally{
    done({});
  }
}

// —— 捕获 token ——
function captureToken(){
  try{
    const url = ($request && $request.url) || "";
    const body = ($request && $request.body) || "";
    notify(`${NAME}｜捕获开始`, "命中慢慢买接口", url.slice(0,120));
    let dev="";
    try{ const p=new URLSearchParams(body||""); dev=p.get("c_mmbDevId")||""; }catch(_){}
    if(dev){
      set("mmb_dev_id",dev);
      set("mmb_dev_id_last_update", String(Date.now()));
      notify(`${NAME}｜获取ck成功🎉`, `c_mmbDevId: ${mask(dev)}`,"已写入本地，随时可查");
    }else{
      notify(`${NAME}｜未解析到 c_mmbDevId`, "请在慢慢买App → 我的 再触发", body?body.slice(0,200):"请求体为空");
    }
  }catch(e){
    notify(`${NAME}｜捕获异常`,"", String(e && (e.stack||e)));
  }finally{
    done({});
  }
}

// —— 状态查询 ——
function statusCheck(){
  const id=get("mmb_dev_id")||"";
  const ts=get("mmb_dev_id_last_update")||"";
  const when = ts? new Date(Number(ts)).toLocaleString() : "N/A";
  const msg = id? `已保存 c_mmbDevId：${mask(id)}\n更新时间：${when}` : "未保存 c_mmbDevId";
  notify(`${NAME}｜状态`, id?"OK":"未设置", msg);
  done({});
}

// —— 辅助 ——
function extractId(u){
  let m = u.match(/\/product\/(?:[A-Za-z]+\/)?(\d+)\.html/); if(m&&m[1]) return m[1];
  m = u.match(/[?&](?:wareId|sku|id)=(\d+)/); if(m&&m[1]) return m[1];
  m = u.match(/\/(\d+)\.html(?:[#?]|$)/); if(m&&m[1]) return m[1];
  return null;
}
function renderLowest(result){
  const p=result?.priceRemark?.lowestPrice; const d=(result?.priceRemark?.lowestDate||"").slice(0,10);
  return p==null ? "历史最低：无数据" : `历史最低：¥${p}${d?`（${d}）`:""}`;
}
function renderSummary(result){
  const list=(result?.priceRemark?.ListPriceDetail||[]).filter(x=>!/(历史最高|常购价)/.test(x?.Name||""));
  if(!list.length) return "暂无有效历史摘要";
  const w=list.reduce((m,i)=>Math.max(m,(i.Price||"").length),0);
  const map={"双11价格":"双十一价格","618价格":"六一八价格","30天最低价":"三十天最低","60天最低价":"六十天最低","180天最低价":"一百八最低"};
  let out="";
  for(const it of list){
    let Price=it.Price||"-";
    if(Price!=="-"){
      if(Price.length<w){ const hasDot=Price.includes("."); Price=Price.includes(".")||Price.length+1===w?Price:`${Price}.`; Price=Price.padEnd(w, hasDot?"0":" "); }
    }
    out+=`${map[it.Name]||it.Name}  ${Price}  ${it.Date||""}  ${it.Difference==="-"?"":it.Difference}\n`;
  }
  return out.trimEnd();
}

// —— 简易HTTP/存取/通知/工具 ——
function post(url, headers, body){return new Promise(res=>{$httpClient.post({url,headers,body,timeout:15000},(_,r,b)=>res({status:(r&&(r.status||r.statusCode))||0,headers:(r&&r.headers)||{},body:b||""}))})}
function toQuery(o){return Object.keys(o).map(k=>`${encodeURIComponent(k)}=${encodeURIComponent(String(o[k]))}`).join("&")}
function toMultipart(fields){const bd="----WebKitFormBoundary"+Math.random().toString(36).slice(2); let b=""; for(const[k,v] of Object.entries(fields)){b+=`--${bd}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;} b+=`--${bd}--\r\n`; return {body:b,boundary:bd}}
function toJson(t){try{return JSON.parse(t||"{}")}catch{return {}}}
function jsonToCustomString(o){return Object.keys(o).filter(k=>o[k]!==""&&k.toLowerCase()!=="token").sort().map(k=>`${k.toUpperCase()}${String(o[k]).toUpperCase()}`).join("")}
function getToken(){ if(ARG.token) return ARG.token; const s=get("mmb_dev_id"); return s||"" }

function parseArg(a){const o={notify:"1",debug:"0"};try{if(!a)return o;if(typeof a==="string"){decodeURIComponent(a).split(/[&;,]/).forEach(p=>{const[k,...r]=p.split("="); if(k)o[k.trim()]=(r.join("=")||"").trim();});}else if(typeof a==="object"){Object.assign(o,a);} }catch{} return o}
function notify(t,s,b,e={}){ if(ARG.notify==="0")return; try{ if(typeof $task!=="undefined") $notify(t,s,b,e); else $notification.post(t,s,b,e);}catch{} }
function get(k){ try{ return typeof $task!=="undefined" ? $prefs.valueForKey(k) : $persistentStore.read(k);}catch{return null} }
function set(k,v){ try{ return typeof $task!=="undefined" ? $prefs.setValueForKey(v,k) : $persistentStore.write(v,k);}catch{return false} }
function done(v={}){ try{$done(v);}catch{} }
function mask(s){ if(!s) return ""; return s.length<=4? "*".repeat(s.length) : s.slice(0,2)+"***"+s.slice(-2); }

// ——— 内置 MD5 ———
function md5(e){return CryptoJS.MD5(e).toString()}
!function(){var CryptoJS=function(t){var r={lib:{}},n=r.lib,e=function(){},i=n.Base={extend:function(t){var r=function(){};return r.prototype=this,new r,t&&this.mixIn(t),r},mixIn:function(t){for(var r in t)t.hasOwnProperty(r)&&(this[r]=t[r])}},o=n.WordArray=i.extend({init:function(t,r){t=this.words=t||[],this.sigBytes=null!=r?r:4*t.length}});r.algo={};var a=r,s=a;return s.MD5=function(){function r(t,r){var n=(t&65535)+(r&65535);return(t>>16)+(r>>16)+(n>>16)<<16|65535&n}function n(t,r){return t<<r|t>>>32-r}function e(t,r,e,i,o,a,s){return r=r+((t&r|~t&i)+o+s|0)>>>0,r=r<<a|r>>>32-a,(r=r+e>>>0)>>>0}return function(t){for(var i=unescape(encodeURIComponent(t)),o=[],a=0;a<i.length;a++)o[a>>2]|=i.charCodeAt(a)<<24-8*(a%4);var s=1732584193,u=-271733879,f=-1732584194,h=271733878;for(var p=0;p<o.length;p+=16){var d=s,l=u,y=f,v=h;s=e(s,u,f,h,o[p],7,-680876936),h=e(h,s,u,f,o[p+1],12,-389564586),f=e(f,h,s,u,o[p+2],17,606105819),u=e(u,f,h,s,o[p+3],22,-1044525330),s=e(s,u,f,h,o[p+4],7,1770035416),h=e(h,s,u,f,o[p+5],12,1200080426),f=e(f,h,s,u,o[p+6],17,-1473231341),u=e(u,f,h,s,o[p+7],22,-45705983),s=e(s,u,f,h,o[p+8],7,1770035416),h=e(h,s,u,f,o[p+9],12,-1958414417),f=e(f,h,s,u,o[p+10],17,-42063),u=e(u,f,h,s,o[p+11],22,-1990404162),s=e(s,u,f,h,o[p+12],7,1804603682),h=e(h,s,u,f,o[p+13],12,-40341101),f=e(f,h,s,u,o[p+14],17,-1502002290),u=e(u,f,h,s,o[p+15],22,1236535329),s=e(s,u,f,h,o[p+1],5,-165796510),h=e(h,s,u,f,o[p+6],9,-1069501632),f=e(f,h,s,u,o[p+11],14,643717713),u=e(u,f,h,s,o[p],20,-373897302),s=e(s,u,f,h,o[p+5],5,-701558691),h=e(h,s,u,f,o[p+10],9,38016083),f=e(f,h,s,u,o[p+15],14,-660478335),u=e(u,f,h,s,o[p+4],20,-405537848),s=(s=s+1732584193|0)>>>0,u=(u-271733879|0)>>>0,f=(f-1732584194|0)>>>0,h=(h+271733878|0)>>>0}return([s,u,f,h]).map(function(t){return("00000000"+(t>>>0).toString(16)).slice(-8)}).join("")}}()}(),r}();
var CryptoJS=CryptoJS}();
