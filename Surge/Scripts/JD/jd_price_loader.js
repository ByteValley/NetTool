// 京东比价 · 分发器
// 只负责按 mode 下载对应上游脚本 → eval

function notify(t,s,b){try{if($notification) $notification.post(t||"",s||"",b||"");}catch(e){}}
function done(v){try{$done(v||{});}catch(e){}}

function parseArg(a){
  var o={}; if(!a) return o;
  var arr=String(a).split("&");
  for(var i=0;i<arr.length;i++){
    var kv=arr[i].split("=");
    if(kv.length>=2) o[kv[0]]=kv[1];
  }
  return o;
}

var ARG = parseArg($argument);
var MODE = (ARG.mode||"").toLowerCase();

function httpGet(u, cb){
  if(typeof $task!=="undefined"){
    $task.fetch({url:u}).then(r=>cb(null,r.body), e=>cb(e,null));
  }else{
    $httpClient.get(u,(e,r,d)=>cb(e,d));
  }
}

function run(url, argOverride){
  var oldArg=$argument;
  if(argOverride!==undefined) $argument=argOverride;
  httpGet(url,function(err,code){
    if(err||!code){notify("京东比价分发器","加载失败",String(err||"无响应")); return done({});}
    try{eval(code);}catch(e){notify("京东比价分发器","执行异常",String(e)); done({});}
    finally{$argument=oldArg;}
  });
}

// 路由逻辑
if(MODE==="token"){
  run("https://raw.githubusercontent.com/mw418/Loon/main/script/jd_price.js");
}else if(MODE==="popup"){
  run("https://raw.githubusercontent.com/mw418/Loon/main/script/jd_price.js");
}else if(MODE==="render"){
  if(ARG.style_line==="true"){
    run("https://raw.githubusercontent.com/mw418/Loon/main/script/jd_price2.js", ARG.line_only==="true"?"true":"false");
  }else if(ARG.style_raw==="true"){
    run("https://raw.githubusercontent.com/wf021325/qx/master/js/jd_price.js");
  }else{
    run("https://raw.githubusercontent.com/githubdulong/Script/master/jd_price.js");
  }
}else{
  done({});
}
