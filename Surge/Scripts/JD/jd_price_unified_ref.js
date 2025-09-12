/* 京东比价｜条件分支版（token / popup / render）
 * - 仅当 $argument.mode === 'token' / 'popup' / 'render' 时，才执行对应分支
 * - 兼容 Surge / Loon / Stash / Egern / Quantumult X
 */

var NAME   = "京东比价";
var SECRET = "3E41D1331F5DDAFCD0A38FE2D52FF66F";
var MMB_KEY = "manmanbuy_val"; // 原始 body（含 c_mmbDevId）
var MMB_ID  = "慢慢买CK";       // 直接保存 devId（兼容老键名）

/* 环境封装（QX / Surge / Loon / Shadowrocket） */
var ENV_QX   = (typeof $task !== "undefined");
var ENV_SG   = (typeof $httpClient !== "undefined") && (typeof $loon === "undefined");
var ENV_LOON = (typeof $loon !== "undefined");
var ENV_SR   = (typeof $rocket !== "undefined"); // Shadowrocket

function notify(t,s,b,ext){try{ if(ENV_QX){$notify(t||"",s||"",b||"",ext||{});} else {$notification.post(t||"",s||"",b||"",ext||{});} }catch(e){}}
function done(v){try{$done(v||{});}catch(e){}}
function kvget(k){try{ return ENV_QX?$prefs.valueForKey(k):$persistentStore.read(k);}catch(e){return null;}}
function kvset(k,v){try{ return ENV_QX?$prefs.setValueForKey(v,k):$persistentStore.write(v,k);}catch(e){return false;}}

/* 参数解析（只读 $argument，不抛错） */
function parseArg(a){
  var o={}; if(!a) return o;
  try{
    var arr=String(a).split("&");
    for(var i=0;i<arr.length;i++){
      var kv=arr[i]; var p=kv.indexOf("=");
      if(p===-1) continue;
      var k=decodeURIComponent(kv.slice(0,p));
      var v=decodeURIComponent(kv.slice(p+1));
      o[k]=v;
    }
  }catch(e){}
  return o;
}
var ARG  = parseArg(typeof $argument==="string"?$argument:"");
var MODE = (ARG.mode||"").toLowerCase();

/* 兼容：CryptoJS（用于 MD5） */
function intCryptoJS(){CryptoJS=function(t,r){var n;if("undefined"!=typeof window&&window.crypto&&(n=window.crypto),"undefined"!=typeof self&&self.crypto&&(n=self.crypto),"undefined"!=typeof globalThis&&globalThis.crypto&&(n=globalThis.crypto),!n&&"undefined"!=typeof window&&window.msCrypto&&(n=window.msCrypto),!n&&"undefined"!=typeof global&&global.crypto&&(n=global.crypto),!n&&"function"==typeof require)try{n=require("crypto")}catch(t){}var e=function(){if(n){if("function"==typeof n.getRandomValues)try{return n.getRandomValues(new Uint32Array(1))[0]}catch(t){}if("function"==typeof n.randomBytes)try{return n.randomBytes(4).readInt32LE()}catch(t){}}throw new Error("Native crypto module could not be used to get secure random number.")},i=Object.create||function(){function t(){}return function(r){var n;return t.prototype=r,n=new t,t.prototype=null,n}}(),o={},a=o.lib={},s=a.Base={extend:function(t){var r=i(this);return t&&r.mixIn(t),r.hasOwnProperty("init")&&this.init!==r.init||(r.init=function(){r.$super.init.apply(this,arguments)}),r.init.prototype=r,r.$super=this,r},create:function(){var t=this.extend();return t.init.apply(this,arguments),t},init:function(){},mixIn:function(t){for(var r in t)t.hasOwnProperty(r)&&(this[r]=t[r]);t.hasOwnProperty("toString")&&(this.toString=t.toString)},clone:function(){return this.init.prototype.extend(this)}},c=a.WordArray=s.extend({init:function(t,r){t=this.words=t||[],this.sigBytes=null!=r?r:4*t.length},toString:function(t){return(t||f).stringify(this)},concat:function(t){var r=this.words,n=t.words,e=this.sigBytes,i=t.sigBytes;if(this.clamp(),e%4)for(var o=0;o<i;o++){var a=n[o>>>2]>>>24-o%4*8&255;r[e+o>>>2]|=a<<24-(e+o)%4*8}else for(var s=0;s<i;s+=4)r[e+s>>>2]=n[s>>>2];return this.sigBytes+=i,this},clamp:function(){var r=this.words,n=this.sigBytes;r[n>>>2]&=4294967295<<32-n%4*8,r.length=t.ceil(n/4)},clone:function(){var t=s.clone.call(this);return t.words=this.words.slice(0),t},random:function(r){var n,i=[],o=function(r){r=r;var n=987654321,e=4294967295;return function(){var i=((n=36969*(65535&n)+(n>>16)&e)<<16)+(r=18e3*(65535&r)+(r>>16)&e)&e;return i/=4294967296,(i+=.5)*(t.random()>.5?1:-1)}},a=!1;try{e(),a=!0}catch(t){}for(var s,u=0;u<r;u+=4)a?i.push(e()):(s=987654071*(n=o(4294967296*(s||t.random())))(),i.push(4294967296*n()|0));return new c.init(i,r)}}),u=o.enc={},f=u.Hex={stringify:function(t){for(var r=t.words,n=t.sigBytes,e=[],i=0;i<n;i++){var o=r[i>>>2]>>>24-i%4*8&255;e.push((o>>>4).toString(16)),e.push((15&o).toString(16))}return e.join("")},parse:function(t){for(var r=t.length,n=[],e=0;e<r;e+=2)n[e>>>3]|=parseInt(t.substr(e,2),16)<<24-e%8*4;return new c.init(n,r/2)}},h=u.Latin1={stringify:function(t){for(var r=t.words,n=t.sigBytes,e=[],i=0;i<n;i++){var o=r[i>>>2]>>>24-i%4*8&255;e.push(String.fromCharCode(o))}return e.join("")},parse:function(t){for(var r=t.length,n=[],e=0;e<r;e++)n[e>>>2]|=(255&t.charCodeAt(e))<<24-e%4*8;return new c.init(n,r)}},p=u.Utf8={stringify:function(t){try{return decodeURIComponent(escape(h.stringify(t)))}catch(t){throw new Error("Malformed UTF-8 data")}},parse:function(t){return h.parse(unescape(encodeURIComponent(t)))}},d=a.BufferedBlockAlgorithm=s.extend({reset:function(){this._data=new c.init,this._nDataBytes=0},_append:function(t){"string"==typeof t&&(t=p.parse(t)),this._data.concat(t),this._nDataBytes+=t.sigBytes},_process:function(r){var n,e=this._data,i=e.words,o=e.sigBytes,a=this.blockSize,s=o/(4*a),u=(s=r?t.ceil(s):t.max((0|s)-this._minBufferSize,0))*a,f=t.min(4*u,o);if(u){for(var h=0;h<u;h+=a)this._doProcessBlock(i,h);n=i.splice(0,u),e.sigBytes-=f}return new c.init(n,f)},clone:function(){var t=s.clone.call(this);return t._data=this._data.clone(),t},_minBufferSize:0}),l=(a.Hasher=d.extend({cfg:s.extend(),init:function(t){this.cfg=this.cfg.extend(t),this.reset()},reset:function(){d.reset.call(this),this._doReset()},update:function(t){return this._append(t),this._process(),this},finalize:function(t){return t&&this._append(t),this._doFinalize()},blockSize:16,_createHelper:function(t){return function(r,n){return new t.init(n).finalize(r)}},_createHmacHelper:function(t){return function(r,n){return new l.HMAC.init(t,n).finalize(r)}}}),o.algo={});return o}(Math);!function(t){var r=CryptoJS,n=r.lib,e=n.WordArray,i=n.Hasher,o=r.algo,a=[];!function(){for(var r=0;r<64;r++)a[r]=4294967296*t.abs(t.sin(r+1))|0}();var s=o.MD5=i.extend({_doReset:function(){this._hash=new e.init([1732584193,4023233417,2562383102,271733878])},_doProcessBlock:function(t,r){for(var n=0;n<16;n++){var e=r+n,i=t[e];t[e]=16711935&(i<<8|i>>>24)|4278255360&(i<<24|i>>>8)}var o=this._hash.words,s=t[r+0],p=t[r+1],d=t[r+2],l=t[r+3],y=t[r+4],v=t[r+5],g=t[r+6],w=t[r+7],_=t[r+8],m=t[r+9],B=t[r+10],b=t[r+11],C=t[r+12],S=t[r+13],x=t[r+14],A=t[r+15],H=o[0],z=o[1],M=o[2],D=o[3];z=h(z=h(z=h(z=h(z=f(z=f(z=f(z=f(z=u(z*u(z*u(z*u(z=c(z*c(z*c(z*c(z,M=c(M,D=c(D,H=c(H,z,M,D,s,7,a[0]),z,M,p,12,a[1]),H,z,d,17,a[2]),D,H,l,22,a[3]),M=c(M,D=c(D,H=c(H,z,M,D,y,7,a[4]),z,M,v,12,a[5]),H,z,g,17,a[6]),D,H,w,22,a[7]),M=c(M,D=c(D,H=c(H,z,M,D,_,7,a[8]),z,M,m,12,a[9]),H,z,B,17,a[10]),D,H,b,22,a[11]),M=c(M,D=c(D,H=c(H,z,M,D,C,7,a[12]),z,M,S,12,a[13]),H,z,x,17,a[14]),D,H,A,22,a[15]),M=u(M,D=u(D,H=u(H,z,M,D,p,5,a[16]),z,M,g,9,a[17]),H,z,b,14,a[18]),D,H,s,20,a[19]),M=u(M,D=u(D,H=u(H,z,M,D,v,5,a[20]),z,M,B,9,a[21]),H,z,A,14,a[22]),D,H,y,20,a[23]),M=u(M,D=u(D,H=u(H,z,M,D,m,5,a[24]),z,M,x,9,a[25]),H,z,l,14,a[26]),D,H,_,20,a[27]),M=u(M,D=u(D,H=u(H,z,M,D,S,5,a[28]),z,M,d,9,a[29]),H,z,w,14,a[30]),D,H,C,20,a[31]),M=f(M,D=f(D,H=f(H,z,M,D,v,4,a[32]),z,M,_,11,a[33]),H,z,b,16,a[34]),D,H,x,23,a[35]),M=f(M,D=f(D,H=f(H,z,M,D,p,4,a[36]),z,M,y,11,a[37]),H,z,w,16,a[38]),D,H,B,23,a[39]),M=f(M,D=f(D,H=f(H,z,M,D,S,4,a[40]),z,M,s,11,a[41]),H,z,l,16,a[42]),D,H,g,23,a[43]),M=f(M,D=f(D,H=f(H,z,M,D,m,4,a[44]),z,M,C,11,a[45]),H,z,A,16,a[46]),D,H,d,23,a[47]),M=h(M,D=h(D,H=h(H,z,M,D,s,6,a[48]),z,M,w,10,a[49]),H,z,x,15,a[50]),D,H,v,21,a[51]),M=h(M,D=h(D,H=h(H,z,M,D,C,6,a[52]),z,M,l,10,a[53]),H,z,B,15,a[54]),D,H,p,21,a[55]),M=h(M,D=h(D,H=h(H,z,M,D,_,6,a[56]),z,M,A,10,a[57]),H,z,g,15,a[58]),D,H,S,21,a[59]),M=h(M,D=h(D,H=h(H,z,M,D,y,6,a[60]),z,M,b,10,a[61]),H,z,d,15,a[62]),D,H,m,21,a[63]),o[0]=o[0]+H|0,o[1]=o[1]+z|0,o[2]=o[2]+M|0,o[3]=o[3]+D|0},_doFinalize:function(){var r=this._data,n=r.words,e=8*this._nDataBytes,i=8*r.sigBytes;n[i>>>5]|=128<<24-i%32;var o=t.floor(e/4294967296),a=e;n[15+(i+64>>>9<<4)]=16711935&(o<<8|o>>>24)|4278255360&(o<<24|o>>>8),n[14+(i+64>>>9<<4)]=16711935&(a<<8|a>>>24)|4278255360&(a<<24|a>>>8),r.sigBytes=4*(n.length+1),this._process();for(var s=this._hash,c=s.words,u=0;u<4;u++){var f=c[u];c[u]=16711935&(f<<8|f>>>24)|4278255360&(f<<24|f>>>8)}return s},clone:function(){var t=i.clone.call(this);return t._hash=this._hash.clone(),t}});function c(t,r,n,e,i,o,a){var s=t+(r&n|~r&e)+i+a;return(s<<o|s>>>32-o)+r}function u(t,r,n,e,i,o,a){var s=t+(r&e|n&~e)+i+a;return(s<<o|s>>>32-o)+r}function f(t,r,n,e,i,o,a){var s=t+(r^n^e)+i+a;return(s<<o|s>>>32-o)+r}function h(t,r,n,e,i,o,a){var s=t+(n^(r|~e))+i+a;return(s<<o|s>>>32-o)+r}r.MD5=i._createHelper(s),r.HmacMD5=i._createHmacHelper(s)}(Math),function(){var t=CryptoJS,r=t.lib.WordArray;t.enc.Base64={stringify:function(t){var r=t.words,n=t.sigBytes,e=this._map;t.clamp();for(var i=[],o=0;o<n;o+=3)for(var a=(r[o>>>2]>>>24-o%4*8&255)<<16|(r[o+1>>>2]>>>24-(o+1)%4*8&255)<<8|r[o+2>>>2]>>>24-(o+2)%4*8&255,s=0;s<4&&o+.75*s<n;s++)i.push(e.charAt(a>>>6*(3-s)&63));var c=e.charAt(64);if(c)for(;i.length%4;)i.push(c);return i.join("")},parse:function(t){var n=t.length,e=this._map,i=this._reverseMap;if(!i){i=this._reverseMap=[];for(var o=0;o<e.length;o++)i[e.charCodeAt(o)]=o}var a=e.charAt(64);if(a){var s=t.indexOf(a);-1!==s&&(n=s)}return function(t,n,e){for(var i=[],o=0,a=0;a<n;a++)if(a%4){var s=e[t.charCodeAt(a-1)]<<a%4*2,c=e[t.charCodeAt(a)]>>>6-a%4*2;i[o>>>2]|=(s|c)<<24-o%4*8,o++}return r.create(i,o)}(t,n,i)},_map:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="}}();};function md5(word){return CryptoJS.MD5(word).toString();}

/* 工具函数 */
function parseQueryString(q){var o={};var s=String(q||"").split("&");for(var i=0;i<s.length;i++){var kv=s[i].split("=");var k=decodeURIComponent(kv[0]||"");var v=decodeURIComponent(kv[1]||"");o[k]=v;}return o;}
function jsonToQueryString(o){var arr=[];for(var k in o){if(o.hasOwnProperty(k)){arr.push(encodeURIComponent(k)+"="+encodeURIComponent(o[k]));}}return arr.join("&");}
function jsonToCustomString(o){var keys=[];for(var k in o){if(o.hasOwnProperty(k)){if(String(k).toLowerCase()!=="token" && o[k]!==""){keys.push(k);}}}keys.sort();var s="";for(var i=0;i<keys.length;i++){var kk=keys[i];s+=String(kk).toUpperCase()+String(o[kk]).toUpperCase();}return s;}
function extractId(u){
  if(!u) return null;
  var m=u.match(/\/product\/(?:[A-Za-z]+\/)?(\d+)\.html/); if(m&&m[1]) return m[1];
  m=u.match(/[?&](?:wareId|sku|id)=(\d+)/); if(m&&m[1]) return m[1];
  m=u.match(/\/(\d+)\.html(?:[#?]|$)/); if(m&&m[1]) return m[1];
  return null;
}
function getDevId(){
  var raw = kvget(MMB_KEY);
  var direct = kvget(MMB_ID);
  var id = "";
  try{ id = (raw && parseQueryString(raw).c_mmbDevId) || direct || ""; }catch(e){}
  return id||"";
}

/* HTTP（Promise 包装，无新语法） */
function http(op, cb){
  try{
    var m = (op.method||op.method||"GET").toUpperCase();
    if(ENV_QX){
      op.method=m;
      $task.fetch(op).then(function(resp){cb(null, resp);}, function(err){cb(err, null);});
    }else{
      if(m==="POST"||m==="PUT"||m==="PATCH"){
        $httpClient.post(op, function(e,r,d){ if(r){r.body=d;} cb(e,r); });
      }else{
        $httpClient.get(op, function(e,r,d){ if(r){r.body=d;} cb(e,r); });
      }
    }
  }catch(e){ cb(e, null); }
}
function httpp(op){
  return new Promise(function(resolve,reject){
    http(op, function(err, res){ if(err) reject(err); else resolve(res);});
  });
}

/* 慢慢买：历史价格请求（与可用脚本同流程） */
function request_history_price(id){
  var dev = getDevId();
  if(!dev){ notify(NAME,"提示","请先打开【慢慢买】App → 我的，获取 ck 后再试"); return Promise.reject("no devId"); }

  intCryptoJS();
  var shareBody={methodName:"trendJava",spbh:"1|"+id,url:"https://item.jd.com/"+id+".html",t:String(Date.now()),c_appver:"4.8.3.1",c_mmbDevId:dev};
  shareBody.token = md5(encodeURIComponent(SECRET + jsonToCustomString(shareBody) + SECRET)).toUpperCase();

  var headers={"Content-Type":"application/x-www-form-urlencoded; charset=utf-8","User-Agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 13_1_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 - mmbWebBrowse - ios"};

  var reqShare={method:"POST",url:"https://apapia-history-weblogic.manmanbuy.com/app/share",headers:headers,body:jsonToQueryString(shareBody)};

  function buildMultipart(fields){
    var boundary="----WebKitFormBoundary"+Math.random().toString(36).slice(2);
    var body=""; for(var k in fields){ if(fields.hasOwnProperty(k)){ body+="--"+boundary+"\r\nContent-Disposition: form-data; name=\""+k+"\"\r\n\r\n"+fields[k]+"\r\n"; } }
    body+="--"+boundary+"--\r\n";
    return {body:body,boundary:boundary};
  }

  return httpp(reqShare).then(function(res){
    var obj={}; try{ obj=JSON.parse(res.body||"{}"); }catch(e){}
    if(!(obj && obj.code===2000 && obj.data)){ throw new Error((obj&&obj.msg)||"share错误"); }
    var dataUrl = String(obj.data||"");
    var q = ""; var qi = dataUrl.indexOf("?");
    if(qi>=0) q = dataUrl.slice(qi+1);
    var sp = parseQueryString(q);
    var fields={shareId:sp.shareId, sign:sp.sign, spbh:sp.spbh, url:sp.url};
    var mp = buildMultipart(fields);
    return httpp({method:"POST",url:"https://apapia-history-weblogic.manmanbuy.com/h5/share/trendData",headers:{"content-type":"multipart/form-data; boundary="+mp.boundary},body:mp.body});
  }).then(function(res2){
    var obj2={}; try{ obj2=JSON.parse(res2.body||"{}"); }catch(e){}
    return obj2;
  });
}

/* 展示工具（纯文本对齐） */
function historySummary(result){
  var arr=(result&&result.priceRemark&&result.priceRemark.ListPriceDetail)||[];
  var out=[], re=/历史最高|常购价/;
  for(var i=0;i<arr.length;i++){
    var it=arr[i]; if(re.test(it.Name||"")) continue;
    out.push({Name:it.Name,Price:it.Price,Date:it.Date,Diff:it.Difference});
  }
  return out;
}
function priceSummaryBlock(data){
  var list=historySummary(data); if(!list.length) return "暂无数据";
  var w=0; for(var i=0;i<list.length;i++){ var s=String(list[i].Price||"-"); if(s.length>w) w=s.length; }
  var map={"双11价格":"双十一价格","618价格":"六一八价格","30天最低价":"三十天最低","60天最低价":"六十天最低","180天最低价":"一百八最低"};
  var out="";
  for(var j=0;j<list.length;j++){
    var it=list[j]; var name=map[it.Name]||it.Name; var price=String(it.Price||"-");
    if(price!=="-"){ if(price.indexOf(".")<0 && price.length+1===w) price+="."; var pad=(price.indexOf(".")>=0)?"0":" "; while(price.length<w) price+=pad; }
    out+=name+"  "+price+"  "+(it.Date||"")+"  "+(it.Diff==='-'?"":(it.Diff||""))+"\n";
  }
  if(out.slice(-1)==="\n") out=out.slice(0,-1);
  return out;
}
function lowerMsg(r){
  var lp = r && r.priceRemark ? r.priceRemark.lowestPrice : "";
  var dt = r && r.priceRemark ? String(r.priceRemark.lowestDate||"").slice(0,10) : "";
  return "历史最低:¥"+lp+(dt?("("+dt+")"):"")+" ";
}

/* ===== 分支：仅当 mode 命中才执行；否则直接放行 ===== */
var reqUrl = (typeof $request!=="undefined" && $request.url) ? $request.url : "";

/* A) 获取 token（仅 mode=token） */
if(MODE==="token"){
  if(/apapia-sqk-weblogic\.manmanbuy\.com\/baoliao\/center\/menu/.test(reqUrl)){
    try{
      var body = ($request && $request.body) ? $request.body : "";
      kvset(MMB_KEY, body);
      // 解析 c_mmbDevId（不依赖 URLSearchParams）
      var devId=""; var pairs=String(body).split("&");
      for(var i=0;i<pairs.length;i++){
        var kv=pairs[i].split("=");
        var k=decodeURIComponent(kv[0]||"");
        if(k==="c_mmbDevId"){ devId=decodeURIComponent(kv[1]||""); break; }
      }
      kvset(MMB_ID, devId);
      var tip = body ? (body.length>280? (body.slice(0,280)+"…") : body) : "（请求体为空）";
      notify(NAME,"获取ck成功🎉", tip);
    }catch(e){
      notify(NAME+"｜获取token异常","", String(e&&e.message?e.message:e));
    }
  }
  return done({});
}

/* B) 弹窗（仅 mode=popup，request 钩子） */
if(MODE==="popup" && typeof $response==="undefined"){
  var pid = extractId(reqUrl); if(!pid) return done({});
  request_history_price(pid).then(function(data){
    if(data && data.ok===1){
      var r=data.result; var detail=priceSummaryBlock(r); var tip=((r.priceRemark&&r.priceRemark.Tip)||"")+"(仅供参考)";
      notify(r.trendData && r.trendData.title ? r.trendData.title : ("商品 "+pid), lowerMsg(r)+" "+tip, detail, {"open-url":"https://item.jd.com/"+pid+".html","update-pasteboard":detail});
    }else if(data && data.ok===0 && data.msg){
      notify("比价结果","", "慢慢买提示您："+data.msg);
    }
    done({});
  }).catch(function(e){ notify(NAME+"｜接口异常","", String(e)); done({}); });
  return;
}

/* C) 页面渲染（仅 mode=render，response 钩子） */
if(MODE==="render" && typeof $response!=="undefined"){
  var rid = extractId(reqUrl);
  if(!rid){ try{$done($response);}catch(e){done({});} return; }
  request_history_price(rid).then(function(data){
    if(!(data && data.ok===1)){ try{$done($response);}catch(e){done({});} return; }
    var r=data.result;
    var title = (r.trendData && r.trendData.title) ? r.trendData.title : ("商品 "+rid);
    var tip   = ((r.priceRemark && r.priceRemark.Tip) || "") + "（仅供参考）";
    var lower = lowerMsg(r);
    var summary = priceSummaryBlock(r);

    var css = '<style>.jd-price-panel{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,PingFang SC,Helvetica,Arial;line-height:1.35;box-shadow:0 6px 18px rgba(0,0,0,.08);border:1px solid #eee;border-radius:12px;padding:12px 14px;margin:10px 8px;background:#fff}.jd-price-panel h3{font-size:15px;margin:0 0 8px 0}.jd-price-meta{color:#666;font-size:12px;margin-bottom:8px}.jd-price-pre{font-size:12px;background:#fafafa;border:1px dashed #ddd;border-radius:8px;padding:8px;white-space:pre-wrap}.jd-price-muted{color:#999}table.jdpt{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}table.jdpt th,table.jdpt td{border:1px solid #eee;padding:6px 8px;text-align:left}</style>';

    var style_table = String(ARG.style_table||"").toLowerCase()==="true";
    var style_raw   = String(ARG.style_raw  ||"").toLowerCase()==="true";
    var style_line  = String(ARG.style_line ||"").toLowerCase()==="true";
    var line_only   = String(ARG.line_only  ||"").toLowerCase()==="true";

    // 表格
    var arr=(r.priceRemark&&r.priceRemark.ListPriceDetail)||[];
    var rows=""; var re=/历史最高|常购价/;
    for(var i=0;i<arr.length;i++){
      var it=arr[i]; if(re.test(it.Name||"")) continue;
      rows+='<tr><td>'+ (it.Name||"") +'</td><td>'+ (it.Price||"-") +'</td><td>'+ (it.Date||"") +'</td><td>'+ (it.Difference==='-'?"":(it.Difference||"")) +'</td></tr>';
    }
    var tableHtml = rows ? '<table class="jdpt"><thead><tr><th>名称</th><th>价格</th><th>日期</th><th>差异</th></tr></thead><tbody>'+rows+'</tbody></table>' : '<div class="jd-price-muted">暂无表格数据</div>';

    // 简易折线（SVG）
    var content="";
    if(style_table){
      content = tableHtml;
    }else if(style_line){
      if(!line_only) content = tableHtml;
      var list = r.priceTrend||[]; var pts=[], p, k;
      for(k=0;k<list.length;k++){ p=Number( list[k] && (list[k].price!=null?list[k].price:(list[k].Price!=null?list[k].Price:list[k].p)) ); if(!isNaN(p)) pts.push(p); }
      if(pts.length){
        var W=320,H=120,P=10,xmax=Math.max(1,pts.length-1), ymin=pts[0], ymax=pts[0];
        for(k=1;k<pts.length;k++){ if(pts[k]<ymin) ymin=pts[k]; if(pts[k]>ymax) ymax=pts[k]; }
        if(!(isFinite(ymin)&&isFinite(ymax))){ymin=0;ymax=1;}
        var sx=(W-2*P)/xmax, sy=(H-2*P)/Math.max(1,(ymax-ymin)||1);
        var points=""; for(k=0;k<pts.length;k++){ var xx=P+k*sx; var yy=H-P-((pts[k]-ymin)*sy); points+=(k?",":"")+xx+","+yy; }
        content += '<svg style="width:100%;height:120px;margin-top:6px" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none"><polyline fill="none" stroke="#007aff" stroke-width="2" points="'+points+'"/></svg>';
      }else{
        content += '<div class="jd-price-muted">暂无折线数据</div>';
      }
    }else if(style_raw){
      function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
      content = '<pre class="jd-price-pre">'+ esc(summary) +'</pre>';
    }else{
      content = tableHtml; // 默认表格
    }

    var panel = css+'<div class="jd-price-panel"><h3>🧾 '+title+'</h3><div class="jd-price-meta">'+lower+'<span class="jd-price-muted"> '+tip+'</span></div>'+content+'</div>';
    var html = $response.body || "";
    if(/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, panel+"</body>");
    else html = panel + html;
    $done({body:html});
  }).catch(function(e){
    try{$done($response);}catch(_){done({});}
  });
  return;
}

/* 其他情况：mode 不匹配，直接放行 */
done({});

