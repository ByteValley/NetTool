/*
京东比价（慢慢买接口增强版）
- 触发：京东商品详情页请求（in.m.jd.com / item.m.jd.com）
- Token获取：慢慢买 /baoliao/center/menu（请求体含 c_mmbDevId）
- 参数（argument）示例：
  argument=notify=1&debug=0&token=xxxxxxxx
  - token：手动覆盖慢慢买 c_mmbDevId（兜底用）
  - notify：1=系统通知，0=只日志
  - debug：1=更多日志
*/

const NAME = "京东比价";
const STORE_KEY_REQBODY = "mmb_req_body_raw";
const STORE_KEY_DEVID = "mmb_dev_id";     // 保存 c_mmbDevId
const STORE_DEBOUNCE_ID = "jd_price_last_id";
const ARG = parseArgument($argument);

// ——— 入口分发 ———
(() => {
  try {
    const url = getReqUrl();
    if (!url) return done();

    // 1) 捕获慢慢买 token
    if (/apapia-sqk-weblogic\.manmanbuy\.com\/baoliao\/center\/menu$/.test(url)) {
      return handleTokenCapture();
    }

    // 2) 京东详情页触发比价
    if (/(^https?:\/\/(in|item)\.m\.jd\.com\/product\/graphext\/\d+\.html)|(^https?:\/\/(item|in)\.m\.jd\.com\/(ware\/view|product\/\w+\/\d+\.html))/.test(url)) {
      const id = extractJdId(url);
      if (!id) return log("未解析到商品ID"), done();

      // 去抖：同ID 5 秒内不重复
      if (debouncedSameId(id, 5000)) return log(`跳过重复ID: ${id}`), done();

      return fetchHistoryAndNotify(id);
    }

    done();
  } catch (e) {
    logErr(e);
    done();
  }
})();

// =================== 主流程 ===================

async function fetchHistoryAndNotify(id) {
  try {
    const devId = getMmbDevId();
    const finalDevId = ARG.token || devId;
    if (!finalDevId) {
      notify(`${NAME} | 缺少 token`, "请先在慢慢买App-我的页面走一遍", "捕获后自动保存到本地");
      return done();
    }

    const shareParams = buildShareParams(id, finalDevId);
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
  } finally {
    done();
  }
}

// =================== Token 捕获 ===================

function handleTokenCapture() {
  try {
    const body = getReqBody() || "";
    setStore(STORE_KEY_REQBODY, body);
    // 直接解析 c_mmbDevId
    const params = new URLSearchParams(body);
    const devId = params.get("c_mmbDevId") || "";
    if (devId) {
      setStore(STORE_KEY_DEVID, devId);
      notify(`${NAME} | 获取ck成功🎉`, `c_mmbDevId: ${mask(devId)}`, body.slice(0, 180));
    } else {
      notify(`${NAME} | 未发现 c_mmbDevId`, "请确认在慢慢买App-我的页面触发", "");
    }
  } catch (e) {
    logErr(e);
  } finally {
    done();
  }
}

// =================== 渲染辅助 ===================

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

// =================== 慢慢买 share 参数签名 ===================

function buildShareParams(jdId, devId) {
  const body = {
    methodName: "trendJava",
    spbh: `1|${jdId}`,
    url: `https://item.jd.com/${jdId}.html`,
    t: Date.now().toString(),
    c_appver: "4.8.3.1",
    c_mmbDevId: devId
  };
  // 按原逻辑拼接并 MD5
  const secret = "3E41D1331F5DDAFCD0A38FE2D52FF66F";
  const tokenSrc = encodeURIComponent(secret + jsonToCustomString(body) + secret);
  body.token = md5(tokenSrc).toUpperCase();
  return body;
}

// =================== 工具/适配层 ===================

function extractJdId(url) {
  // 常见：/product/graphext/100123456789.html 或其他形态
  let m = url.match(/product\/(?:\w+\/)?(\d+)\.html/);
  if (m && m[1]) return m[1];
  // ware/view?wareId=...
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
  // 若只存了原始body
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
    } else if (isSurgeLike()) {
      $httpClient.post(req, (err, resp, data) => {
        resolve({ status: (resp && (resp.status || resp.statusCode)) || 599, headers: (resp && resp.headers) || {}, body: data || "" });
      });
    } else {
      // 兜底
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
    if (isQX()) {
      $notify(title, sub, body, ext);
    } else {
      $notification.post(title, sub, body, ext);
    }
  } catch (e) {
    log("通知失败：" + e);
  }
}

function log(...args) {
  if (ARG.debug === "1" || ARG.debug === 1) console.log(`[${NAME}]`, ...args);
}
function logErr(e) { console.log(`[${NAME}] ERROR:`, e && (e.stack || e)); }

// —— 存取 —— //
function getStore(k) {
  try {
    if (isQX()) return $prefs.valueForKey(k);
    return $persistentStore.read(k);
  } catch { return null; }
}
function setStore(k, v) {
  try {
    if (isQX()) return $prefs.setValueForKey(v, k);
    return $persistentStore.write(v, k);
  } catch { return false; }
}

// —— Env 判断 —— //
function isQX() { return typeof $task !== "undefined"; }
function isSurgeLike() { return typeof $httpClient !== "undefined"; }

// —— 运行环境输入 —— //
function getReqUrl() { try { return ($request && $request.url) || ""; } catch { return ""; } }
function getReqBody() { try { return ($request && $request.body) || ""; } catch { return ""; } }
function done(v = {}) { try { $done(v); } catch { } }

// —— 参数解析 —— //
function parseArgument(a) {
  const out = { notify: "1", debug: "0" };
  if (!a) return out;
  try {
    if (typeof a === "string") {
      const raw = decodeURIComponent(a);
      raw.split(/[&;,]/).forEach(kv => {
        const [k, ...rest] = kv.split("=");
        if (!k) return;
        out[k.trim()] = (rest.join("=") || "").trim();
      });
    } else if (typeof a === "object") {
      Object.assign(out, a);
    }
  } catch { }
  return out;
}

// —— 编解码/签名 —— //
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

// —— 内置 MD5 / CryptoJS（精简） —— //
/* eslint-disable */
function md5(e){return CryptoJS.MD5(e).toString()}
!function(){var t,r;n();"undefined"!=typeof window&&window.crypto&&(r=window.crypto);"undefined"!=typeof self&&self.crypto&&(r=self.crypto);"undefined"!=typeof globalThis&&globalThis.crypto&&(r=globalThis.crypto);function n(){t=function(t){var r,n,e,i,o,a,s,c,u=f,l=u.lib,p=l.Base,d=l.WordArray,h=u.enc,p=(h.Hex,h.Latin1,h.Utf8),h=u.algo;function f(){}return f.prototype=Object.create(Object.prototype),f}()}var e=function(){if(r){if("function"==typeof r.getRandomValues)try{return r.getRandomValues(new Uint32Array(1))[0]}catch(t){}if("function"==typeof r.randomBytes)try{return r.randomBytes(4).readInt32LE()}catch(t){}}return(987654321*Math.random()|0)>>>0},i=Object.create||function(){function t(){}return function(r){return t.prototype=r,new t}}(),o={},a=o.lib={},s=a.Base={extend:function(t){var r=i(this);return t&&r.mixIn(t),r.hasOwnProperty("init")&&this.init!==r.init||(r.init=function(){r.$super.init.apply(this,arguments)}),r.init.prototype=r,r.$super=this,r},create:function(){var t=this.extend();return t.init.apply(this,arguments),t},init:function(){},mixIn:function(t){for(var r in t)t.hasOwnProperty(r)&&(this[r]=t[r]);t.hasOwnProperty("toString")&&(this.toString=t.toString)},clone:function(){return this.init.prototype.extend(this)}},c=a.WordArray=s.extend({init:function(t,r){t=this.words=t||[],this.sigBytes=null!=r?r:4*t.length},toString:function(t){return(t||u).stringify(this)},concat:function(t){var r=this.words,n=t.words,e=this.sigBytes,i=t.sigBytes;if(this.clamp(),e%4)for(var o=0;o<i;o++){var a=n[o>>>2]>>>24-o%4*8&255;r[e+o>>>2]|=a<<24-(e+o)%4*8}else for(o=0;o<i;o+=4)r[e+o>>>2]=n[o>>>2];return this.sigBytes+=i,this},clamp:function(){var r=this.words,n=this.sigBytes;r[n>>>2]&=4294967295<<32-n%4*8,r.length=t.ceil(n/4)},clone:function(){var t=s.clone.call(this);return t.words=this.words.slice(0),t}}),u=o.enc={};u.Hex={stringify:function(t){for(var r=t.words,n=t.sigBytes,e=[],i=0;i<n;i++){var o=r[i>>>2]>>>24-i%4*8&255;e.push((o>>>4).toString(16)),e.push((15&o).toString(16))}return e.join("")}};u.Latin1={stringify:function(t){for(var r=t.words,n=t.sigBytes,e=[],i=0;i<n;i++){var o=r[i>>>2]>>>24-i%4*8&255;e.push(String.fromCharCode(o))}return e.join("")}};u.Utf8={stringify:function(t){try{return decodeURIComponent(escape(u.Latin1.stringify(t)))}catch(t){throw new Error("Malformed UTF-8 data")}}};var l=a.BufferedBlockAlgorithm=s.extend({reset:function(){this._data=new c.init,this._nDataBytes=0},_append:function(t){"string"==typeof t&&(t=u.Utf8.parse(t)),this._data.concat(t),this._nDataBytes+=t.sigBytes},_process:function(r){var n,e=this._data,i=e.words,o=e.sigBytes,a=this.blockSize,s=o/(4*a),u=(s=r?t.ceil(s):t.max((0|s)-this._minBufferSize,0))*a,f=t.min(4*u,o);if(u){for(n=0;n<u;n+=a)this._doProcessBlock(i,n);n=i.splice(0,u),e.sigBytes-=f}return new c.init(n,f)},clone:function(){var t=s.clone.call(this);return t._data=this._data.clone(),t}}),f=(a.Hasher=l.extend({cfg:s.extend(),init:function(t){this.cfg=this.cfg.extend(t),this.reset()},reset:function(){l.reset.call(this),this._doReset()},update:function(t){return this._append(t),this._process(),this},finalize:function(t){return t&&this._append(t),this._doFinalize()},blockSize:16,_createHelper:function(t){return function(r,n){return new t.init(n).finalize(r)}},_createHmacHelper:function(t){return function(r,n){return new f.HMAC.init(t,n).finalize(r)}}}),o.algo={});(function(){var r=o,n=r.lib,e=n.WordArray,i=n.Hasher,o=r.enc,a=[];(function(){for(var r=0;r<64;r++)a[r]=4294967296*t.abs(t.sin(r+1))|0})();var s=o.MD5=i.extend({_doReset:function(){this._hash=new e.init([1732584193,4023233417,2562383102,271733878])},_doProcessBlock:function(t,r){},_doFinalize:function(){var t=this._data,r=t.words;return this._hash},clone:function(){var t=i.clone.call(this);return t._hash=this._hash.clone(),t}});r.MD5=i._createHelper(s),r.HmacMD5=i._createHmacHelper(s)})();var f=o;var CryptoJS=f;
/* eslint-enable */
