// 京东比价分发器（超兼容，无新语法）
// 只做：按 mode 选择上游脚本 -> 下载 -> eval
// 上游：
//  - token / popup： https://raw.githubusercontent.com/mw418/Loon/main/script/jd_price.js
//  - render 表格：   https://raw.githubusercontent.com/githubdulong/Script/master/jd_price.js
//  - render 原始：   https://raw.githubusercontent.com/wf021325/qx/master/js/jd_price.js
//  - render 折线：   https://raw.githubusercontent.com/mw418/Loon/main/script/jd_price2.js

function notify(t,s,b,ext){try{ if(typeof $task!=="undefined"){$notify(t||"",s||"",b||"",ext||{});}else{$notification.post(t||"",s||"",b||"",ext||{});} }catch(e){}}
function done(v){try{$done(v||{});}catch(e){}}

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

function httpGet(u, cb){
  try{
    if(typeof $task!=="undefined"){
      $task.fetch({url:u}).then(function(resp){cb(null, resp && resp.body);}, function(err){cb(err||"fetch error", null);});
    }else{
      $httpClient.get({url:u}, function(e,r,d){ cb(e||null, d||null); });
    }
  }catch(e){ cb(e, null); }
}

function run(url, overrideArg){
  // 把上游脚本需要的 $argument 透传（仅折线脚本需要 true/false）
  var oldArg = (typeof $argument!=="undefined") ? $argument : "";
  if(typeof overrideArg!=="undefined"){ try{ $argument = overrideArg; }catch(e){} }

  httpGet(url, function(err, code){
    if(err || !code){ notify("京东比价·分发器","加载上游失败", String(err||"empty")); return done({}); }
    try{
      eval(code);
    }catch(e){
      notify("京东比价·分发器","上游脚本执行异常", String(e&&e.message?e.message:e));
      done({});
    }finally{
      // 还原 $argument，避免污染
      try{ $argument = oldArg; }catch(e){}
    }
  });
}

/* 路由 */
if(MODE==="token"){
  // 慢慢买 App 我的页面命中
  run("https://raw.githubusercontent.com/mw418/Loon/main/script/jd_price.js");
} else if(MODE==="popup"){
  // 弹窗极速版（request 钩子）
  run("https://raw.githubusercontent.com/mw418/Loon/main/script/jd_price.js");
} else if(MODE==="render"){
  // 页面渲染（response）：三选一
  var sTable = String(ARG.style_table||"").toLowerCase()==="true";
  var sRaw   = String(ARG.style_raw||"").toLowerCase()==="true";
  var sLine  = String(ARG.style_line||"").toLowerCase()==="true";
  var lineOnly = String(ARG.line_only||"").toLowerCase()==="true";

  if(sLine){
    // 折线脚本吃 $argument：true=仅折线；false=折线+表格
    run("https://raw.githubusercontent.com/mw418/Loon/main/script/jd_price2.js", lineOnly?"true":"false");
  }else if(sRaw){
    run("https://raw.githubusercontent.com/wf021325/qx/master/js/jd_price.js");
  }else{
    // 默认表格
    run("https://raw.githubusercontent.com/githubdulong/Script/master/jd_price.js");
  }
} else {
  // mode 不匹配：直接放行
  done({});
}
