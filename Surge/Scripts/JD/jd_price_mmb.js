const NAME="京东比价｜排障";
const STORE_KEY_DEVID="mmb_dev_id";
const STORE_KEY_DEVID_TS="mmb_dev_id_last_update";
const ARG = (function parse(a){const o={notify:"1"};try{if(typeof a==="string"){decodeURIComponent(a).split(/[&;,]/).forEach(p=>{const[k,...r]=p.split("=");if(k)o[k.trim()]=(r.join("=")||"").trim();});}else if(a&&typeof a==="object"){Object.assign(o,a);} }catch{} return o;})($argument);

(function main(){
  const url=($request&&$request.url)||"";
  const body=($request&&$request.body)||"";
  if(!url) return done();

  // 状态查询
  if(/^https?:\/\/(in|item)\.m\.jd\.com\/__\/jdprice_check/.test(url)){
    const id=get(STORE_KEY_DEVID)||"";
    const ts=get(STORE_KEY_DEVID_TS)||"";
    notify(NAME+"｜状态查询", id?"OK":"未设置", id?(`c_mmbDevId：${mask(id)}\n更新：${ts?new Date(Number(ts)).toLocaleString():"N/A"}`):"");
    return done();
  }

  // 捕获 token
  if(/apapia-sqk-weblogic\.manmanbuy\.com\/baoliao\/center\/menu$/.test(url)){
    notify(NAME+"｜捕获开始","命中慢慢买接口",url.slice(0,120));
    try{
      const p=new URLSearchParams(body||""); const dev=p.get("c_mmbDevId")||"";
      if(dev){ set(STORE_KEY_DEVID,dev); set(STORE_KEY_DEVID_TS,String(Date.now()));
        notify(NAME+"｜获取ck成功🎉",`c_mmbDevId: ${mask(dev)}`,"已写入本地，打开 /__/jdprice_check 可自检");
      }else{
        notify(NAME+"｜未解析到 c_mmbDevId","请在慢慢买-我的 页面再次触发", body?body.slice(0,200):"请求体为空");
      }
    }catch(e){ notify(NAME+"｜捕获异常","",String(e&&e.stack||e)); }
    return done();
  }

  // JD 商品页命中提示（可确认脚本是否执行）
  if(/^https?:\/\/(in|item)\.m\.jd\.com\/.+(\d{6,})\.html/.test(url)){
    notify(NAME+"｜商品页命中","",url);
    return done();
  }

  return done();
})();

function get(k){ try{ return typeof $task!=="undefined" ? $prefs.valueForKey(k) : $persistentStore.read(k);}catch{return null} }
function set(k,v){ try{ return typeof $task!=="undefined" ? $prefs.setValueForKey(v,k) : $persistentStore.write(v,k);}catch{return false} }
function notify(t,s,b){ if(ARG.notify==="0") return; try{ if(typeof $task!=="undefined") $notify(t,s,b); else $notification.post(t,s,b);}catch(e){} }
function done(v={}){ try{$done(v);}catch{} }
function mask(s){ if(!s) return ""; return s.length<=4? "*".repeat(s.length) : s.slice(0,2)+"***"+s.slice(-2); }
