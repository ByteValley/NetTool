/* ===== 京东比价 · 单脚本（参考 mw418 / dulong / wf021325 实现） =====
 * 模式：mode=token | popup | render
 * - token：慢慢买 App“我的”接口抓 c_mmbDevId（原始 body 也存）
 * - popup：商品详情 request 钩子弹窗
 * - render：商品详情 response 钩子注入（表格/原始/折线 三选一）
 */

const NAME   = "京东比价";
const SECRET = "3E41D1331F5DDAFCD0A38FE2D52FF66F";
const MMB_KEY = "manmanbuy_val"; // 保存原始 body（含 c_mmbDevId）
const MMB_ID  = "慢慢买CK";       // 直接保存 c_mmbDevId

/* ---------- tiny helpers ---------- */
function parseArg(a){let o={};if(!a)return o;String(a).split(/[&;,]/).forEach(x=>{const i=x.indexOf("=");if(i>-1){o[decodeURIComponent(x.slice(0,i))]=decodeURIComponent(x.slice(i+1))}});return o;}
const ARG  = parseArg(typeof $argument==="string"?$argument:"");
const MODE = (ARG.mode||"").toLowerCase();
function notify(t,s,b,ext){try{ if(typeof $task!=="undefined") $notify(t||"",s||"",b||"",ext||{}); else $notification.post(t||"",s||"",b||"",ext||{});}catch(_){ }}
function done(v){ try{$done(v||{});}catch(_){ }}
function kvget(k){try{return (typeof $task!=="undefined")?$prefs.valueForKey(k):$persistentStore.read(k)}catch(_){return null}}
function kvset(k,v){try{return (typeof $task!=="undefined")?$prefs.setValueForKey(v,k):$persistentStore.write(v,k)}catch(_){return false}}

/* ---------- env patches ---------- */
if(typeof Promise.withResolvers!=="function"){
  Promise.withResolvers=function(){let resolve,reject;const promise=new Promise((res,rej)=>{resolve=res;reject=rej});return {promise,resolve,reject}}
}
function intCryptoJS(){CryptoJS=function(t,r){var n;if("undefined"!=typeof window&&window.crypto&&(n=window.crypto),"undefined"!=typeof self&&self.crypto&&(n=self.crypto),"undefined"!=typeof globalThis&&globalThis.crypto&&(n=globalThis.crypto),!n&&"undefined"!=typeof window&&window.msCrypto&&(n=window.msCrypto),!n&&"undefined"!=typeof global&&global.crypto&&(n=global.crypto),!n&&"function"==typeof require)try{n=require("crypto")}catch(t){}var e=function(){if(n){if("function"==typeof n.getRandomValues)try{return n.getRandomValues(new Uint32Array(1))[0]}catch(t){}if("function"==typeof n.randomBytes)try{return n.randomBytes(4).readInt32LE()}catch(t){}}throw new Error("Native crypto module could not be used to get secure random number.")},i=Object.create||function(){function t(){}return function(r){var n;return t.prototype=r,n=new t,t.prototype=null,n}}(),o={},a=o.lib={},s=a.Base={extend:function(t){var r=i(this);return t&&r.mixIn(t),r.hasOwnProperty("init")&&this.init!==r.init||(r.init=function(){r.$super.init.apply(this,arguments)}),r.init.prototype=r,r.$super=this,r},create:function(){var t=this.extend();return t.init.apply(this,arguments),t},init:function(){},mixIn:function(t){for(var r in t)t.hasOwnProperty(r)&&(this[r]=t[r]);t.hasOwnProperty("toString")&&(this.toString=t.toString)},clone:function(){return this.init.prototype.extend(this)}},c=a.WordArray=s.extend({init:function(t,r){t=this.words=t||[],this.sigBytes=null!=r?r:4*t.length},toString:function(t){return(t||f).stringify(this)},concat:function(t){var r=this.words,n=t.words,e=this.sigBytes,i=t.sigBytes;if(this.clamp(),e%4)for(var o=0;o<i;o++){var a=n[o>>>2]>>>24-o%4*8&255;r[e+o>>>2]|=a<<24-(e+o)%4*8}else for(var s=0;s<i;s+=4)r[e+s>>>2]=n[s>>>2];return this.sigBytes+=i,this},clamp:function(){var r=this.words,n=this.sigBytes;r[n>>>2]&=4294967295<<32-n%4*8,r.length=t.ceil(n/4)},clone:function(){var t=s.clone.call(this);return t.words=this.words.slice(0),t},random:function(r){var n,i=[],o=function(r){r=r;var n=987654321,e=4294967295;return function(){var i=((n=36969*(65535&n)+(n>>16)&e)<<16)+(r=18e3*(65535&r)+(r>>16)&e)&e;return i/=4294967296,(i+=.5)*(t.random()>.5?1:-1)}},a=!1;try{e(),a=!0}catch(t){}for(var s,u=0;u<r;u+=4)a?i.push(e()):(s=987654071*(n=o(4294967296*(s||t.random())))(),i.push(4294967296*n()|0));return new c.init(i,r)}}),u=o.enc={},f=u.Hex={stringify:function(t){for(var r=t.words,n=t.sigBytes,e=[],i=0;i<n;i++){var o=r[i>>>2]>>>24-i%4*8&255;e.push((o>>>4).toString(16)),e.push((15&o).toString(16))}return e.join("")},parse:function(t){for(var r=t.length,n=[],e=0;e<r;e+=2)n[e>>>3]|=parseInt(t.substr(e,2),16)<<24-e%8*4;return new c.init(n,r/2)}},h=u.Latin1={stringify:function(t){for(var r=t.words,n=t.sigBytes,e=[],i=0;i<n;i++){var o=r[i>>>2]>>>24-i%4*8&255;e.push(String.fromCharCode(o))}return e.join("")},parse:function(t){for(var r=t.length,n=[],e=0;e<r;e++)n[e>>>2]|=(255&t.charCodeAt(e))<<24-e%4*8;return new c.init(n,r)}},p=u.Utf8={stringify:function(t){try{return decodeURIComponent(escape(h.stringify(t)))}catch(t){throw new Error("Malformed UTF-8 data")}},parse:function(t){return h.parse(unescape(encodeURIComponent(t)))}},d=a.BufferedBlockAlgorithm=s.extend({reset:function(){this._data=new c.init,this._nDataBytes=0},_append:function(t){"string"==typeof t&&(t=p.parse(t)),this._data.concat(t),this._nDataBytes+=t.sigBytes},_process:function(r){var n,e=this._data,i=e.words,o=e.sigBytes,a=this.blockSize,s=o/(4*a),u=(s=r?t.ceil(s):t.max((0|s)-this._minBufferSize,0))*a,f=t.min(4*u,o);if(u){for(var h=0;h<u;h+=a)this._doProcessBlock(i,h);n=i.splice(0,u),e.sigBytes-=f}return new c.init(n,f)},clone:function(){var t=s.clone.call(this);return t._data=this._data.clone(),t},_minBufferSize:0}),l=(a.Hasher=d.extend({cfg:s.extend(),init:function(t){this.cfg=this.cfg.extend(t),this.reset()},reset:function(){d.reset.call(this),this._doReset()},update:function(t){return this._append(t),this._process(),this},finalize:function(t){return t&&this._append(t),this._doFinalize()},blockSize:16,_createHelper:function(t){return function(r,n){return new t.init(n).finalize(r)}},_createHmacHelper:function(t){return function(r,n){return new l.HMAC.init(t,n).finalize(r)}}}),o.algo={});return o}(Math);!function(t){var r=CryptoJS,n=r.lib,e=n.WordArray,i=n.Hasher,o=r.algo,a=[];!function(){for(var r=0;r<64;r++)a[r]=4294967296*t.abs(t.sin(r+1))|0}();var s=o.MD5=i.extend({_doReset:function(){this._hash=new e.init([1732584193,4023233417,2562383102,271733878])},_doProcessBlock:function(t,r){for(var n=0;n<16;n++){var e=r+n,i=t[e];t[e]=16711935&(i<<8|i>>>24)|4278255360&(i<<24|i>>>8)}var o=this._hash.words,s=t[r+0],p=t[r+1],d=t[r+2],l=t[r+3],y=t[r+4],v=t[r+5],g=t[r+6],w=t[r+7],_=t[r+8],m=t[r+9],B=t[r+10],b=t[r+11],C=t[r+12],S=t[r+13],x=t[r+14],A=t[r+15],H=o[0],z=o[1],M=o[2],D=o[3];z=h(z=h(z=h(z=h(z=f(z=f(z=f(z=f(z=u(z=u(z=u(z=u(z=c(z=c(z*c(z*c(z,M=c(M,D=c(D,H=c(H,z,M,D,s,7,a[0]),z,M,p,12,a[1]),H,z,d,17,a[2]),D,H,l,22,a[3]),M=c(M,D=c(D,H=c(H,z,M,D,y,7,a[4]),z,M,v,12,a[5]),H,z,g,17,a[6]),D,H,w,22,a[7]),M=c(M,D=c(D,H=c(H,z,M,D,_,7,a[8]),z,M,m,12,a[9]),H,z,B,17,a[10]),D,H,b,22,a[11]),M=c(M,D=c(D,H=c(H,z,M,D,C,7,a[12]),z,M,S,12,a[13]),H,z,x,17,a[14]),D,H,A,22,a[15]),M=u(M,D=u(D,H=u(H,z,M,D,p,5,a[16]),z,M,g,9,a[17]),H,z,b,14,a[18]),D,H,s,20,a[19]),M=u(M,D=u(D,H=u(H,z,M,D,v,5,a[20]),z,M,B,9,a[21]),H,z,A,14,a[22]),D,H,y,20,a[23]),M=u(M,D=u(D,H=u(H,z,M,D,m,5,a[24]),z,M,x,9,a[25]),H,z,l,14,a[26]),D,H,_,20,a[27]),M=u(M,D=u(D,H=u(H,z,M,D,S,5,a[28]),z,M,d,9,a[29]),H,z,w,14,a[30]),D,H,C,20,a[31]),M=f(M,D=f(D,H=f(H,z,M,D,v,4,a[32]),z,M,_,11,a[33]),H,z,b,16,a[34]),D,H,x,23,a[35]),M=f(M,D=f(D,H=f(H,z,M,D,p,4,a[36]),z,M,y,11,a[37]),H,z,w,16,a[38]),D,H,B,23,a[39]),M=f(M,D=f(D,H=f(H,z,M,D,S,4,a[40]),z,M,s,11,a[41]),H,z,l,16,a[42]),D,H,g,23,a[43]),M=f(M,D=f(D,H=f(H,z,M,D,m,4,a[44]),z,M,C,11,a[45]),H,z,A,16,a[46]),D,H,d,23,a[47]),M=h(M,D=h(D,H=h(H,z,M,D,s,6,a[48]),z,M,w,10,a[49]),H,z,x,15,a[50]),D,H,v,21,a[51]),M=h(M,D=h(D,H=h(H,z,M,D,C,6,a[52]),z,M,l,10,a[53]),H,z,B,15,a[54]),D,H,p,21,a[55]),M=h(M,D=h(D,H=h(H,z,M,D,_,6,a[56]),z,M,A,10,a[57]),H,z,g,15,a[58]),D,H,S,21,a[59]),M=h(M,D=h(D,H=h(H,z,M,D,y,6,a[60]),z,M,b,10,a[61]),H,z,d,15,a[62]),D,H,m,21,a[63]),o[0]=o[0]+H|0,o[1]=o[1]+z|0,o[2]=o[2]+M|0,o[3]=o[3]+D|0},_doFinalize:function(){var r=this._data,n=r.words,e=8*this._nDataBytes,i=8*r.sigBytes;n[i>>>5]|=128<<24-i%32;var o=t.floor(e/4294967296),a=e;n[15+(i+64>>>9<<4)]=16711935&(o<<8|o>>>24)|4278255360&(o<<24|o>>>8),n[14+(i+64>>>9<<4)]=16711935&(a<<8|a>>>24)|4278255360&(a<<24|a>>>8),r.sigBytes=4*(n.length+1),this._process();for(var s=this._hash,c=s.words,u=0;u<4;u++){var f=c[u];c[u]=16711935&(f<<8|f>>>24)|4278255360&(f<<24|f>>>8)}return s},clone:function(){var t=i.clone.call(this);return t._hash=this._hash.clone(),t}});function c(t,r,n,e,i,o,a){var s=t+(r&n|~r&e)+i+a;return(s<<o|s>>>32-o)+r}function u(t,r,n,e,i,o,a){var s=t+(r&e|n&~e)+i+a;return(s<<o|s>>>32-o)+r}function f(t,r,n,e,i,o,a){var s=t+(r^n^e)+i+a;return(s<<o|s>>>32-o)+r}function h(t,r,n,e,i,o,a){var s=t+(n^(r|~e))+i+a;return(s<<o|s>>>32-o)+r}r.MD5=i._createHelper(s),r.HmacMD5=i._createHmacHelper(s)}(Math),function(){var t=CryptoJS,r=t.lib.WordArray;t.enc.Base64={stringify:function(t){var r=t.words,n=t.sigBytes,e=this._map;t.clamp();for(var i=[],o=0;o<n;o+=3)for(var a=(r[o>>>2]>>>24-o%4*8&255)<<16|(r[o+1>>>2]>>>24-(o+1)%4*8&255)<<8|r[o+2>>>2]>>>24-(o+2)%4*8&255,s=0;s<4&&o+.75*s<n;s++)i.push(e.charAt(a>>>6*(3-s)&63));var c=e.charAt(64);if(c)for(;i.length%4;)i.push(c);return i.join("")},parse:function(t){var n=t.length,e=this._map,i=this._reverseMap;if(!i){i=this._reverseMap=[];for(var o=0;o<e.length;o++)i[e.charCodeAt(o)]=o}var a=e.charAt(64);if(a){var s=t.indexOf(a);-1!==s&&(n=s)}return function(t,n,e){for(var i=[],o=0,a=0;a<n;a++)if(a%4){var s=e[t.charCodeAt(a-1)]<<a%4*2,c=e[t.charCodeAt(a)]>>>6-a%4*2;i[o>>>2]|=(s|c)<<24-o%4*8,o++}return r.create(i,o)}(t,n,i)},_map:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="}}();};function md5(word){return CryptoJS.MD5(word).toString();}

/* ---------- tiny http (最小兼容) ---------- */
function $http(req){
  return new Promise((resolve,reject)=>{
    if(typeof $httpClient!=="undefined"){
      const fn=(req.method||"get").toLowerCase();
      $httpClient[fn](req,(err,resp,body)=>{
        if(err) return reject(err);
        resp=resp||{}; resp.body=body||"";
        try{ resp.json=()=>JSON.parse(resp.body) }catch(_){ resp.json=()=>({}) }
        resolve(resp);
      });
    }else if(typeof $task!=="undefined"){
      $task.fetch(req).then(resp=>{
        try{ resp.json=()=>JSON.parse(resp.body) }catch(_){ resp.json=()=>({}) }
        resolve(resp);
      },reject);
    }else reject("no http env");
  });
}

/* ---------- common utils ---------- */
function parseQS(s){const o={};(String(s||"").split("&")).forEach(p=>{const i=p.indexOf("=");if(i>-1){o[decodeURIComponent(p.slice(0,i))]=decodeURIComponent(p.slice(i+1))}});return o;}
function toQS(o){return Object.keys(o).map(k=>encodeURIComponent(k)+"="+encodeURIComponent(o[k])).join("&")}
function toSigStr(o){return Object.keys(o).filter(k=>o[k]!==""&&k.toLowerCase()!=="token").sort().map(k=>k.toUpperCase()+String(o[k]).toUpperCase()).join("")}

/* ---------- token 捕获 ---------- */
const reqUrl = ($request && $request.url) || "";
if(MODE==="token" && /\/baoliao\/center\/menu$/.test(reqUrl)){
  try{
    const body=$request.body||"";
    kvset(MMB_KEY, body);
    let devId = "";
    try{
      if(typeof URLSearchParams==="function"){ const p=new URLSearchParams(body); devId=p.get("c_mmbDevId")||""; }
      else { const q=parseQS(body); devId=q.c_mmbDevId||""; }
    }catch(_){}
    kvset(MMB_ID, devId);
    notify(NAME, "获取ck成功🎉", body.slice(0,280));
  }catch(e){ notify(NAME+"｜获取token异常","",String(e&&e.message||e)) }
  return done({});
}

/* ---------- 比价核心（参考 mw418/dulong/wf021325） ---------- */
function getDevId(){
  const raw = kvget(MMB_KEY)||"";
  const id  = kvget(MMB_ID)||"";
  if(raw){ const q=parseQS(raw); return q.c_mmbDevId || id; }
  return id||"";
}
function jdIdFromUrl(u){
  const m = u.match(/\/product\/graphext\/(\d+)\.html/);
  return m && m[1] ? m[1] : null;
}
function requestTrend(id){
  const devId = getDevId();
  if(!devId){ notify(NAME,"请先打开【慢慢买】APP--我的","成功抓到 ck 后再进商品详情页"); return Promise.reject("no devId"); }

  intCryptoJS();
  // 1) app/share
  const shareBody={
    methodName:"trendJava",
    spbh:`1|${id}`,
    url:`https://item.jd.com/${id}.html`,
    t:Date.now().toString(),
    c_appver:"4.8.3.1",
    c_mmbDevId:devId,
  };
  shareBody.token = md5(encodeURIComponent(SECRET + toSigStr(shareBody) + SECRET)).toUpperCase();

  const headers={
    "Content-Type":"application/x-www-form-urlencoded; charset=utf-8",
    "User-Agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 13_1_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 - mmbWebBrowse - ios",
  };

  return $http({method:"post", url:"https://apapia-history-weblogic.manmanbuy.com/app/share", headers, body:toQS(shareBody)})
    .then(res=>{
      const {code,msg,data}=res.json();
      if(code!==2000) throw new Error(msg||"share接口异常");
      if(!data) throw new Error("share返回空");
      return new URL(data).searchParams;
    })
    .then(params=>{
      const fields={ shareId:params.get("shareId"), sign:params.get("sign"), spbh:params.get("spbh"), url:params.get("url") };
      // 2) h5/share/trendData （multipart）
      const boundary="----WebKitFormBoundary"+Math.random().toString(36).slice(2);
      let body="";
      for(const [k,v] of Object.entries(fields)){ body+=`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`; }
      body+=`--${boundary}--\r\n`;
      return $http({method:"post", url:"https://apapia-history-weblogic.manmanbuy.com/h5/share/trendData", headers:{ "content-type":`multipart/form-data; boundary=${boundary}` }, body});
    })
    .then(res=>res.json());
}

/* ---------- 展示辅助 ---------- */
function historySummary(result){
  const toDate=(t=Date.now())=>{const d=new Date(t - new Date().getTimezoneOffset()*60000);return d.toISOString().split("T")[0]};
  const { ListPriceDetail } = result.priceRemark;
  return (ListPriceDetail||[]).flatMap(({Name,Difference,Price,Date})=>{
    if(/历史最高|常购价/.test(Name||"")) return [];
    return [{Name,Date:Date||toDate(),Price, Difference}];
  });
}
function priceSummary(data){
  let s=""; const list=historySummary(data);
  const maxW=list.reduce((m,it)=>Math.max(m,String(it.Price||"-").length),0);
  for(const it of list){
    if(it.Price=='-') continue;
    const map={"双11价格":"双十一价格","618价格":"六一八价格","30天最低价":"三十天最低","60天最低价":"六十天最低","180天最低价":"一百八最低"};
    let name=map[it.Name]||it.Name;
    let price=String(it.Price||"-");
    if(price.length<maxW){
      price = price.includes(".") || (price.length+1===maxW)?price:price+".";
      price = price.padEnd(maxW, price.includes(".")?"0":" ");
    }
    s += `${name}  ${price}  ${it.Date}  ${it.Difference==='-'?'':(it.Difference||'')}\n`;
  }
  return s.replace(/\n$/,"");
}
function lowerMsgs(r){
  const low = r?.priceRemark?.lowestPrice;
  const d   = (r?.priceRemark?.lowestDate||"").slice(0,10);
  return `历史最低:¥${low}${d?`(${d})`:""} `;
}

/* ---------- 模式分发 ---------- */
if(MODE==="popup" && typeof $response==="undefined"){
  try{
    const id = jdIdFromUrl(reqUrl);
    if(!id) return done({});
    requestTrend(id).then(data=>{
      if(data && data.ok===1){
        const r=data.result;
        const text=priceSummary(r);
        const tip =(r.priceRemark?.Tip||"") + "(仅供参考)";
        notify(r.trendData?.title||("商品 "+id), `${lowerMsgs(r)} ${tip}`, text, {"open-url":`https://item.jd.com/${id}.html`, "update-pasteboard":text});
      }else if(data && data.ok===0 && data.msg){
        notify("比价结果","","慢慢买提示您："+data.msg);
      }
      done({});
    }).catch(e=>{ notify(NAME+"｜接口异常","",String(e&&e.message||e)); done({}); });
  }catch(_){ done({}); }
  return;
}

if(MODE==="render" && typeof $response!=="undefined"){
  try{
    const id = jdIdFromUrl(reqUrl);
    if(!id) return $done($response);
    requestTrend(id).then(data=>{
      if(!(data && data.ok===1)) return $done($response);
      const r=data.result;
      const title = r.trendData?.title || ("商品 "+id);
      const tip   = (r.priceRemark?.Tip||"")+"（仅供参考）";
      const lower = lowerMsgs(r);
      const summary = priceSummary(r);

      // 三选一控制
      const st = String(ARG.style_table||"").toLowerCase()==="true";
      const sr = String(ARG.style_raw||"").toLowerCase()==="true";
      const sl = String(ARG.style_line||"").toLowerCase()==="true";
      const lo = String(ARG.line_only||"").toLowerCase()==="true";

      const css = '<style>.jd-price-panel{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,PingFang SC,Helvetica,Arial;line-height:1.35;border:1px solid #eee;border-radius:12px;padding:12px;margin:10px;background:#fff;box-shadow:0 6px 18px rgba(0,0,0,.06)}.jd-price-panel h3{font-size:15px;margin:0 0 8px}.jd-price-meta{color:#666;font-size:12px;margin-bottom:8px}.jd-price-pre{font-size:12px;background:#fafafa;border:1px dashed #ddd;border-radius:8px;padding:8px;white-space:pre-wrap}.jd-price-table{width:100%;border-collapse:collapse;font-size:12px}.jd-price-table th,.jd-price-table td{border:1px solid #eee;padding:6px 8px;text-align:left}.jd-muted{color:#999}.jd-price-chart{width:100%;height:120px;margin-top:6px}</style>';

      const tableHtml=(function(){
        const arr=r?.priceRemark?.ListPriceDetail||[]; let rows="";
        const map={"双11价格":"双十一价格","618价格":"六一八价格","30天最低价":"三十天最低","60天最低价":"六十天最低","180天最低价":"一百八最低"};
        for(const it of arr){ if(/历史最高|常购价/.test(it.Name||"")) continue;
          rows += `<tr><td>${map[it.Name]||it.Name||""}</td><td>${it.Price||"-"}</td><td>${it.Date||""}</td><td>${it.Difference==='-'?"":(it.Difference||"")}</td></tr>`;
        }
        return rows?`<table class="jd-price-table"><thead><tr><th>名称</th><th>价格</th><th>日期</th><th>差异</th></tr></thead><tbody>${rows}</tbody></table>`:'<div class="jd-muted">暂无表格数据</div>';
      })();
      const chartHtml=(function(){
        const list=r.priceTrend||[]; const pts=[];
        for(const x of list){ const p=Number(x?.price ?? x?.Price ?? x?.p); if(!isNaN(p)) pts.push(p); }
        if(!pts.length) return '<div class="jd-muted">暂无折线数据</div>';
        const W=320,H=120,P=10,xmax=Math.max(1,pts.length-1);
        let ymin=Infinity,ymax=-Infinity; for(const p of pts){ymin=Math.min(ymin,p);ymax=Math.max(ymax,p)}
        if(ymin===Infinity){ymin=0;ymax=1}
        const sx=(W-2*P)/xmax, sy=(H-2*P)/Math.max(1,(ymax-ymin)||1);
        let points=""; for(let k=0;k<pts.length;k++){const xx=P+k*sx; const yy=H-P-((pts[k]-ymin)*sy); points+=(k?",":"")+xx+","+yy}
        return `<svg class="jd-price-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline fill="none" stroke="#007aff" stroke-width="2" points="${points}"/></svg>`;
      })();

      let content="";
      if(st) content = tableHtml;
      else if(sl){ content = lo?"":tableHtml; content += chartHtml; }
      else if(sr){ content = `<pre class="jd-price-pre">${summary.replace(/[&<>]/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[s]))}</pre>`; }
      else content = tableHtml; // 默认表格

      const panel = `${css}<div class="jd-price-panel"><h3>🧾 ${title}</h3><div class="jd-price-meta">${lower}<span class="jd-muted"> ${tip}</span></div>${content}</div>`;
      let html=$response.body||"";
      html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, panel+"</body>") : (panel+html);
      $done({body:html});
    }).catch(_=> $done($response));
  }catch(_){ try{$done($response)}catch(__){ done({}) } }
  return;
}

/* 放行 */
done({});
