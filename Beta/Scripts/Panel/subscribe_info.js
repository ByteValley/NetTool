/* =========================================================
 * 模块：订阅信息面板（多机场流量 / 到期展示）
 * 作者：ByteValley
 * 版本：2026-02-15R1
 *
 * 概述 · 功能边界
 *  · 支持最多 10 组订阅链接，按顺序展示总量 / 已用 / 剩余 / 到期时间
 *  · 自动解析 subscription-userinfo 头（upload / download / total / expire）
 *  · 支持每个订阅配置单独重置规则（按日重置或自定义文本）
 *
 * 运行环境 · 依赖接口
 *  · 兼容：Surge 面板 / Loon / Quantumult X / Egern
 *  · 依赖：$httpClient / $persistentStore | $prefs / $done
 *
 * 参数源 · BoxJS 结构
 *  · BoxJS 存储根推荐结构：key = "Panel"
 *    {
 *      "NetworkInfo":  { "Settings": {...}, "Caches": ... },
 *      "SubscribeInfo":{ "Settings": {...}, "Caches": ... }
 *    }
 *  · 本脚本优先读取 Panel.SubscribeInfo.Settings
 *  · 兼容：
 *      - 直接 key = "Panel.SubscribeInfo.Settings"
 *      - 直接 key = "@Panel.SubscribeInfo.Settings"
 *
 * 参数 · 命名 & 取值优先级
 *  · 所有参数均支持「小写 + 大写」两种键名：
 *    - defaultIcon / DefaultIcon
 *    - defaultIconColor / DefaultIconColor
 *    - url1 / URL1, url2 / URL2, ... url10 / URL10
 *    - title1 / Title1, resetDay1 / ResetDay1, ...（以此类推）
 *
 *  · 单值参数优先级（最终逻辑）：
 *      1）若 BoxJS（SubscribeInfo.Settings.*）有值
 *          ⇒ 使用 BoxJS
 *      2）否则，若模块 #!arguments 中有值
 *          ⇒ 使用模块参数
 *      3）否则 ⇒ 使用脚本默认 defVal
 *
 *  · URL 特性：
 *      - 支持原始 http(s) 链接
 *      - 支持 encodeURIComponent 后的整串值（会自动解码一次）
 *      - 以下视为占位符，等价“未配置”：订阅链接 / 机场名称 / 重置日期
 *
 * 显示规则 · 面板格式
 *  · 每个机场四行：
 *      1）「名称 | 总量 | 当前时间(HH:MM)」
 *      2）「已用：xx.xx% ➟ xx.xx GB」
 *      3）「剩余：xx.xx% ➟ xx.xx GB」
 *      4）「重置：X天 | 到期：YYYY.MM.DD」或仅「到期：YYYY.MM.DD」
 *
 *  · 无任何有效订阅（全部 urlN 无法解析为 http(s) 链接）时：
 *      · 面板内容：'未配置订阅参数'
 *
 * 优化说明 · 超时治理
 *  · 并发限流：避免串行 10 次请求叠加总耗时
 *  · 单请求硬超时：避免某个机场卡死拖垮全局
 *  · HEAD 优先：优先只取 header，失败再回退 GET
 *  · 降低重试：面板场景更应该“快失败”，而不是“慢三倍”
 *
 * 日志说明
 *  · 默认输出基础日志（控制台 console.log）
 *  · 标记前缀统一为：[SubscribeInfo]
 *  · 每次 log 只打印一行完整文本，防止刷屏
 * ========================================================= */

/**
 * ===============================
 * 重置时间（resetDay）使用说明
 * ===============================
 *
 * ① 每月重置（按日）
 *    resetDay1=22
 *
 * ② 每年重置（按月-日）
 *    resetDay1=1-22
 *    resetDay1=01/22
 *    resetDay1=1月22日
 *
 * ③ 指定日期（绝对日期）
 *    resetDay1=2027-01-22
 *    resetDay1=2027年1月22日
 *    若已过去，将自动滚动为下一年同月同日（无需每年改年份）
 *
 * 说明：
 * - 若填写非上述格式，将按文本原样显示
 * - 所有计算基于本地时间
 */

// ===== 日志工具 =====
const TAG = "SubscribeInfo";
const SCRIPT_NAME = "订阅信息";

// debug 开关（可在 BoxJS/arguments 里加 is_debug=1/true）
let IS_DEBUG = false;

function log() {
  if (typeof console === "undefined" || !console.log) return;
  const parts = [];
  for (let i = 0; i < arguments.length; i++) {
    const v = arguments[i];
    if (v === null || v === undefined) parts.push("");
    else if (typeof v === "string") parts.push(v);
    else {
      try {
        parts.push(JSON.stringify(v));
      } catch (_) {
        parts.push(String(v));
      }
    }
  }
  console.log("[" + TAG + "] " + parts.join(" "));
}

function debug() {
  if (!IS_DEBUG) return;
  log.apply(null, arguments);
}

function logErr(e, ctx) {
  const msg = e && (e.stack || e.message || String(e));
  log("❗️error", ctx || "", msg);
}

// ===== 环境识别 / UA =====
function detectClient() {
  const isEgern = typeof Egern !== "undefined" && Egern && typeof Egern.version === "string";
  const isQuanX = typeof $task !== "undefined" && typeof $prefs !== "undefined";
  const isLoon = typeof $loon !== "undefined";
  const isSurge =
    typeof $environment !== "undefined" &&
    $environment &&
    ($environment["surge-version"] || $environment["app"] === "Surge") &&
    !isLoon;
  const isStash = typeof $environment !== "undefined" && $environment && $environment["stash-version"];
  return { isEgern, isSurge, isLoon, isQuanX, isStash };
}

function buildUA() {
  const env = detectClient();
  if (env.isEgern) return `Egern/${Egern.version}`;
  if (env.isSurge) {
    const v = ($environment && ($environment["surge-version"] || $environment.surgeVersion)) || "";
    return v ? `Surge/${v}` : "Surge";
  }
  if (env.isLoon) return "Loon";
  if (env.isStash) return "Stash";
  if (env.isQuanX) return "Quantumult X";
  return TAG;
}

function buildHeaders(extra) {
  const h = Object.assign(
    {
      "User-Agent": buildUA(),
      "Accept": "*/*",
      "Connection": "close",
    },
    extra || {}
  );
  return h;
}

// ===== 工具函数 =====
function bytesToSize(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024,
    sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${val.toFixed(2)} ${sizes[i]}`;
}

function toPercent(used, total) {
  if (!total) return "0%";
  return `${((used / total) * 100).toFixed(2)}%`;
}

function toReversePercent(used, total) {
  if (!total) return "0%";
  return `${(((total - used) / total) * 100).toFixed(2)}%`;
}

function formatDate(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}.${m}.${day}`;
}

function getResetDaysLeft(resetDayNum) {
  if (!resetDayNum) return null;
  const today = new Date();
  const nowDay = today.getDate();
  const nowMonth = today.getMonth();
  const nowYear = today.getFullYear();
  let resetDate;
  if (nowDay < resetDayNum) resetDate = new Date(nowYear, nowMonth, resetDayNum);
  else resetDate = new Date(nowYear, nowMonth + 1, resetDayNum);
  const diff = Math.ceil((resetDate - today) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysUntilDate(targetDate) {
  const today = startOfDay(new Date());
  const t = startOfDay(targetDate);
  const diff = Math.ceil((t - today) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

/**
 * 解析 resetDay：
 * - "22"            => { type: "monthly", day: 22 }
 * - "1-22"/"01/22"  => { type: "yearly", month: 1, day: 22 }
 * - "1月22日"        => { type: "yearly", month: 1, day: 22 }
 * - "2027-01-22"    => { type: "absolute", year: 2027, month: 1, day: 22 }
 * - "2027年1月22日"  => { type: "absolute", year: 2027, month: 1, day: 22 }
 */
function parseResetSpec(s) {
  const t = String(s || "").trim();
  if (!t) return null;

  if (/^\d{1,2}$/.test(t)) {
    const day = parseInt(t, 10);
    if (day >= 1 && day <= 31) return { type: "monthly", day };
    return null;
  }

  let m = t.match(/^(\d{4})[.\-\/年](\d{1,2})[.\-\/月](\d{1,2})/);
  if (m) {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { type: "absolute", year, month, day };
    }
    return null;
  }

  m = t.match(/^(\d{1,2})[.\-\/月](\d{1,2})(?:日)?$/);
  if (m) {
    const month = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { type: "yearly", month, day };
    }
  }

  return null;
}

function nextResetDateFromSpec(spec) {
  const now = new Date();
  const today = startOfDay(now);

  if (spec.type === "yearly") {
    let d = new Date(now.getFullYear(), spec.month - 1, spec.day);
    if (startOfDay(d) <= today) d = new Date(now.getFullYear() + 1, spec.month - 1, spec.day);
    return d;
  }

  if (spec.type === "absolute") {
    let d = new Date(spec.year, spec.month - 1, spec.day);
    if (startOfDay(d) <= today) {
      let y = now.getFullYear();
      d = new Date(y, spec.month - 1, spec.day);
      if (startOfDay(d) <= today) d = new Date(y + 1, spec.month - 1, spec.day);
    }
    return d;
  }

  return null;
}

function isHttpUrl(s) {
  return /^https?:\/\//i.test(String(s || ""));
}

// 占位符文本（等价为空）
const PLACEHOLDER_STRINGS = ["订阅链接", "机场名称", "重置日期"];

function isPlaceholderString(s) {
  const t = String(s || "").trim();
  if (!t) return false;
  if (/^{{{[^}]+}}}$/.test(t)) return true;
  if (PLACEHOLDER_STRINGS.indexOf(t) !== -1) return true;
  const low = t.toLowerCase();
  return low === "null" || low === "undefined";
}

function cleanArg(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s) return null;
  if (isPlaceholderString(s)) return null;
  return s;
}

// 尝试处理 URL：原样 / decodeURIComponent 一次
function normalizeUrl(src, label) {
  const s = cleanArg(src);
  if (!s) {
    debug("normalizeUrl", label, "=> empty/placeholder, skip");
    return null;
  }
  if (isHttpUrl(s)) {
    debug("normalizeUrl", label, "use raw http(s):", s);
    return s;
  }
  try {
    const decoded = decodeURIComponent(s);
    if (isHttpUrl(decoded)) {
      debug("normalizeUrl", label, "decoded to http(s):", decoded);
      return decoded;
    }
    debug("normalizeUrl", label, "decoded but still not http(s):", decoded);
  } catch (e) {
    debug("normalizeUrl", label, "decodeURIComponent error:", String(e), "raw:", s);
  }
  debug("normalizeUrl", label, "invalid http(s):", s);
  return null;
}

// ===== 参数解析 & 清洗（$argument 字符串） =====
const args = {};
((($argument || "") + "")).split("&").forEach((p) => {
  if (!p) return;
  const idx = p.indexOf("=");
  if (idx === -1) return;
  const key = p.substring(0, idx);
  const value = p.substring(idx + 1);
  try {
    args[key] = decodeURIComponent(value || "");
  } catch (_) {
    args[key] = value || "";
  }
});

log("raw $argument:", ($argument || "") + "");

// ===== BoxJS & 参数优先级 =====
const KVStore = (() => {
  if (typeof $prefs !== "undefined" && $prefs.valueForKey) {
    return {
      read: (k) => $prefs.valueForKey(k),
      write: (v, k) => $prefs.setValueForKey(v, k),
    };
  }
  if (typeof $persistentStore !== "undefined" && $persistentStore.read) {
    return {
      read: (k) => $persistentStore.read(k),
      write: (v, k) => $persistentStore.write(v, k),
    };
  }
  try {
    if (typeof localStorage !== "undefined") {
      return {
        read: (k) => localStorage.getItem(k),
        write: (v, k) => localStorage.setItem(k, v),
      };
    }
  } catch (_) {}
  return { read: () => null, write: () => {} };
})();

/**
 * 读取 BoxJS 订阅信息设置：
 *  · 优先读取 key="Panel" 且含 SubscribeInfo.Settings
 *  · 兼容：
 *      - key="Panel.SubscribeInfo.Settings"
 *      - key="@Panel.SubscribeInfo.Settings"
 */
function readBoxSettings() {
  try {
    const rawPanel = KVStore.read("Panel");
    if (rawPanel) {
      let panel = rawPanel;
      if (typeof rawPanel === "string") {
        try {
          panel = JSON.parse(rawPanel);
        } catch (e) {
          log("readBoxSettings Panel JSON.parse error:", String(e));
        }
      }
      if (panel && typeof panel === "object") {
        if (panel.SubscribeInfo && panel.SubscribeInfo.Settings && typeof panel.SubscribeInfo.Settings === "object") {
          log("readBoxSettings hit Panel.SubscribeInfo.Settings");
          return panel.SubscribeInfo.Settings;
        }
      }
    } else {
      debug("readBoxSettings key 'Panel' empty");
    }
  } catch (e) {
    log("readBoxSettings read 'Panel' error:", String(e));
  }

  const candidates = ["Panel.SubscribeInfo.Settings", "@Panel.SubscribeInfo.Settings"];
  for (const key of candidates) {
    try {
      const raw = KVStore.read(key);
      if (!raw) {
        debug("readBoxSettings", key, "empty");
        continue;
      }
      let val = raw;
      if (typeof raw === "string") {
        try {
          val = JSON.parse(raw);
        } catch (e) {
          log("readBoxSettings", key, "JSON.parse error:", String(e));
          continue;
        }
      }
      if (val && typeof val === "object") {
        if (val.Settings && typeof val.Settings === "object") {
          log("readBoxSettings hit", key, "Settings");
          return val.Settings;
        }
        log("readBoxSettings hit", key, "direct object");
        return val;
      }
    } catch (e) {
      log("readBoxSettings read", key, "error:", String(e));
    }
  }

  debug("readBoxSettings no SubscribeInfo settings found, use {}");
  return {};
}

const BOX = readBoxSettings();

// debug 开关：BoxJS/arguments 任意处支持 is_debug=1/true
(function initDebugFlag() {
  const b = BOX && (BOX.is_debug || BOX.isDebug || BOX.debug);
  const a = args.is_debug || args.isDebug || args.debug;
  const v = cleanArg(a != null ? a : b);
  if (!v) return;
  IS_DEBUG = v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
  if (IS_DEBUG) log("debug enabled");
})();

debug("BOX snapshot:", (() => { try { return JSON.stringify(BOX); } catch (_) { return "[unstringifiable]"; } })());

function readBoxMulti(keys) {
  if (!BOX || typeof BOX !== "object") return undefined;
  for (const k of keys) {
    if (!k) continue;
    if (!Object.prototype.hasOwnProperty.call(BOX, k)) continue;
    const v = BOX[k];
    if (v === "" || v === null || v === undefined) continue;
    return v;
  }
  return undefined;
}

/**
 * 字符串参数读取，优先级：
 *   1）「已修改」的 #!arguments（与默认 arguments 不同）
 *   2）BoxJS (SubscribeInfo.Settings.*)
 *   3）「未修改」的 #!arguments（与默认 arguments 相同）
 *   4）defVal（脚本默认值）
 */
function pickStr(lowerKey, upperKey, defVal, defArgRaw) {
  const canon = (v) => (v == null ? "" : String(v).trim());

  const argRaw = Object.prototype.hasOwnProperty.call(args, lowerKey)
    ? args[lowerKey]
    : Object.prototype.hasOwnProperty.call(args, upperKey)
      ? args[upperKey]
      : null;

  const argClean = cleanArg(argRaw);
  const hasArg = argClean != null;

  const defArgCanon = canon(defArgRaw);

  const boxRaw = readBoxMulti([upperKey, lowerKey]);
  const boxClean = cleanArg(boxRaw);
  const hasBox = boxClean != null;

  let argChanged = false;
  if (argRaw !== null && argRaw !== undefined) {
    if (canon(argRaw) !== defArgCanon) argChanged = true;
  }

  let chosen;
  if (argChanged && hasArg) chosen = argClean;
  else if (hasBox) chosen = boxClean;
  else if (hasArg) chosen = argClean;
  else chosen = defVal;

  debug(
    "pickStr",
    `${lowerKey}/${upperKey}`,
    "| defVal:", defVal,
    "| defArgRaw:", defArgRaw,
    "| argRaw:", argRaw,
    "| argClean:", argClean,
    "| box:", boxClean,
    "| argChanged:", argChanged,
    "| chosen:", chosen
  );

  return chosen;
}

// =====================================================================
// 模块分类 · 网络请求（并发限流 / 单请求超时 / HEAD 优先回退 GET）
// =====================================================================

// 并发上限：建议 2~4（弱网 2，常规 3）
const CONCURRENCY_LIMIT = 3;

// 单请求硬超时：秒（关键：Egern 的 $httpClient.timeout 单位为“秒”）
const REQ_TIMEOUT_SEC = 6;

// JS 兜底定时器：毫秒
const REQ_TIMEOUT_MS = REQ_TIMEOUT_SEC * 1000;

// 重试次数：面板建议 0~1
const MAX_RETRY = 1;

function httpInvoke(method, options, cb) {
  const m = String(method || "GET").toUpperCase();
  const opt = Object.assign({}, options);

  // ✅ 给容器的 timeout 用“秒”
  if (!opt.timeout) opt.timeout = REQ_TIMEOUT_SEC;

  const lower = m.toLowerCase();
  const fn = $httpClient && $httpClient[lower] ? $httpClient[lower] : null;

  if (fn) {
    fn(opt, cb);
    return;
  }

  // fallback：只有 get 的环境，尝试通过 method 字段传递
  opt.method = m;
  $httpClient.get(opt, cb);
}

function httpRequestWithRetry(method, options, attempt, cb) {
  const start = Date.now();
  let finished = false;

  const timer = setTimeout(() => {
    if (finished) return;
    finished = true;
    cb(new Error("timeout"), null);
  }, REQ_TIMEOUT_MS + 200);

  const done = (err, resp) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    debug(
      "httpRequest",
      String(method || "GET"),
      "attempt",
      attempt,
      "cost(ms):",
      Date.now() - start,
      "err:",
      err && String(err),
      "status:",
      resp && resp.status
    );
    cb(err, resp);
  };

  httpInvoke(method, options, (err, resp) => {
    if (err || !resp) {
      if (attempt < MAX_RETRY) return httpRequestWithRetry(method, options, attempt + 1, cb);
      return done(err || new Error("request error"), resp);
    }
    done(null, resp);
  });
}

function requestSubInfo(url, headers, cb) {
  const env = detectClient();
  const opt = { url, headers };

  // ✅ Egern：尽量跟随重定向 + 自动 cookie（对部分订阅/短链更稳）
  if (env.isEgern) {
    opt["auto-redirect"] = true;
    opt["auto-cookie"] = true;
  }

  // 1) HEAD 优先（仅取 header）
  httpRequestWithRetry("HEAD", opt, 1, (errH, respH) => {
    const statusH = respH && respH.status;

    // HEAD 成功：200~399（允许 302 等跳转）
    if (!errH && respH && statusH >= 200 && statusH < 400) {
      cb(null, respH);
      return;
    }

    // 2) 回退 GET
    httpRequestWithRetry("GET", opt, 1, cb);
  });
}

// ===== 并发池：限制同一时间最多跑 N 个任务 =====
async function runPool(tasks, limit) {
  const results = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const cur = nextIndex++;
      if (cur >= tasks.length) break;
      try {
        results[cur] = await tasks[cur]();
      } catch (e) {
        results[cur] = null;
      }
    }
  }

  const workers = [];
  const n = Math.max(1, Math.min(limit || 3, tasks.length));
  for (let i = 0; i < n; i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

// =====================================================================
// 模块分类 · 订阅信息拉取与解析（subscription-userinfo）
// =====================================================================

function fetchInfo(url, resetDayRaw, title, index) {
  return new Promise((resolve) => {
    debug("fetchInfo start", "slot", index, "url:", url, "title:", title, "resetDay:", resetDayRaw);

    requestSubInfo(url, buildHeaders(), (err, resp) => {
      if (err || !resp) {
        log("fetchInfo final error", "slot", index, "err:", err && String(err), "status:", resp && resp.status);
        const reason = err && String(err) === "Error: timeout" ? "请求超时" : "请求错误";
        resolve(`机场：${title}\n订阅请求失败：${reason}`);
        return;
      }

      debug("fetchInfo resp", "slot", index, "status:", resp.status);

      if (!(resp.status >= 200 && resp.status < 400)) {
        resolve(`机场：${title}\n订阅请求失败，状态码：${resp.status}`);
        return;
      }

      const headerKey = Object.keys(resp.headers || {}).find((k) => k.toLowerCase() === "subscription-userinfo");
      debug("fetchInfo headerKey slot", index, "=>", headerKey || "none");

      const data = {};
      if (headerKey && resp.headers[headerKey]) {
        resp.headers[headerKey].split(";").forEach((p) => {
          const kv = p.trim().split("=");
          if (kv.length !== 2) return;
          const k = kv[0];
          const v = kv[1];
          if (!k || !v) return;
          const num = parseInt(v, 10);
          if (!isNaN(num)) data[k] = num;
        });
      }

      debug("fetchInfo userinfo slot", index, (() => { try { return JSON.stringify(data); } catch (_) { return "[unstringifiable]"; } })());

      const upload = data.upload || 0;
      const download = data.download || 0;
      const total = data.total || 0;
      const used = upload + download;
      const remain = Math.max(total - used, 0);

      // 到期时间：无则 2099-12-31
      let expireMs;
      if (data.expire) {
        let exp = Number(data.expire);
        if (/^\d+$/.test(String(data.expire))) {
          if (exp < 10000000000) exp *= 1000; // 秒→毫秒
        }
        expireMs = exp;
      } else {
        expireMs = new Date("2099-12-31T00:00:00Z").getTime();
      }
      const expireStr = formatDate(expireMs);

      // 重置：数字→N天；年/绝对日期→自动滚动；文本→原文
      let resetLinePart = "";
      const resetClean = cleanArg(resetDayRaw);
      if (resetClean) {
        const spec = parseResetSpec(resetClean);

        if (spec && spec.type === "monthly") {
          const left = getResetDaysLeft(spec.day);
          resetLinePart = `重置：${left ?? 0}天`;
        } else if (spec && (spec.type === "yearly" || spec.type === "absolute")) {
          const nextDate = nextResetDateFromSpec(spec);
          if (nextDate) {
            const left = daysUntilDate(nextDate);
            resetLinePart = `重置：${left}天（${formatDate(nextDate.getTime())}）`;
          } else {
            resetLinePart = `重置：${resetClean}`;
          }
        } else {
          resetLinePart = `重置：${resetClean}`;
        }
      }

      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
      const titleLine = `${title} | ${bytesToSize(total)} | ${timeStr}`;
      const usedLine = `已用：${toPercent(used, total)} ➟ ${bytesToSize(used)}`;
      const remainLine = `剩余：${toReversePercent(used, total)} ➟ ${bytesToSize(remain)}`;
      let tailLine = `到期：${expireStr}`;
      if (resetLinePart) tailLine = `${resetLinePart} | 到期：${expireStr}`;

      const block = [titleLine, usedLine, remainLine, tailLine].join("\n");
      debug("fetchInfo done", "slot", index, "\n" + block);
      resolve(block);
    });
  });
}

// =====================================================================
// 模块分类 · 主流程
// =====================================================================
function pad2(n) {
  return String(n).padStart(2, "0");
}
function runAtLine() {
  const d = new Date();
  const MM = pad2(d.getMonth() + 1);
  const DD = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return `⏱ 执行时间：${MM}-${DD} ${hh}:${mm}:${ss}`;
}

(async () => {
  const startAt = Date.now();
  log(`${SCRIPT_NAME} start | UA=${buildUA()} | env=${JSON.stringify(detectClient())}`);

  try {
    const defaultIcon = pickStr(
      "defaultIcon",
      "DefaultIcon",
      "antenna.radiowaves.left.and.right.circle.fill",
      "antenna.radiowaves.left.and.right.circle.fill"
    );
    const defaultColor = pickStr("defaultIconColor", "DefaultIconColor", "#00E28F", "#00E28F");

    // 收集任务（保持 slots 顺序），再并发限流执行
    const tasks = [];
    for (let i = 1; i <= 10; i++) {
      const rawUrl = pickStr(`url${i}`, `URL${i}`, null, "订阅链接");
      const url = normalizeUrl(rawUrl, "url" + i);

      const rawTitle = pickStr(`title${i}`, `Title${i}`, null, "机场名称");
      const title = rawTitle || `机场${i}`;

      const reset = pickStr(`resetDay${i}`, `ResetDay${i}`, null, "重置日期");

      debug("slot", i, "| rawUrl:", rawUrl, "| url:", url, "| title:", title, "| reset:", reset);

      if (!url || !isHttpUrl(url)) {
        debug("slot", i, "no valid url, skip request");
        continue;
      }

      tasks.push(() => fetchInfo(url, reset, title, i));
    }

    const results = await runPool(tasks, CONCURRENCY_LIMIT);
    const blocks = results.filter(Boolean);

    const contentAll = blocks.length ? blocks.join("\n\n") : "未配置订阅参数";
    const content = `${runAtLine()}\n\n${contentAll}`;

    log("final blocks count:", blocks.length);
    debug("final content:\n" + content);

    $done({
      title: "订阅信息",
      content,
      icon: defaultIcon,
      iconColor: defaultColor,
    });
  } catch (e) {
    logErr(e, "main");
    // 出错也要结束，避免 Egern 只剩 exec timeout
    $done({
      title: "订阅信息",
      content: `${runAtLine()}\n\n脚本异常：${e && (e.message || String(e))}`,
      icon: "exclamationmark.triangle.fill",
      iconColor: "#FF3B30",
    });
  } finally {
    const cost = ((Date.now() - startAt) / 1000).toFixed(2);
    log(`${SCRIPT_NAME} end | cost=${cost}s`);
  }
})();
