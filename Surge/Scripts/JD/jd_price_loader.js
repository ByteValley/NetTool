// 京东比价（表格 / 原始 / 折线 三合一）
// - 获取 token（慢慢买）/ 弹窗（request）/ 页面渲染（表格/原始/折线）
// - 仅需 MITM: in.m.jd.com, apapia-sqk-weblogic.manmanbuy.com

const APP = "京东比价";
const SECRET = "3E41D1331F5DDAFCD0A38FE2D52FF66F";
const KEY_BODY = "manmanbuy_val";
const KEY_DEVID = "慢慢买CK";

/* ========== Env 基础 ========== */
function notify(t,s,b,e){try{if(typeof $notify==="function")$notify(t||"",s||"",b||"",e||{});else if(typeof $notification!=="undefined")$notification.post(t||"",s||"",b||"",e||{});}catch(_){}} 
function done(v){try{$done(v||{});}catch(_){}} 
function getval(k){try{return(typeof $prefs!=="undefined")?$prefs.valueForKey(k):$persistentStore.read(k);}catch(_){return null;}} 
function setval(k,v){try{return(typeof $prefs!=="undefined")?$prefs.setValueForKey(v,k):$persistentStore.write(v,k);}catch(_){return false;}} 
function parseArg(a){let o={};if(!a)return o;String(a).split(/[&;,]/).forEach(kv=>{const i=kv.indexOf("=");if(i===-1)return;const k=decodeURIComponent(kv.slice(0,i));const v=decodeURIComponent(kv.slice(i+1));o[k]=v;});return o;} 
const ARG=parseArg(typeof $argument==="string"?$argument:""); 
const MODE=(ARG.mode||"").toLowerCase(); 
const REQ_URL=($request&&$request.url)||""; 

/* ========== HTTP 封装 ========== */
function $http(op,t=6){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("timeout")),op.$timeout??t*1000);const cb=(err,resp,body)=>{clearTimeout(timer);if(err)reject(err);else{resp.body=body;resp.json=()=>{try{return JSON.parse(body);}catch{ return {}; }};resolve(resp);}};try{$httpClient[op.method||"get"](op,cb);}catch(_){$task?.fetch(op).then(r=>cb(null,r,r.body),e=>cb(e,{},""));}});} 

/* ========== 工具 ========== */
function parseQS(q){const o={};(q||"").split("&").forEach(p=>{const kv=p.split("=");o[decodeURIComponent(kv[0]||"")]=decodeURIComponent(kv[1]||"");});return o;} 
function toQS(obj){return Object.keys(obj).map(k=>`${encodeURIComponent(k)}=${encodeURIComponent(obj[k])}`).join("&");} 
function toCustomStr(obj){return Object.keys(obj).filter(k=>obj[k]!==""&&k.toLowerCase()!=="token").sort().map(k=>`${k.toUpperCase()}${String(obj[k]).toUpperCase()}`).join("");} 
function getCk(){const ck=getval(KEY_BODY);if(!ck){notify(APP,"请先打开【慢慢买】APP—我的","确保提示‘获取ck成功’");return null;}return parseQS(ck)?.c_mmbDevId||getval(KEY_DEVID);} 
function extractId(u){const m=u.match(/\/product\/(?:[A-Za-z]+\/)?(\d+)\.html/);return m&&m[1]?m[1]:null;} 

/* ========== 简易 MD5 ========== */
function md5(str){function L(k,d){return(k<<d)|(k>>>(32-d))}function K(G,k){var I,d,F,H,x;F=(G&2147483648);H=(k&2147483648);I=(G&1073741824);d=(k&1073741824);x=(G&1073741823)+(k&1073741823);if(I&d){return(x^2147483648^F^H);}if(I|d){if(x&1073741824){return(x^3221225472^F^H);}else{return(x^1073741824^F^H);}}else{return(x^F^H);}}function r(d,F,k){return(d&F)|((~d)&k);}function q(d,F,k){return(d&k)|(F&(~k));}function p(d,F,k){return(d^F^k);}function n(d,F,k){return(F^(d|(~k)));}function u(G,F,aa,Z,k,H,I){G=K(G,K(K(r(F,aa,Z),k),I));return K(L(G,H),F);}function f(G,F,aa,Z,k,H,I){G=K(G,K(K(q(F,aa,Z),k),I));return K(L(G,H),F);}function D(G,F,aa,Z,k,H,I){G=K(G,K(K(p(F,aa,Z),k),I));return K(L(G,H),F);}function t(G,F,aa,Z,k,H,I){G=K(G,K(K(n(F,aa,Z),k),I));return K(L(G,H),F);}function e(G){var Z;var F=G.length;var x=F+8;var k=(x-(x%64))/64;var I=(k+1)*16;var aa=Array(I-1);var d=0;var H=0;while(H<F){Z=(H-(H%4))/4;d=(H%4)*8;aa[Z]=(aa[Z]|(G.charCodeAt(H)<<d));H++;}Z=(H-(H%4))/4;d=(H%4)*8;aa[Z]=aa[Z]|(128<<d);aa[I-2]=F<<3;aa[I-1]=F>>>29;return aa;}function B(x){var k="",F="",G,d;for(d=0;d<=3;d++){G=(x>>>(d*8))&255;F="0"+G.toString(16);k=k+F.substr(F.length-2,2);}return k;}function J(k){k=k.replace(/\r\n/g,"\n");var d="";for(var F=0;F<k.length;F++){var x=k.charCodeAt(F);if(x<128){d+=String.fromCharCode(x);}else{if((x>127)&&(x<2048)){d+=String.fromCharCode((x>>6)|192);d+=String.fromCharCode((x&63)|128);}else{d+=String.fromCharCode((x>>12)|224);d+=String.fromCharCode(((x>>6)&63)|128);d+=String.fromCharCode((x&63)|128);}}}return d;}var C=Array();var P,h,E,v,g,Y,X,W,V;var S=7,Q=12,N=17,M=22;var A=5,z=9,y=14,w=20;var o=4,m=11,l=16,j=23;var U=6,T=10,R=15,O=21;str=J(str);C=e(str);Y=1732584193;X=4023233417;W=2562383102;V=271733878;for(P=0;P<C.length;P+=16){h=Y;E=X;v=W;g=V;Y=u(Y,X,W,V,C[P+0],S,3614090360);V=u(V,Y,X,W,C[P+1],Q,3905402710);W=u(W,V,Y,X,C[P+2],N,606105819);X=u(X,W,V,Y,C[P+3],M,3250441966);Y=u(Y,X,W,V,C[P+4],S,4118548399);V=u(V,Y,X,W,C[P+5],Q,1200080426);W=u(W,V,Y,X,C[P+6],N,2821735955);X=u(X,W,V,Y,C[P+7],M,4249261313);Y=u(Y,X,W,V,C[P+8],S,1770035416);V=u(V,Y,X,W,C[P+9],Q,2336552879);W=u(W,V,Y,X,C[P+10],N,4294925233);X=u(X,W,V,Y,C[P+11],M,2304563134);Y=u(Y,X,W,V,C[P+12],S,1804603682);V=u(V,Y,X,W,C[P+13],Q,4254626195);W=u(W,V,Y,X,C[P+14],N,2792965006);X=u(X,W,V,Y,C[P+15],M,1236535329);Y=f(Y,X,W,V,C[P+1],A,4129170786);V=f(V,Y,X,W,C[P+6],z,3225465664);W=f(W,V,Y,X,C[P+11],y,643717713);X=f(X,W,V,Y,C[P+0],w,3921069994);Y=f(Y,X,W,V,C[P+5],A,3593408605);V=f(V,Y,X,W,C[P+10],z,38016083);W=f(W,V,Y,X,C[P+15],y,3634488961);X=f(X,W,V,Y,C[P+4],w,3889429448);Y=f(Y,X,W,V,C[P+9],A,568446438);V=f(V,Y,X,W,C[P+14],z,3275163606);W=f(W,V,Y,X,C[P+3],y,4107603335);X=f(X,W,V,Y,C[P+8],w,1163531501);Y=f(Y,X,W,V,C[P+13],A,2850285829);V=f(V,Y,X,W,C[P+2],z,4243563512);W=f(W,V,Y,X,C[P+7],y,1735328473);X=f(X,W,V,Y,C[P+12],w,2368359562);Y=D(Y,X,W,V,C[P+5],o,4294588738);V=D(V,Y,X,W,C[P+8],m,2272392833);W=D(W,V,Y,X,C[P+11],l,1839030562);X=D(X,W,V,Y,C[P+14],j,4259657740);Y=D(Y,X,W,V,C[P+1],o,2763975236);V=D(V,Y,X,W,C[P+4],m,1272893353);W=D(W,V,Y,X,C[P+7],l,4139469664);X=D(X,W,V,Y,C[P+10],j,3200236656);Y=D(Y,X,W,V,C[P+13],o,681279174);V=D(V,Y,X,W,C[P+0],m,3936430074);W=D(W,V,Y,X,C[P+3],l,3572445317);X=D(X,W,V,Y,C[P+6],j,76029189);Y=D(Y,X,W,V,C[P+9],o,3654602809);V=D(V,Y,X,W,C[P+12],m,3873151461);W=D(W,V,Y,X,C[P+15],l,530742520);X=D(X,W,V,Y,C[P+2],j,3299628645);Y=t(Y,X,W,V,C[P+0],U,4096336452);V=t(V,Y,X,W,C[P+7],T,1126891415);W=t(W,V,Y,X,C[P+14],R,2878612391);X=t(X,W,V,Y,C[P+5],O,4237533241);Y=t(Y,X,W,V,C[P+12],U,1700485571);V=t(V,Y,X,W,C[P+3],T,2399980690);W=t(W,V,Y,X,C[P+10],R,4293915773);X=t(X,W,V,Y,C[P+1],O,2240044497);Y=t(Y,X,W,V,C[P+8],U,1873313359);V=t(V,Y,X,W,C[P+15],T,4264355552);W=t(W,V,Y,X,C[P+6],R,2734768916);X=t(X,W,V,Y,C[P+13],O,1309151649);Y=K(Y,h);X=K(X,E);W=K(W,v);V=K(V,g);}return(B(Y)+B(X)+B(W)+B(V)).toUpperCase();} 

/* ========== 慢慢买接口 ========== */
function requestHistoryPrice(id){
  const devid=getCk(); if(!devid) return Promise.reject(new Error("未获取 c_mmbDevId"));
  const body={methodName:"trendJava",spbh:`1|${id}`,url:`https://item.jd.com/${id}.html`,t:Date.now().toString(),c_appver:"4.8.3.1",c_mmbDevId:devid};
  body.token=md5(SECRET+toCustomStr(body)+SECRET);
  const headers={"Content-Type":"application/x-www-form-urlencoded; charset=utf-8","User-Agent":"mmbWebBrowse-ios"};
  return $http({method:"post",url:"https://apapia-history-weblogic.manmanbuy.com/app/share",headers,body:toQS(body)})
    .then(r=>{const j=r.json();if(j.code!==2000)throw new Error(j.msg||"share接口异常");const u=new URL(j.data);const fd={shareId:u.searchParams.get("shareId"),sign:u.searchParams.get("sign"),spbh:u.searchParams.get("spbh"),url:u.searchParams.get("url")};
      const boundary="----WebKitFormBoundary"+Math.random().toString(36).slice(2);let b="";for(const [k,v] of Object.entries(fd)){b+=`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;}b+=`--${boundary}--\r\n`;
      return $http({method:"post",url:"https://apapia-history-weblogic.manmanbuy.com/h5/share/trendData",headers:{"content-type":`multipart/form-data; boundary=${boundary}`},body:b});})
    .then(r=>r.json());
}

/* ========== 样式格式化 ========== */
function buildTable(arr){return arr.map(x=>`<tr><td>${x.Name}</td><td>${x.Price}</td><td>${x.Date||""}</td><td>${x.Difference||""}</td></tr>`).join("");}
function buildRaw(arr){return arr.map(x=>`${x.Name} ${x.Price} ${x.Date||""} ${x.Difference||""}`).join("\n");}
function buildLine(prices){if(!prices.length)return'<div class="jd-muted">暂无折线数据</div>';const W=320,H=120,P=10,xmax=Math.max(1,prices.length-1);let ymin=Math.min(...prices),ymax=Math.max(...prices);if(!isFinite(ymin)||!isFinite(ymax))return"";const sx=(W-2*P)/xmax,sy=(H-2*P)/(ymax-ymin||1);let points=prices.map((p,i)=>`${P+i*sx},${H-P-(p-ymin)*sy}`).join(" ");return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline fill="none" stroke="#007aff" stroke-width="2" points="${points}"/></svg>`;} 

/* ========== 分支 A: 获取 token ========== */
if(MODE==="token" && /baoliao\/center\/menu/.test(REQ_URL)){try{const body=$request?.body||"";setval(KEY_BODY,body);let devId="";body.split("&").forEach(p=>{const kv=p.split("=");if(decodeURIComponent(kv[0]||"")==="c_mmbDevId")devId=decodeURIComponent(kv[1]||"");});setval(KEY_DEVID,devId);notify(APP,"获取ck成功🎉",devId?("c_mmbDevId="+devId):body.slice(0,120));}catch(e){notify(APP,"获取token异常",String(e.message||e));}done({});}

/* ========== 分支 B: 弹窗 ========== */
if(MODE==="popup" && typeof $response==="undefined"){(async()=>{try{const id=extractId(REQ_URL);if(!id){done({});return;}const data=await requestHistoryPrice(id);if(data&&data.ok===1){const r=data.result||{};const title=r?.trendData?.title||("商品 "+id);const detail=(r?.priceRemark?.ListPriceDetail||[]).map(x=>`${x.Name}:${x.Price}`).join("\n");notify(title,"历史比价",detail,{"open-url":`https://item.jd.com/${id}.html`});}}catch(e){notify(APP,"接口异常",String(e.message||e));}done({});})();}

/* ========== 分支 C: 页面渲染 ========== */
if(MODE==="render" && typeof $response!=="undefined"){(async()=>{try{const id=extractId(REQ_URL);if(!id){$done($response);return;}const data=await requestHistoryPrice(id);if(!(data&&data.ok===1)){$done($response);return;}const r=data.result||{};const arr=r?.priceRemark?.ListPriceDetail||[];const pts=(r.priceTrend||[]).map(x=>Number(x?.price||x?.Price||x?.p)).filter(x=>!isNaN(x));
  const style_table=String(ARG.style_table||"").toLowerCase()==="true";
  const style_raw=String(ARG.style_raw||"").toLowerCase()==="true";
  const style_line=String(ARG.style_line||"").toLowerCase()==="true";
  const line_only=String(ARG.line_only||"").toLowerCase()==="true";
  let content="";if(style_table)content=`<table>${buildTable(arr)}</table>`;else if(style_raw)content=`<pre>${buildRaw(arr)}</pre>`;else if(style_line)content=(line_only?"":`<table>${buildTable(arr)}</table>`)+buildLine(pts);else content=`<table>${buildTable(arr)}</table>`;
  const panel=`<div class="jd-price">${content}</div>`;let html=$response.body||"";html=/<\/body>/i.test(html)?html.replace(/<\/body>/i,panel+"</body>"):panel+html;$done({body:html});}catch(e){$done($response);}})();}

/* 默认放行 */
done({});
