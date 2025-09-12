/*
京东比价（慢慢买接口增强版·正式版）
- 触发：京东商品详情页（in/item.m.jd.com）→ 自动查询历史价并通知
- Token：慢慢买 /baoliao/center/menu（进入“我的”触发），即时弹“开始/成功”双提示并写入本地
- 自检：打开 https://in.m.jd.com/__/jdprice_check 查看是否已保存 c_mmbDevId
- 参数（argument）：
  - notify=1|0    是否弹系统通知（默认 1）
  - debug=1|0     输出更多日志（默认 0）
  - token=XXXX    手动覆盖 c_mmbDevId（兜底/临时使用）
*/

const NAME = "京东比价";
const STORE_KEY_REQBODY = "mmb_req_body_raw";
const STORE_KEY_DEVID = "mmb_dev_id";
const STORE_KEY_DEVID_TS = "mmb_dev_id_last_update";
const STORE_DEBOUNCE_ID = "jd_price_last_id";
const ARG = parseArgument($argument);

// 入口
(() => {
  try {
    const url = getReqUrl();
    if (!url) return done();

    // 状态查询
    if (/^https?:\/\/(in|item)\.m\.jd\.com\/__\/jdprice_check/.test(url)) {
      return checkStatusAndNotify();
    }

    // 捕获慢慢买 token
    if (/apapia-sqk-weblogic\.manmanbuy\.com\/baoliao\/center\/menu$/.test(url)) {
      return handleTokenCapture();
    }

    // 商品页触发
    if (/(^https?:\/\/(in|item)\.m\.jd\.com\/product\/\w*\/\d+\.html)|(^https?:\/\/(item|in)\.m\.jd\.com\/ware\/view\?)/.test(url)) {
      const id = extractJdId(url);
      if (!id) return log("未解析到商品ID"), done();

      if (debouncedSameId(id, 5000)) return log(`跳过重复ID: ${id}`), done();

      return fetchHistoryAndNotify(id);
    }

    done();
  } catch (e) {
    logErr(e);
    done();
  }
})();

// ======= 主流程：历史价 =======

async function fetchHistoryAndNotify(id) {
  try {
    const devId0 = getMmbDevId();
    const devId = ARG.token || devId0;
    if (!devId) {
      notify(`${NAME}｜缺少 token`, "请先打开慢慢买App-我的以捕获 c_mmbDevId", "或临时 argument=token=xxxx");
      return done();
    }

    const shareParams = buildShareParams(id, devId);
    const shareRes = await httpPost("https://apapia-history-weblogic.manmanbuy.com/app/share", {
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 13_1_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 - mmbWebBrowse - ios"
    }, toQuery(shareParams));

    const sj = toJson(shareRes.body);
    if (sj.code !== 2000 || !sj.data) throw new Error(`share接口异常：${sj.msg || "无返回data"}`);

    const sp = new URL(sj.data).searchParams;
    const fields = {
      shareId: sp.get("shareId"),
      sign: sp.get("sign"),
      spbh: sp.get("spbh"),
      url: sp.get("url")
    };

    const { body, boundary } = toMultipart(fields);
    const trendRes = await httpPost("https://apapia-history-weblogic.manmanbuy.com/h5/share/trendData",
      { "content-type": `multipart/form-data; boundary=${boundary}` }, body);

    const tj = toJson(trendRes.body);
    if (tj.ok !== 1) {
      const msg = tj.msg ? `慢慢买：${tj.msg}` : "慢慢买返回异常";
      notify("比价结果", "", msg);
      return done();
    }

    const result = tj.result;
    const title = result?.trendData?.title || `商品 ${id}`;
    const tip = (result?.priceRemark?.Tip || "") + "（仅供参考）";
    const lower = renderLowest(result);
    const summary = renderSummary(result);

    if (ARG.notify !== "0") {
      notify(title, `${lower} ${tip}`, summary, {
        "open-url": `https://item.jd.com/${id}.html`,
        "update-pasteboard": summary
      });
    } else {
      log(title);
      log(lower + " " + tip);
      log("\n" + summary);
    }
  } catch (e) {
    logErr(e);
    notify(`${NAME}｜查询异常`, "", String(e && (e.stack || e)));
  } finally {
    done();
  }
}

// ======= 捕获 token（双提示 + 持久化）=======

function handleTokenCapture() {
  try {
    const url = getReqUrl();
    const body = getReqBody() || "";
    notify(`${NAME}｜捕获开始`, "命中慢慢买接口", url.slice(0, 120));

    setStore(STORE_KEY_REQBODY, body);

    let devId = "";
    try {
      const p = new URLSearchParams(body);
      devId = p.get("c_mmbDevId") || "";
    } catch (e) {}

    if (devId) {
      setStore(STORE_KEY_DEVID, devId);
      setStore(STORE_KEY_DEVID_TS, String(Date.now()));
      notify(`${NAME}｜获取ck成功🎉`, `c_mmbDevId: ${mask(devId)}`, "已写入本地，可用状态查询检查");
    } else {
      notify(`${NAME}｜未解析到 c_mmbDevId`, "请在慢慢买App-我的 页面再次触发", body ? body.slice(0, 200) : "请求体为空");
    }
  } catch (e) {
    logErr(e);
    notify(`${NAME}｜捕获异常`, "", String(e && (e.stack || e)));
  } finally {
    done();
  }
}

// ======= 状态查询 =======

function checkStatusAndNotify() {
  try {
    const devId = getStore(STORE_KEY_DEVID) || "";
    const ts = Number(getStore(STORE_KEY_DEVID_TS) || 0);
    const when = ts ? new Date(ts).toLocaleString() : "N/A";
    const msg = devId ? `已保存 c_mmbDevId：${mask(devId)}\n更新时间：${when}` : "未保存 c_mmbDevId";
    notify(`${NAME}｜状态查询`, devId ? "OK" : "未设置", msg);
  } catch (e) {
    notify(`${NAME}｜状态查询异常`, "", String(e && (e.stack || e)));
  } finally {
    done({});
  }
}

// ======= 渲染辅助 =======

function renderLowest(result) {
  const lower = result?.priceRemark?.lowestPrice;
  const date = (result?.priceRemark?.lowestDate || "").slice(0, 10);
  if (lower == null) return "历史最低：无数据";
  return `历史最低：¥${lower}${date ? `（${date}）` : ""}`;
}

function renderSummary(result) {
  const list = normalizeHistoryList(result?.priceRemark?.ListPriceDetail || []);
  if (!list.length) return "暂无有效历史摘要";
  const width = list.reduce((m, i) => Math.max(m, (i.Price || "").length), 0);

  const nameMap = {
    "双11价格": "双十一价格",
    "618价格": "六一八价格",
    "30天最低价": "三十天最低",
    "60天最低价": "六十天最低",
    "180天最低价": "一百八最低"
  };

  let out = "";
  for (const it of list) {
    let Price = it.Price || "-";
    if (Price !== "-") {
      if (Price.length < width) {
        const hasDot = Price.includes(".");
        Price = Price.includes(".") || Price.length + 1 === width ? Price : `${Price}.`;
        Price = Price.padEnd(width, hasDot ? "0" : " ");
      }
    }
    out += `${nameMap[it.Name] || it.Name}  ${Price}  ${it.Date || ""}  ${it.Difference === "-" ? "" : it.Difference}\n`;
  }
  return out.trimEnd();
}

function normalizeHistoryList(arr) {
  const skip = /(历史最高|常购价)/;
  const toDate = () => {
    const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
    return d.toISOString().split("T")[0];
  };
  return arr
    .filter(x => !skip.test(x?.Name || ""))
    .map(x => ({ Name: x.Name, Price: x.Price, Date: x.Date || toDate(), Difference: x.Difference }));
}

// ======= 慢慢买 share 参数签名 =======

function buildShareParams(jdId, devId) {
  const body = {
    methodName: "trendJava",
    spbh: `1|${jdId}`,
    url: `https://item.jd.com/${jdId}.html`,
    t: Date.now().toString(),
    c_appver: "4.8.3.1",
    c_mmbDevId: devId
  };
  const secret = "3E41D1331F5DDAFCD0A38FE2D52FF66F";
  const tokenSrc = encodeURIComponent(secret + jsonToCustomString(body) + secret);
  body.token = md5(tokenSrc).toUpperCase();
  return body;
}

// ======= 工具/适配 =======

function extractJdId(url) {
  let m = url.match(/product\/(?:\w+\/)?(\d+)\.html/);
  if (m && m[1]) return m[1];
  m = url.match(/[?&](wareId|sku|id)=(\d+)/);
  return m ? m[2] : null;
}

function debouncedSameId(id, ms) {
  try {
    const last = getStore(STORE_DEBOUNCE_ID);
    const now = Date.now();
    const obj = last ? JSON.parse(last) : {};
    if (obj.id === id && now - (obj.ts || 0) < ms) return true;
    setStore(STORE_DEBOUNCE_ID, JSON.stringify({ id, ts: now }));
    return false;
  } catch {
    return false;
  }
}

function getMmbDevId() {
  if (ARG.token) return ARG.token;
  const v = getStore(STORE_KEY_DEVID);
  if (v) return v;
  const raw = getStore(STORE_KEY_REQBODY);
  if (raw) {
    const p = new URLSearchParams(raw);
    return p.get("c_mmbDevId") || "";
  }
  return "";
}

// —— HTTP —— //
function httpPost(url, headers = {}, body = "") {
  return new Promise((resolve) => {
    const req = { url, headers, body, timeout: 15000 };
    if (isQX()) {
      $task.fetch({ method: "POST", url, headers, body }).then(
        (resp) => resolve({ status: resp.statusCode || resp.status, headers: resp.headers, body: resp.body }),
        (err) => resolve({ status: 599, headers: {}, body: JSON.stringify({ error: String(err || "QX_POST_ERROR") }) })
      );
    } else {
      $httpClient.post(req, (err, resp, data) => {
        resolve({ status: (resp && (resp.status || resp.statusCode)) || 599, headers: (resp && resp.headers) || {}, body: data || "" });
      });
    }
  });
}

// —— 通知/日志 —— //
function notify(title, sub = "", body = "", ext = {}) {
  if (ARG.notify === "0") return;
  try {
    if (isQX()) $notify(title, sub, body, ext);
    else $notification.post(title, sub, body, ext);
  } catch (e) { log("通知失败：" + e); }
}
function log(...args) { if (ARG.debug === "1" || ARG.debug === 1) console.log(`[${NAME}]`, ...args); }
function logErr(e) { console.log(`[${NAME}] ERROR:`, e && (e.stack || e)); }

// —— 存取 —— //
function getStore(k) { try { return isQX() ? $prefs.valueForKey(k) : $persistentStore.read(k); } catch { return null; } }
function setStore(k, v) { try { return isQX() ? $prefs.setValueForKey(v, k) : $persistentStore.write(v, k); } catch { return false; } }

// —— Env —— //
function isQX() { return typeof $task !== "undefined"; }
function getReqUrl() { try { return ($request && $request.url) || ""; } catch { return ""; } }
function getReqBody() { try { return ($request && $request.body) || ""; } catch { return ""; } }
function done(v = {}) { try { $done(v); } catch {} }

// —— 参数/编码/签名 —— //
function parseArgument(a) {
  const out = { notify: "1", debug: "0" };
  try {
    if (!a) return out;
    if (typeof a === "string") {
      const raw = decodeURIComponent(a);
      raw.split(/[&;,]/).forEach(kv => {
        const [k, ...rest] = kv.split("=");
        if (!k) return;
        out[k.trim()] = (rest.join("=") || "").trim();
      });
    } else if (typeof a === "object") Object.assign(out, a);
  } catch {}
  return out;
}

function toQuery(obj) { return Object.keys(obj).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(String(obj[k]))}`).join("&"); }
function toMultipart(fields) {
  const boundary = "----WebKitFormBoundary" + Math.random().toString(36).slice(2);
  let body = "";
  for (const [k, v] of Object.entries(fields)) {
    body += `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
  }
  body += `--${boundary}--\r\n`;
  return { body, boundary };
}
function toJson(text) { try { return JSON.parse(text || "{}"); } catch { return {}; } }
function jsonToCustomString(obj) {
  return Object.keys(obj)
    .filter(k => obj[k] !== "" && k.toLowerCase() !== "token")
    .sort()
    .map(k => `${k.toUpperCase()}${String(obj[k]).toUpperCase()}`)
    .join("");
}
function mask(s) { if (!s) return ""; return s.length <= 4 ? "*".repeat(s.length) : s.slice(0, 2) + "***" + s.slice(-2); }

// —— 内置 MD5（精简） —— //
function md5(e){return CryptoJS.MD5(e).toString()}
!function(){var t=Math,r=function(){},n={lib:{}},e=n.lib,i=e.Base={extend:function(t){var r=function(){};return r.prototype=this,new (r.prototype=this.extend?this.extend():r)(),t&&this.mixIn(t),r},mixIn:function(t){for(var r in t)t.hasOwnProperty(r)&&(this[r]=t[r]);t.hasOwnProperty("toString")&&(this.toString=t.toString)}},o=e.WordArray=i.extend({init:function(t,r){t=this.words=t||[],this.sigBytes=null!=r?r:4*t.length},toString:function(){return""}});n.algo={};var a=n,s=a;var CryptoJS=s;CryptoJS.MD5=function(){function n(t,r){var n=(t&65535)+(r&65535);return(t>>16)+(r>>16)+(n>>16)<<16|65535&n}function e(t,r){return t<<r|t>>>32-r}function i(t,r,o,a,s,c){return n(e(n(n(r,t),n(a,c)),s),o)}function o(t,r,n,e,o,a,s){return i(r&n|~r&e,t,r,o,a,s)}function a(t,r,n,e,o,a,s){return i(r&e|n&~e,t,r,o,a,s)}function s(t,r,n,e,o,a,s){return i(r^n^e,t,r,o,a,s)}function c(t,r,n,e,o,a,s){return i(n^(r|~e),t,r,o,a,s)}return function(t){var r,u,f,h,p,d,l,y,v,g,w=[],_=1732584193,m=-271733879,B=-1732584194,b=271733878;for(t=unescape(encodeURIComponent(t)),w=(function(t){for(var r=[],n=0;n<t.length;n++)r[n>>2]|=t.charCodeAt(n)<<24-8*(n%4);return r})(t),r=t.length,u=8*r,w[u>>5]|=128<<24-u%32,w[14+(u+64>>>9<<4)]=r, p=0;p<w.length;p+=16)u=_,f=m,h=B,p=b, _=o(_,m,B,b,w[p],7,-680876936),b=o(b,_,m,B,w[p+1],12,-389564586),B=o(B,b,_,m,w[p+2],17,606105819),m=o(m,B,b,_,w[p+3],22,-1044525330),_=o(_,m,B,b,w[p+4],7,-176418897),b=o(b,_,m,B,w[p+5],12,1200080426),B=o(B,b,_,m,w[p+6],17,-1473231341),m=o(m,B,b,_,w[p+7],22,-45705983),_=o(_,m,B,b,w[p+8],7,1770035416),b=o(b,_,m,B,w[p+9],12,-1958414417),B=o(B,b,_,m,w[p+10],17,-42063),m=o(m,B,b,_,w[p+11],22,-1990404162),_=o(_,m,B,b,w[p+12],7,1804603682),b=o(b,_,m,B,w[p+13],12,-40341101),B=o(B,b,_,m,w[p+14],17,-1502002290),m=o(m,B,b,_,w[p+15],22,1236535329), _=a(_,m,B,b,w[p+1],5,-165796510),b=a(b,_,m,B,w[p+6],9,-1069501632),B=a(B,b,_,m,w[p+11],14,643717713),m=a(m,B,b,_,w[p],20,-373897302),_=a(_,m,B,b,w[p+5],5,-701558691),b=a(b,_,m,B,w[p+10],9,38016083),B=a(B,b,_,m,w[p+15],14,-660478335),m=a(m,B,b,_,w[p+4],20,-405537848),_=s(_,m,B,b,w[p],4,568446438),b=s(b,_,m,B,w[p+8],11,-1019803690),B=s(B,b,_,m,w[p+11],16,-187363961),m=s(m,B,b,_,w[p+14],23,1163531501),_=s(_,m,B,b,w[p+1],4,-1444681467),b=s(b,_,m,B,w[p+4],11,-51403784),B=s(B,b,_,m,w[p+7],16,1735328473),m=s(m,B,b,_,w[p+10],23,-1926607734),_=c(_,m,B,b,w[p+13],6,-378558),b=c(b,_,m,B,w[p+4],10,-2022574463),B=c(B,b,_,m,w[p+11],15,1839030562),m=c(m,B,b,_,w[p+2],21,-35309556),_=c(_,m,B,b,w[p+5],6,-1530992060),b=c(b,_,m,B,w[p+8],10,-155497632),B=c(B,b,_,m,w[p+11],15,-1094730640),m=c(m,B,b,_,w[p+14],21,681279174),_=c(_,m,B,b,w[p+0],6,-358537222),b=c(b,_,m,B,w[p+7],10,-722521979),B=c(B,b,_,m,w[p+14],15,76029189),m=c(m,B,b,_,w[p+5],21,-640364487),_[0]=_+1732584193|0,m=m-271733879|0,B=B-1732584194|0,b=b+271733878|0;return([_,m,B,b]).map(function(t){return("00000000"+(t>>>0).toString(16)).slice(-8)}).join("")} }();
/* end md5 */
