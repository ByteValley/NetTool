// 京东比价（Debug 版 · 带接口请求）
// - 获取 token（慢慢买）/ 弹窗 / 页面渲染
// - 兼容 Surge / Loon / Stash / Egern / Quantumult X
// - MITM: in.m.jd.com, item.m.jd.com, apapia-sqk-weblogic.manmanbuy.com, apapia-history-weblogic.manmanbuy.com

const APP = "京东比价 Debug";
const SECRET = "3E41D1331F5DDAFCD0A38FE2D52FF66F";
const KEY_BODY = "manmanbuy_val";
const KEY_DEVID = "慢慢买CK";

function notify(title, sub, body, ext) {
  try {
    if (typeof $notify === "function") $notify(title||"", sub||"", body||"", ext||{});
    else if (typeof $notification !== "undefined") $notification.post(title||"", sub||"", body||"", ext||{});
  } catch (_) {}
}
function done(v){ try { $done(v||{}); } catch(_) {} }
function getval(k){ try{ return (typeof $prefs!=="undefined")?$prefs.valueForKey(k):$persistentStore.read(k);}catch(_){return null;} }
function setval(k,v){ try{ return (typeof $prefs!=="undefined")?$prefs.setValueForKey(v,k):$persistentStore.write(v,k);}catch(_){return false;} }
function parseArg(a){ let o={}; if(!a) return o; String(a).split(/[&;,]/).forEach(kv=>{const i=kv.indexOf("="); if(i===-1) return; const k=decodeURIComponent(kv.slice(0,i)); const v=decodeURIComponent(kv.slice(i+1)); o[k]=v;}); return o; }

const ARG = parseArg(typeof $argument === "string" ? $argument : "");
const MODE = (ARG.mode||"").toLowerCase();
const REQ_URL = ($request && $request.url) || "";

/* ========== 提取商品 ID ========== */
function extractId(u){
  let m=u.match(/\/product\/(?:[A-Za-z]+\/)?(\d+)\.html/); if(m&&m[1])return m[1];
  m=u.match(/[?&](?:wareId|sku|id)=(\d+)/); if(m&&m[1])return m[1];
  m=u.match(/\/(\d+)\.html(?:[#?]|$)/); if(m&&m[1])return m[1];
  return null;
}

/* ========== 请求工具 ========== */
function http(op){
  return new Promise((resolve,reject)=>{
    if (typeof $httpClient!=="undefined"){
      $httpClient[op.method||"get"](op,(err,resp,body)=>{
        if(err) reject(err); else resolve({status:resp.status||resp.statusCode,body});
      });
    }else if (typeof $task!=="undefined"){
      $task.fetch(op).then(res=>resolve({status:res.statusCode,body:res.body}),reject);
    }else reject("no http client");
  });
}
function md5(str){ let crypto; try{crypto=require("crypto"); return crypto.createHash("md5").update(str).digest("hex");}catch(_){return str;} }

/* ========== 请求历史价格 ========== */
async function requestHistoryPrice(id){
  const devid = getval(KEY_BODY)?.match(/c_mmbDevId=([^&]+)/)?.[1] || getval(KEY_DEVID);
  if (!devid) throw new Error("未获取 c_mmbDevId");

  const bodyObj = {
    methodName: "trendJava",
    spbh: `1|${id}`,
    url: `https://item.jd.com/${id}.html`,
    t: Date.now().toString(),
    c_appver: "4.8.3.1",
    c_mmbDevId: devid,
  };

  const qs = Object.keys(bodyObj).map(k=>`${k}=${encodeURIComponent(bodyObj[k])}`).join("&");
  const signStr = SECRET + Object.keys(bodyObj).sort().map(k=>k+String(bodyObj[k])).join("").toUpperCase() + SECRET;
  bodyObj.token = md5(signStr).toUpperCase();

  const res = await http({
    method:"post",
    url:"https://apapia-history-weblogic.manmanbuy.com/app/share",
    headers:{ "Content-Type":"application/x-www-form-urlencoded" },
    body:qs
  });

  return res.body;
}

/* ========== A) 获取 token 分支 ========== */
if (MODE==="token" && /baoliao\/center\/menu/.test(REQ_URL)) {
  try{
    const body=$request?.body||"";
    setval(KEY_BODY, body);
    let devId="";
    body.split("&").forEach(p=>{const kv=p.split("="); if(decodeURIComponent(kv[0]||"")==="c_mmbDevId") devId=decodeURIComponent(kv[1]||"");});
    setval(KEY_DEVID, devId);
    notify(APP, "获取ck成功 🎉", devId?("c_mmbDevId="+devId):body.slice(0,200));
  }catch(e){ notify(APP+"｜获取token异常","", String(e&&e.message||e)); }
  done({});
}

/* ========== B) 弹窗模式 ========== */
if (MODE==="popup" && typeof $response === "undefined") {
  const id = extractId(REQ_URL);
  notify("JD Price Debug", "进入弹窗逻辑", id?("商品ID="+id):REQ_URL);
  if (id){
    requestHistoryPrice(id).then(r=>{
      notify("比价接口返回", "弹窗模式", r.slice(0,200));
    }).catch(e=>{
      notify("比价接口异常", "", String(e));
    });
  }
  done({});
}

/* ========== C) 渲染模式 ========== */
if (MODE==="render" && typeof $response !== "undefined") {
  const id = extractId(REQ_URL);
  notify("JD Price Debug", "进入渲染逻辑", id?("商品ID="+id):REQ_URL);

  if (id){
    requestHistoryPrice(id).then(r=>{
      notify("比价接口返回", "渲染模式", r.slice(0,200));
    }).catch(e=>{
      notify("比价接口异常", "", String(e));
    });
  }

  try {
    let html = $response.body || "";
    const panel = `<div style="padding:12px;margin:10px;border:1px solid #ccc;background:#fff">
      <b>🧾 京东比价 Debug</b><br>
      已进入渲染逻辑，商品ID=${id||"未识别"}
    </div>`;
    if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, panel+"</body>");
    else html = panel + html;
    $done({ body: html });
  } catch(e){
    notify(APP+"｜渲染异常","", String(e&&e.message||e));
    $done($response);
  }
}

/* ========== 默认放行 ========== */
done({});
