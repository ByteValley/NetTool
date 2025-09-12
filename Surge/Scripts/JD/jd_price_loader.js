/* 京东比价 · 单脚本（慢慢买核心版）
 * - mode=token / mode=popup / mode=render
 * - render: style_table=true | style_line=true&line_only=true|false
 * - 仅需 MITM: in.m.jd.com, apapia-sqk-weblogic.manmanbuy.com
 */

(function(){
  /* ===== 轻量工具 ===== */
  function notify(t,s,b,ext){try{ if(typeof $task!=="undefined"){$notify(t||"",s||"",b||"",ext||{});}else{$notification.post(t||"",s||"",b||"",ext||{});} }catch(e){}}
  function done(v){try{$done(v||{});}catch(e){}}
  function getval(k){try{ return (typeof $task!=="undefined")?$prefs.valueForKey(k):$persistentStore.read(k);}catch(_){return null;}}
  function setval(k,v){try{ return (typeof $task!=="undefined")?$prefs.setValueForKey(v,k):$persistentStore.write(v,k);}catch(_){return false;}}
  function parseArg(a){var o={}; if(!a) return o; try{var arr=String(a).split(/[&;]/); for(var i=0;i<arr.length;i++){var kv=arr[i]; var p=kv.indexOf("="); if(p===-1) continue; var k=decodeURIComponent(kv.slice(0,p)); var v=decodeURIComponent(kv.slice(p+1)); o[k]=v;}}catch(e){} return o;}
  var ARG  = parseArg(typeof $argument==="string"?$argument:"");
  var MODE = (ARG.mode||"").toLowerCase();

  // 兼容 Promise.withResolvers
  if(typeof Promise.withResolvers!=="function"){
    Promise.withResolvers=function(){var resolve,reject;var promise=new Promise(function(res,rej){resolve=res;reject=rej;});return {promise:promise,resolve:resolve,reject:reject};};
  }

  // HTTP
  function $http(op, t){ t=t||6;
    var pr=Promise.withResolvers(); var timer=setTimeout(function(){pr.reject(new Error("timeout"));}, (op.$timeout||t)*1000);
    function end(){try{clearTimeout(timer);}catch(_){}}
    function handle(res, err){
      try{
        if(!res) throw err||new Error("empty response");
        res.status = res.status||res.statusCode;
        res.json = function(){ return JSON.parse(res.body); };
        if(res.error || res.status<200 || res.status>307) throw (res.error||new Error("HTTP "+res.status));
        pr.resolve(res);
      }catch(e){ pr.reject(e); }
    }
    try{
      if(typeof $task!=="undefined"){
        $task.fetch(op.url?op:({url:op})).then(function(r){handle({status:r.statusCode,body:r.body,headers:r.headers},null);},function(e){handle(null,e);});
      }else{
        $httpClient[op.method||"get"](op, function(e,r,b){ r=r||{}; r.body=b; handle(r,e); });
      }
    }catch(e){ pr.reject(e); }
    return pr.promise.finally(end);
  }

  /* ===== Crypto / token ===== */
  function intCryptoJS(){CryptoJS=function(t,r){var n;if("undefined"!=typeof window&&window.crypto&&(n=window.crypto),"undefined"!=typeof self&&self.crypto&&(n=self.crypto),"undefined"!=typeof globalThis&&globalThis.crypto&&(n=globalThis.crypto),!n&&"undefined"!=typeof window&&window.msCrypto&&(n=window.msCrypto),!n&&"undefined"!=typeof global&&global.crypto&&(n=global.crypto),!n&&"function"==typeof require)try{n=require("crypto")}catch(t){}var e=function(){if(n){if("function"==typeof n.getRandomValues)try{return n.getRandomValues(new Uint32Array(1))[0]}catch(t){}if("function"==typeof n.randomBytes)try{return n.randomBytes(4).readInt32LE()}catch(t){}}throw new Error("Native crypto module could not be used to get secure random number.")},i=Object.create||function(){function t(){}return function(r){var n;return t.prototype=r,n=new t,t.prototype=null,n}}(),o={},a=o.lib={},s=a.Base={extend:function(t){var r=i(this);return t&&r.mixIn(t),r.hasOwnProperty("init")&&this.init!==r.init||(r.init=function(){r.$super.init.apply(this,arguments)}),r.init.prototype=r,r.$super=this,r},create:function(){var t=this.extend();return t.init.apply(this,arguments),t},init:function(){},mixIn:function(t){for(var r in t)t.hasOwnProperty(r)&&(this[r]=t[r]);t.hasOwnProperty("toString")&&(this.toString=t.toString)},clone:function(){return this.init.prototype.extend(this)}},c=a.WordArray=s.extend({init:function(t,r){t=this.words=t||[],this.sigBytes=null!=r?r:4*t.length},toString:function(t){return(t||f).stringify(this)},concat:function(t){var r=this.words,n=t.words,e=this.sigBytes,i=t.sigBytes;if(this.clamp(),e%4)for(var o=0;o<i;o++){var a=n[o>>>2]>>>24-o%4*8&255;r[e+o>>>2]|=a<<24-(e+o)%4*8}else for(var s=0;s<i;s+=4)r[e+s>>>2]=n[s>>>2];return this.sigBytes+=i,this},clamp:function(){var r=this.words,n=this.sigBytes;r[n>>>2]&=4294967295<<32-n%4*8,r.length=t.ceil(n/4)},clone:function(){var t=s.clone.call(this);return t.words=this.words.slice(0),t},random:function(r){var n,i=[],o=function(r){r=r;var n=987654321,e=4294967295;return function(){var i=((n=36969*(65535&n)+(n>>16)&e)<<16)+(r=18e3*(65535&r)+(r>>16)&e)&e;return i/=4294967296,(i+=.5)*(t.random()>.5?1:-1)}},a=!1;try{e(),a=!0}catch(t){}for(var s,u=0;u<r;u+=4)a?i.push(e()):(s=987654071*(n=o(4294967296*(s||t.random())))(),i.push(4294967296*n()|0));return new c.init(i,r)}}),u=o.enc={},f=u.Hex={stringify:function(t){for(var r=t.words,n=t.sigBytes,e=[],i=0;i<n;i++){var o=r[i>>>2]>>>24-i%4*8&255;e.push((o>>>4).toString(16)),e.push((15&o).toString(16))}return e.join("")},parse:function(t){for(var r=t.length,n=[],e=0;e<r;e+=2)n[e>>>3]|=parseInt(t.substr(e,2),16)<<24-e%8*4;return new c.init(n,r/2)}},h=u.Latin1={stringify:function(t){for(var r=t.words,n=t.sigBytes,e=[],i=0;i<n;i++){var o=r[i>>>2]>>>24-i%4*8&255;e.push(String.fromCharCode(o))}return e.join("")},parse:function(t){for(var r=t.length,n=[],e=0;e<r;e++)n[e>>>2]|=(255&t.charCodeAt(e))<<24-e%4*8;return new c.init(n,r)}},p=u.Utf8={stringify:function(t){try{return decodeURIComponent(escape(h.stringify(t)))}catch(t){throw new Error("Malformed UTF-8 data")}},parse:function(t){return h.parse(unescape(encodeURIComponent(t)))}},d=a.BufferedBlockAlgorithm=s.extend({reset:function(){this._data=new c.init,this._nDataBytes=0},_append:function(t){"string"==typeof t&&(t=p.parse(t)),this._data.concat(t),this._nDataBytes+=t.sigBytes},_process:function(r){var n,e=this._data,i=e.words,o=e.sigBytes,a=this.blockSize,s=o/(4*a),u=(s=r?t.ceil(s):t.max((0|s)-this._minBufferSize,0))*a,f=t.min(4*u,o);if(u){for(var h=0;h<u;h+=a)this._doProcessBlock(i,h);n=i.splice(0,u),e.sigBytes-=f}return new c.init(n,f)},clone:function(){var t=s.clone.call(this);return t._data=this._data.clone(),t},_minBufferSize:0}),l=(a.Hasher=d.extend({cfg:s.extend(),init:function(t){this.cfg=this.cfg.extend(t),this.reset()},reset:function(){d.reset.call(this),this._doReset()},update:function(t){return this._append(t),this._process(),this},finalize:function(t){return t&&this._append(t),this._doFinalize()},blockSize:16,_createHelper:function(t){return function(r,n){return new t.init(n).finalize(r)}},_createHmacHelper:function(t){return function(r,n){return new l.HMAC.init(t,n).finalize(r)}}}),o.algo={});return o}(Math);!function(t){var r=CryptoJS,n=r.lib,e=n.WordArray,i=n.Hasher,o=r.algo,a=[];!function(){for(var r=0;r<64;r++)a[r]=4294967296*t.abs(t.sin(r+1))|0}();var s=o.MD5=i.extend({_doReset:function(){this._hash=new e.init([1732584193,4023233417,2562383102,271733878])},_doProcessBlock:function(t,r){for(var n=0;n<16;n++){var e=r+n,i=t[e];t[e]=16711935&(i<<8|i>>>24)|4278255360&(i<<24|i>>>8)}var o=this._hash.words,s=t[r+0],p=t[r+1],d=t[r+2],l=t[r+3],y=t[r+4],v=t[r+5],g=t[r+6],w=t[r+7],_=t[r+8],m=t[r+9],B=t[r+10],b=t[r+11],C=t[r+12],S=t[r+13],x=t[r+14],A=t[r+15],H=o[0],z=o[1],M=o[2],D=o[3];z=h(z=h(z=h(z=h(z=f(z=f(z=f(z=f(z=u(z=u(z*u(z*u(z=c(z*c(z*c(z*c(z,M=c(M,D=c(D,H=c(H,z,M,D,s,7,a[0]),z,M,p,12,a[1]),H,z,d,17,a[2]),D,H,l,22,a[3]),M=c(M,D=c(D,H=c(H,z,M,D,y,7,a[4]),z,M,v,12,a[5]),H,z,g,17,a[6]),D,H,w,22,a[7]),M=c(M,D=c(D,H=c(H,z,M,D,_,7,a[8]),z,M,m,12,a[9]),H,z,B,17,a[10]),D,H,b,22,a[11]),M=c(M,D=c(D,H=c(H,z,M,D,C,7,a[12]),z,M,S,12,a[13]),H,z,x,17,a[14]),D,H,A,22,a[15]),M=u(M,D=u(D,H=u(H,z,M,D,p,5,a[16]),z,M,g,9,a[17]),H,z,b,14,a[18]),D,H,s,20,a[19]),M=u(M,D=u(D,H=u(H,z,M,D,v,5,a[20]),z,M,B,9,a[21]),H,z,A,14,a[22]),D,H,y,20,a[23]),M=u(M,D=u(D,H=u(H,z,M,D,m,5,a[24]),z,M,x,9,a[25]),H,z,l,14,a[26]),D,H,_,20,a[27]),M=u(M,D=u(D,H=u(H,z,M,D,S,5,a[28]),z,M,d,9,a[29]),H,z,w,14,a[30]),D,H,C,20,a[31]),M=f(M,D=f(D,H=f(H,z,M,D,v,4,a[32]),z,M,_,11,a[33]),H,z,b,16,a[34]),D,H,x,23,a[35]),M=f(M,D=f(D,H=f(H,z,M,D,p,4,a[36]),z,M,y,11,a[37]),H,z,w,16,a[38]),D,H,B,23,a[39]),M=f(M,D=f(D,H=f(H,z,M,D,S,4,a[40]),z,M,s,11,a[41]),H,z,l,16,a[42]),D,H,g,23,a[43]),M=f(M,D=f(D,H=f(H,z,M,D,m,4,a[44]),z,M,C,11,a[45]),H,z,A,16,a[46]),D,H,d,23,a[47]),M=h(M,D=h(D,H=h(H,z,M,D,s,6,a[48]),z,M,w,10,a[49]),H,z,x,15,a[50]),D,H,v,21,a[51]),M=h(M,D=h(D,H=h(H,z,M,D,C,6,a[52]),z,M,l,10,a[53]),H,z,B,15,a[54]),D,H,p,21,a[55]),M=h(M,D=h(D,H=h(H,z,M,D,_,6,a[56]),z,M,A,10,a[57]),H,z,g,15,a[58]),D,H,S,21,a[59]),M=h(M,D=h(D,H=h(H,z,M,D,y,6,a[60]),z,M,b,10,a[61]),H,z,d,15,a[62]),D,H,m,21,a[63]),o[0]=o[0]+H|0,o[1]=o[1]+z|0,o[2]=o[2]+M|0,o[3]=o[3]+D|0},_doFinalize:function(){var r=this._data,n=r.words,e=8*this._nDataBytes,i=8*r.sigBytes;n[i>>>5]|=128<<24-i%32;var o=t.floor(e/4294967296),a=e;n[15+(i+64>>>9<<4)]=16711935&(o<<8|o>>>24)|4278255360&(o<<24|o>>>8),n[14+(i+64>>>9<<4)]=16711935&(a<<8|a>>>24)|4278255360&(a<<24|a>>>8),r.sigBytes=4*(n.length+1),this._process();for(var s=this._hash,c=s.words,u=0;u<4;u++){var f=c[u];c[u]=16711935&(f<<8|f>>>24)|4278255360&(f<<24|f>>>8)}return s},clone:function(){var t=i.clone.call(this);return t._hash=this._hash.clone(),t}});function c(t,r,n,e,i,o,a){var s=t+(r&n|~r&e)+i+a;return(s<<o|s>>>32-o)+r}function u(t,r,n,e,i,o,a){var s=t+(r&e|n&~e)+i+a;return(s<<o|s>>>32-o)+r}function f(t,r,n,e,i,o,a){var s=t+(r^n^e)+i+a;return(s<<o|s>>>32-o)+r}function h(t,r,n,e,i,o,a){var s=t+(n^(r|~e))+i+a;return(s<<o|s>>>32-o)+r}r.MD5=i._createHelper(s),r.HmacMD5=i._createHmacHelper(s)}(Math),function(){var t=CryptoJS,r=t.lib.WordArray;t.enc.Base64={stringify:function(t){var r=t.words,n=t.sigBytes,e=this._map;t.clamp();for(var i=[],o=0;o<n;o+=3)for(var a=(r[o>>>2]>>>24-o%4*8&255)<<16|(r[o+1>>>2]>>>24-(o+1)%4*8&255)<<8|r[o+2>>>2]>>>24-(o+2)%4*8&255,s=0;s<4&&o+.75*s<n;s++)i.push(e.charAt(a>>>6*(3-s)&63));var c=e.charAt(64);if(c)for(;i.length%4;)i.push(c);return i.join("")},parse:function(t){var n=t.length,e=this._map,i=this._reverseMap;if(!i){i=this._reverseMap=[];for(var o=0;o<e.length;o++)i[e.charCodeAt(o)]=o}var a=e.charAt(64);if(a){var s=t.indexOf(a);-1!==s&&(n=s)}return function(t,n,e){for(var i=[],o=0,a=0;a<n;a++)if(a%4){var s=e[t.charCodeAt(a-1)]<<a%4*2,c=e[t.charCodeAt(a)]>>>6-a%4*2;i[o>>>2]|=(s|c)<<24-o%4*8,o++}return r.create(i,o)}(t,n,i)},_map:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="}}();}; function md5(x){return CryptoJS.MD5(x).toString();}
  function jsonToQueryString(obj){var a=[]; for(var k in obj){a.push(encodeURIComponent(k)+"="+encodeURIComponent(obj[k]));} return a.join("&");}
  function jsonToCustomString(obj){var keys=[], k; for(k in obj){ if(obj[k]!=="" && String(k).toLowerCase()!=="token") keys.push(k); } keys.sort(); var s=""; for(var i=0;i<keys.length;i++){k=keys[i]; s+=String(k).toUpperCase()+String(obj[k]).toUpperCase();} return s;}

  /* ===== token 捕获（mode=token）====== */
  var reqUrl = (typeof $request!=="undefined" && $request.url) || "";
  if(MODE==="token" && /\/baoliao\/center\/menu$/.test(reqUrl)){
    try{
      var body = ($request.body||"");
      setval("manmanbuy_val", body); // 原 body
      // 解析 c_mmbDevId 以便快速显示
      var devId=""; try{
        if(typeof URLSearchParams==="function"){ var p=new URLSearchParams(body); devId=p.get("c_mmbDevId")||""; }
        else { var arr=String(body).split("&"); for(var i=0;i<arr.length;i++){ var kv=arr[i].split("="); if(decodeURIComponent(kv[0]||"")==="c_mmbDevId"){devId=decodeURIComponent(kv[1]||"");break;} } }
      }catch(_){}
      setval("慢慢买CK", devId);
      notify("京东比价","获取ck成功🎉", body.slice(0,300));
    }catch(e){
      notify("京东比价｜获取token异常","", String(e&&e.message?e.message:e));
    }
    return done({});
  }

  /* ===== 慢慢买接口（你给的链路） ===== */
  function getMMdata(id){
    function getmmCK(){
      var ck=getval("慢慢买CK");
      if(ck) return ck;
      throw new Error("未获取 ck，请先打开【慢慢买】APP→我的，获取 ck");
    }
    function reqOpts(url, buildBody){
      var headers={"Content-Type":"application/x-www-form-urlencoded; charset=utf-8","User-Agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 13_1_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 - mmbWebBrowse - ios"};
      function setArgs(extra){
        var args={ t:String(Date.now()), c_appver:"4.8.3.1", c_mmbDevId:getmmCK() };
        for(var k in extra){ args[k]=extra[k]; }
        var token=md5( encodeURIComponent("3E41D1331F5DDAFCD0A38FE2D52FF66F"+jsonToCustomString(args)+"3E41D1331F5DDAFCD0A38FE2D52FF66F") ).toUpperCase();
        args.token=token;
        return jsonToQueryString(args);
      }
      return { method:"post", url:url, headers:headers, body: buildBody(setArgs) };
    }
    function apiCall(url, build){
      return $http(reqOpts(url, build)).then(function(resp){
        var body=resp.json();
        if(!/trendData$/.test(url) && body.code!==2000){ throw new Error(url+"："+body.msg); }
        return body;
      });
    }
    return apiCall("https://apapia-common.manmanbuy.com/SiteCommand/parse", function(set){ return set({methodName:"commonMethod", searchKey:"https://item.jd.com/"+id+".html"}); })
      .then(function(d){ var stteId=d.result.stteId, link=d.result.link;
        return apiCall("https://apapia-history-weblogic.manmanbuy.com/basic/v2/getItemBasicInfo", function(set){ return set({methodName:"getHistoryInfoJava", searchKey:link, stteId:stteId}); });
      })
      .then(function(d){ var spbh=d.result.spbh, url=d.result.url;
        return apiCall("https://apapia-history-weblogic.manmanbuy.com/app/share", function(set){ return set({methodName:"trendJava", spbh:spbh, url:url}); });
      })
      .then(function(d){ return apiCall("https://apapia-history-weblogic.manmanbuy.com/h5/share/trendData", function(){ return String(d.data).split("?")[1]; }); });
  }

  function extractId(u){
    var m=u.match(/\/product\/(?:[A-Za-z]+\/)?(\d+)\.html/); if(m&&m[1])return m[1];
    m=u.match(/[?&](?:wareId|sku|id)=(\d+)/); if(m&&m[1])return m[1];
    m=u.match(/\/(\d+)\.html(?:[#?]|$)/); if(m&&m[1])return m[1];
    return null;
  }

  /* ===== 弹窗（mode=popup）====== */
  if(MODE==="popup" && typeof $response==="undefined"){
    try{
      var id=extractId(reqUrl); if(!id) return done({});
      intCryptoJS();
      getMMdata(id).then(function(data){
        if(data && data.ok===1){
          var r=data.result;
          // 最低价 + 对齐摘要
          var lower="历史最低:¥"+String(r.priceRemark.lowestPrice);
          var ld=(r.priceRemark.lowestDate||"").slice(0,10); if(ld) lower+="("+ld+")";
          // 历史摘要（对齐）
          function toList(res){
            var arr=res.priceRemark.ListPriceDetail||[];
            var out=[], max=0, i, it, name;
            for(i=0;i<arr.length;i++){ it=arr[i]; if(/历史最高|常购价/.test(it.ShowName||it.Name||"")) continue;
              var price=String(it.Price||"-"); if(price!=="-") max=Math.max(max, price.length);
              out.push({n:(it.ShowName||it.Name||""), p:price, d:(it.Date||""), diff:(it.Difference||"")});
            }
            var map={"双11价格":"双十一价格","618价格":"六一八价格","30天最低价":"三十天最低","60天最低价":"六十天最低","180天最低价":"一百八最低"};
            var lines=[];
            for(i=0;i<out.length;i++){ it=out[i]; name=map[it.n]||it.n; var pr=it.p;
              if(pr==="-" ) continue;
              if(pr.length<max){ pr = pr.indexOf(".")>-1 ? pr : (pr+"."); var fill=(pr.indexOf(".")>-1?'0':' '); while(pr.length<max){pr+=fill;} }
              lines.push(name+"  "+pr+"  "+it.d+"  "+(it.diff==='-'?"":it.diff));
            }
            return lines.join("\n");
          }
          var detail=toList(r);
          var tip=(r.priceRemark.Tip||"")+"(仅供参考)";
          notify(r.trendData&&r.trendData.title||("商品"+id), lower+" "+tip, detail, {"open-url":"https://item.jd.com/"+id+".html","update-pasteboard":detail});
        }else if(data && data.ok===0 && data.msg){
          notify("比价结果","", "慢慢买提示您："+data.msg);
        }
        done({});
      }).catch(function(e){ notify("京东比价｜接口异常","", String(e&&e.message?e.message:e)); done({}); });
    }catch(e){ done({}); }
    return;
  }

  /* ===== 渲染（mode=render）====== */
  if(MODE==="render" && typeof $response!=="undefined"){
    try{
      var id2=extractId(reqUrl); if(!id2) return $done($response);
      intCryptoJS();
      getMMdata(id2).then(function(data){
        if(!(data && data.ok===1)) return $done($response);
        var r=data.result;

        // 主题（本地计算，不外链）
        var hour=(new Date()).getHours();
        var isDark=(hour>=20||hour<6);

        // 表格（同你给的样式，但去掉外链依赖）
        function priceHistoryTable(data){
          var css='<style>:root{--bg:#fff;--tx:#262626;--tx2:#8c8c8c;--hd:#fafafa;--bd:#f0f0f0;--hover:#fafafa;--shadow:0 2px 8px rgba(0,0,0,.06)}.dark{--bg:#1f1f1f;--tx:#e6e6e6;--tx2:#a6a6a6;--hd:#2a2a2a;--bd:#303030;--hover:#2a2a2a;--shadow:0 2px 8px rgba(0,0,0,.2)}.p-wrap{width:100%;background:var(--bg)}.p-table{width:92%;margin:0 auto;border-collapse:collapse;font-size:13px;border-radius:12px;overflow:hidden;box-shadow:var(--shadow);color:var(--tx)}.p-table th,.p-table td{padding:12px;text-align:center;border:1px solid var(--bd)}.p-hd{background:var(--hd);border-bottom:2px solid var(--bd);text-align:left;padding-left:16px}.p-hd h2{margin:0;font-size:15px;font-weight:500;color:var(--tx)}.p-table th{background:var(--hd);color:var(--tx2);font-weight:normal;font-size:13px}.p-table tr:hover td{background:var(--hover)}.p-table td:first-child{color:var(--tx);font-weight:500}.up td:nth-child(3),.up td:last-child{color:#ff4d4f}.down td:nth-child(3),.down td:last-child{color:#52c41a}.same td:nth-child(3),.same td:last-child{color:var(--tx2)}.p-table td:nth-child(3){font-weight:500;font-size:14px}.p-table td:last-child{font-size:12px}</style>';
          var html=(isDark?'<div class="p-wrap dark">':'<div class="p-wrap">');
          html+='<table class="p-table"><tr><th colspan="4" class="p-hd"><h2>'+data.groupName+'</h2></th></tr><tr><th>类型</th><th>日期</th><th>价格</th><th>状态</th></tr>';
          for(var i=0;i<data.atts.length;i++){
            var row=data.atts[i], st=row.status||"", cls= st.indexOf("↑")>-1?"up" : (st.indexOf("↓")>-1?"down":"same");
            html+='<tr class="'+cls+'"><td>'+row.name+'</td><td>'+row.date+'</td><td>'+row.price+'</td><td>'+row.status+'</td></tr>';
          }
          html+='</table></div>';
          return css+html;
        }

        // 转换列表
        function toTableData(result){
          function toDate(t){var d=new Date(t - new Date().getTimezoneOffset()*60000); return d.toISOString().split("T")[0];}
          var arr=(result.priceRemark&&result.priceRemark.ListPriceDetail)||[], out=[], i, it;
          for(i=0;i<arr.length;i++){
            it=arr[i]; var name=it.ShowName||it.Name||""; if(/历史最高|常购价/.test(name)) continue;
            var map={"双11价格":"双十一价格","618价格":"六一八价格","30天最低价":"三十天最低","60天最低价":"六十天最低","180天最低价":"一百八最低"};
            out.push({ name:(map[name]||name), date:(it.Date||toDate(Date.now())), price:it.Price, status:(it.Difference||"-").replace("-","●") });
          }
          return {groupName:"历史比价", atts:out};
        }

        // 简单折线（内嵌 SVG，避免外链 echarts）
        function simpleLine(result){
          var list=(result.trendData && result.trendData.info)||[]; if(!list.length) return '<div style="padding:8px;color:#999">暂无折线数据</div>';
          // 用实价 actualPrice 折线
          var pts=[], i, p;
          for(i=0;i<list.length;i++){ p=Number(Math.floor(list[i].actualPrice)); if(!isNaN(p)) pts.push(p); }
          if(!pts.length) return '<div style="padding:8px;color:#999">暂无折线数据</div>';
          var W=320,H=120,P=10,xmax=Math.max(1,pts.length-1), ymin=Infinity,ymax=-Infinity;
          for(i=0;i<pts.length;i++){ ymin=Math.min(ymin,pts[i]); ymax=Math.max(ymax,pts[i]); }
          if(!(ymax>ymin)){ ymax=ymin+1; }
          var sx=(W-2*P)/xmax, sy=(H-2*P)/(ymax-ymin), path="";
          for(i=0;i<pts.length;i++){ var xx=P+i*sx; var yy=H-P-((pts[i]-ymin)*sy); path+=(i?" L ":"M ")+xx+" "+yy; }
          var stroke=isDark?"#f4e925":"#007aff";
          return '<div style="width:100%;margin:8px 0;"><svg viewBox="0 0 '+W+' '+H+'" width="100%" height="'+H+'"><polyline fill="none" stroke="'+stroke+'" stroke-width="2" points="'+(function(){var s=""; for(var k=0;k<pts.length;k++){ var xx=P+k*sx; var yy=H-P-((pts[k]-ymin)*sy); s+=(k?",":"")+xx+","+yy; } return s; })()+'"/></svg></div>';
        }

        var style_table = String(ARG.style_table||"").toLowerCase()==="true";
        var style_line  = String(ARG.style_line||"").toLowerCase()==="true";
        var line_only   = String(ARG.line_only||"").toLowerCase()==="true";

        // 最低与提示
        var lower="历史最低:¥"+String(r.priceRemark.lowestPrice);
        var ld=(r.priceRemark.lowestDate||"").slice(0,10); if(ld) lower+="("+ld+")";
        var tip=(r.priceRemark.Tip||"")+"（仅供参考）";

        var html = '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,PingFang SC,Helvetica,Arial;line-height:1.35;box-shadow:0 6px 18px rgba(0,0,0,.08);border:1px solid #eee;border-radius:12px;padding:12px 14px;margin:10px 8px;background:#fff'+(isDark?';background:#1f1f1f;color:#e6e6e6;border-color:#303030;':'')+'">';
        html += '<h3 style="margin:0 0 6px 0;font-size:15px;">🧾 '+(r.trendData && r.trendData.title || ("商品 "+id2))+'</h3>';
        html += '<div style="font-size:12px;margin-bottom:6px;color:'+(isDark?'#a6a6a6':'#666')+'">'+lower+' <span style="color:'+(isDark?'#888':'#999')+'">'+tip+'</span></div>';

        if(style_line){
          if(!line_only){
            html += priceHistoryTable( toTableData(r) );
          }
          html += simpleLine(r);
        }else{
          // 默认表格
          html += priceHistoryTable( toTableData(r) );
        }
        html += '</div>';

        var body = $response.body||"";
        if(/<\/body>/i.test(body)) body = body.replace(/<\/body>/i, html+"</body>");
        else body = html+body;
        $done({body:body, headers:$response.headers});
      }).catch(function(){ $done($response); });
    }catch(e){ try{$done($response);}catch(_){done({});} }
    return;
  }

  // 其它情况直接放行
  done({});

})();
