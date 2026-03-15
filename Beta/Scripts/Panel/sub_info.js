/* =========================================================
 * 模块：订阅信息面板（多机场流量 / 到期展示）
 * 作者：ByteValley
 * 版本：2026-03-15R1
 *
 * 概述 · 功能边界
 * · 支持最多 10 组订阅链接，按顺序展示总量 / 已用 / 剩余 / 到期时间
 * · 自动解析 subscription-userinfo 头（upload / download / total / expire）
 * · 支持每个订阅配置单独重置规则（按日 / 年月日 / 自定义文本）
 * · 直接请求机场原始订阅链接，不手动指定 User-Agent，使用宿主自带 UA
 *
 * 运行环境 · 依赖接口
 * · 兼容：Surge 面板 / Egern
 * · 依赖：$httpClient / $persistentStore | $prefs / $done
 *
 * 参数源 · BoxJS 结构
 * · BoxJS 存储根推荐结构：key = "Panel"
 *   {
 *     "NetworkInfo":  { "Settings": {...}, "Caches": ... },
 *     "SubscribeInfo":{ "Settings": {...}, "Caches": ... }
 *   }
 * · 本脚本优先读取 Panel.SubscribeInfo.Settings
 * · 兼容：
 *   - 直接 key = "Panel.SubscribeInfo.Settings"
 *   - 直接 key = "@Panel.SubscribeInfo.Settings"
 *
 * 参数 · 命名 & 取值优先级
 * · 所有参数均支持「小写 + 大写」两种键名：
 *   - defaultIcon / DefaultIcon
 *   - defaultIconColor / DefaultIconColor
 *   - url1 / URL1, url2 / URL2, ... url10 / URL10
 *   - title1 / Title1, resetDay1 / ResetDay1, ...（以此类推）
 *
 * · 单值参数优先级（最终逻辑）
 *   1）若模块 #!arguments 中有“已修改值”
 *      ⇒ 使用模块参数
 *   2）否则，若 BoxJS（SubscribeInfo.Settings.*）有值
 *      ⇒ 使用 BoxJS
 *   3）否则，若模块 #!arguments 中有值
 *      ⇒ 使用模块参数
 *   4）否则 ⇒ 使用脚本默认 defVal
 *
 * URL 特性
 * · 支持原始 http(s) 链接
 * · 支持 encodeURIComponent 后的整串值（会自动解码一次）
 * · 以下视为占位符，等价“未配置”：订阅链接 / 机场名称 / 重置日期
 *
 * 显示规则 · 面板格式
 * · 每个机场四行：
 *   1）名称 | 总量 | 当前时间(HH:MM)
 *   2）已用：xx.xx% ➟ xx.xx GB
 *   3）剩余：xx.xx% ➟ xx.xx GB
 *   4）重置：X天 | 到期：YYYY.MM.DD  或  仅 到期：YYYY.MM.DD
 *
 * · 无任何有效订阅（全部 urlN 无法解析为 http(s) 链接）时：
 *   · 面板内容：未配置订阅参数
 *
 * 优化说明 · 超时治理
 * · 并发限流：避免串行 10 次请求叠加总耗时
 * · 单请求硬超时：避免某个机场卡死拖垮全局
 * · 直接 GET：避免部分机场 / CDN 不正确处理 HEAD
 * · 降低重试：面板场景更应该“快失败”，而不是“慢三倍”
 *
 * 日志说明
 * · 默认输出基础日志（控制台 console.log）
 * · 标记前缀统一为：[SubscribeInfo]
 * · 每次 log 只打印一行完整文本，防止刷屏
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

// =====================================================================
// 模块分类 · 日志工具
// =====================================================================

const TAG = "SubscribeInfo";

function log() {
  if (typeof console === "undefined" || !console.log) return;
  const parts = [];
  for (let i = 0; i < arguments.length; i++) {
    const v = arguments[i];
    if (v === null || v === undefined) {
      parts.push("");
    } else if (typeof v === "string") {
      parts.push(v);
    } else {
      try {
        parts.push(JSON.stringify(v));
      } catch (_) {
        parts.push(String(v));
      }
    }
  }
  console.log("[" + TAG + "] " + parts.join(" "));
}

// =====================================================================
// 模块分类 · 工具函数
// =====================================================================

function bytesToSize(bytes) {
  const n = Number(bytes || 0);
  if (!n || n <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(k)), sizes.length - 1);
  const val = n / Math.pow(k, i);
  return `${val.toFixed(2)} ${sizes[i]}`;
}

function toPercent(used, total) {
  const u = Number(used || 0);
  const t = Number(total || 0);
  if (!t || t <= 0) return "0.00%";
  return `${((u / t) * 100).toFixed(2)}%`;
}

function toReversePercent(used, total) {
  const u = Number(used || 0);
  const t = Number(total || 0);
  if (!t || t <= 0) return "0.00%";
  return `${(((t - u) / t) * 100).toFixed(2)}%`;
}

function formatDate(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "未知";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
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

function getResetDaysLeft(resetDayNum) {
  if (!resetDayNum) return null;
  const now = new Date();
  const today = startOfDay(now);

  let resetDate = new Date(now.getFullYear(), now.getMonth(), resetDayNum);
  if (startOfDay(resetDate) <= today) {
    resetDate = new Date(now.getFullYear(), now.getMonth() + 1, resetDayNum);
  }

  return daysUntilDate(resetDate);
}

function isPureNumber(s) {
  return typeof s === "number" || /^\d+$/.test(String(s || "").trim());
}

function isHttpUrl(s) {
  return /^https?:\/\//i.test(String(s || "").trim());
}

function findHeaderValue(headers, headerName) {
  if (!headers || !headerName) return null;
  const target = String(headerName).toLowerCase();
  const keys = Object.keys(headers);
  for (const k of keys) {
    if (String(k).toLowerCase() === target) {
      return headers[k];
    }
  }
  return null;
}

// =====================================================================
// 模块分类 · resetDay 解析
// =====================================================================

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

  if (!spec) return null;

  if (spec.type === "yearly") {
    let d = new Date(now.getFullYear(), spec.month - 1, spec.day);
    if (startOfDay(d) <= today) {
      d = new Date(now.getFullYear() + 1, spec.month - 1, spec.day);
    }
    return d;
  }

  if (spec.type === "absolute") {
    let d = new Date(spec.year, spec.month - 1, spec.day);
    if (startOfDay(d) <= today) {
      let y = now.getFullYear();
      d = new Date(y, spec.month - 1, spec.day);
      if (startOfDay(d) <= today) {
        d = new Date(y + 1, spec.month - 1, spec.day);
      }
    }
    return d;
  }

  return null;
}

// =====================================================================
// 模块分类 · 占位符 / 清洗
// =====================================================================

const PLACEHOLDER_STRINGS = [
  "订阅链接",
  "机场名称",
  "重置日期"
];

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

function normalizeUrl(src, label) {
  const s = cleanArg(src);
  if (!s) {
    log("normalizeUrl", label, "=> empty/placeholder, skip");
    return null;
  }

  if (isHttpUrl(s)) {
    log("normalizeUrl", label, "use raw http(s):", s);
    return s;
  }

  try {
    const decoded = decodeURIComponent(s);
    if (isHttpUrl(decoded)) {
      log("normalizeUrl", label, "decoded to http(s):", decoded);
      return decoded;
    }
    log("normalizeUrl", label, "decoded but still not http(s):", decoded);
  } catch (e) {
    log("normalizeUrl", label, "decodeURIComponent error:", String(e), "raw:", s);
  }

  log("normalizeUrl", label, "invalid http(s):", s);
  return null;
}

// =====================================================================
// 模块分类 · 参数解析（$argument）
// =====================================================================

const args = {};
(($argument || "") + "").split("&").forEach(p => {
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

function getArg(lower, upper) {
  if (Object.prototype.hasOwnProperty.call(args, lower)) return args[lower];
  if (Object.prototype.hasOwnProperty.call(args, upper)) return args[upper];
  return null;
}

// =====================================================================
// 模块分类 · KV / BoxJS
// =====================================================================

const KVStore = (() => {
  if (typeof $prefs !== "undefined" && $prefs.valueForKey) {
    return {
      read: k => $prefs.valueForKey(k),
      write: (v, k) => $prefs.setValueForKey(v, k)
    };
  }

  if (typeof $persistentStore !== "undefined" && $persistentStore.read) {
    return {
      read: k => $persistentStore.read(k),
      write: (v, k) => $persistentStore.write(v, k)
    };
  }

  try {
    if (typeof localStorage !== "undefined") {
      return {
        read: k => localStorage.getItem(k),
        write: (v, k) => localStorage.setItem(k, v)
      };
    }
  } catch (_) {}

  return {
    read: () => null,
    write: () => {}
  };
})();

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
        if (
          panel.SubscribeInfo &&
          panel.SubscribeInfo.Settings &&
          typeof panel.SubscribeInfo.Settings === "object"
        ) {
          log("readBoxSettings hit Panel.SubscribeInfo.Settings");
          return panel.SubscribeInfo.Settings;
        }
      }
    } else {
      log("readBoxSettings key 'Panel' empty");
    }
  } catch (e) {
    log("readBoxSettings read 'Panel' error:", String(e));
  }

  const candidates = [
    "Panel.SubscribeInfo.Settings",
    "@Panel.SubscribeInfo.Settings"
  ];

  for (const key of candidates) {
    try {
      const raw = KVStore.read(key);
      if (!raw) {
        log("readBoxSettings", key, "empty");
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

  log("readBoxSettings no SubscribeInfo settings found, use {}");
  return {};
}

const BOX = readBoxSettings();
try {
  log("BOX snapshot:", JSON.stringify(BOX));
} catch (e) {
  log("BOX snapshot stringify error:", String(e));
}

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
 * 1）已修改的 #!arguments（与默认 arguments 不同）
 * 2）BoxJS (SubscribeInfo.Settings.*)
 * 3）未修改的 #!arguments（与默认 arguments 相同）
 * 4）defVal（脚本默认值）
 */
function pickStr(lowerKey, upperKey, defVal, defArgRaw) {
  const canon = v => (v == null ? "" : String(v).trim());

  const argRaw =
    Object.prototype.hasOwnProperty.call(args, lowerKey)
      ? args[lowerKey]
      : (Object.prototype.hasOwnProperty.call(args, upperKey) ? args[upperKey] : null);

  const argClean = cleanArg(argRaw);
  const hasArg = argClean != null;

  const defArgCanon = canon(defArgRaw);

  const boxRaw = readBoxMulti([upperKey, lowerKey]);
  const boxClean = cleanArg(boxRaw);
  const hasBox = boxClean != null;

  let argChanged = false;
  if (argRaw !== null && argRaw !== undefined) {
    if (canon(argRaw) !== defArgCanon) {
      argChanged = true;
    }
  }

  let chosen;
  if (argChanged && hasArg) {
    chosen = argClean;
  } else if (hasBox) {
    chosen = boxClean;
  } else if (hasArg) {
    chosen = argClean;
  } else {
    chosen = defVal;
  }

  log(
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
// 模块分类 · 网络请求（宿主自带 UA / 直接 GET）
// =====================================================================

const CONCURRENCY_LIMIT = 3;
const REQ_TIMEOUT_MS = 5000;
const MAX_RETRY = 1;

function httpInvoke(method, options, cb) {
  const m = String(method || "GET").toUpperCase();
  const opt = Object.assign({}, options);

  if (!opt.timeout) opt.timeout = REQ_TIMEOUT_MS;

  const lower = m.toLowerCase();
  const fn = $httpClient && $httpClient[lower] ? $httpClient[lower] : null;

  if (fn) {
    fn(opt, cb);
    return;
  }

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
    log(
      "httpRequest",
      String(method || "GET"),
      "attempt", attempt,
      "cost(ms):", Date.now() - start,
      "err:", err && String(err),
      "status:", resp && resp.status
    );
    cb(err, resp);
  };

  httpInvoke(method, options, (err, resp) => {
    if (err || !resp) {
      if (attempt < MAX_RETRY) {
        return httpRequestWithRetry(method, options, attempt + 1, cb);
      }
      return done(err || new Error("request error"), resp);
    }
    done(null, resp);
  });
}

function requestSubInfo(url, cb) {
  const opt = { url };
  // 不主动设置 User-Agent，交给宿主（Surge / Egern）使用自带默认 UA
  httpRequestWithRetry("GET", opt, 1, cb);
}

// =====================================================================
// 模块分类 · 并发池
// =====================================================================

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
        log("runPool task error:", String(e));
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
// 模块分类 · subscription-userinfo 解析
// =====================================================================

function parseSubscriptionUserInfo(raw) {
  const data = {};
  const text = String(raw || "").trim();
  if (!text) return data;

  text.split(";").forEach(p => {
    const idx = p.indexOf("=");
    if (idx === -1) return;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (!k || !v) return;

    const num = parseInt(v, 10);
    if (!isNaN(num)) data[k] = num;
  });

  return data;
}

function buildResetLine(resetDayRaw) {
  let resetLinePart = "";
  const resetClean = cleanArg(resetDayRaw);

  if (!resetClean) return resetLinePart;

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

  return resetLinePart;
}

function fetchInfo(url, resetDayRaw, title, index) {
  return new Promise(resolve => {
    log("fetchInfo start", "slot", index, "url:", url, "title:", title, "resetDay:", resetDayRaw);

    requestSubInfo(url, (err, resp) => {
      if (err || !resp) {
        log("fetchInfo final error", "slot", index, "err:", err && String(err), "status:", resp && resp.status);
        const reason = err && String(err) === "Error: timeout" ? "请求超时" : "请求错误";
        resolve(`机场：${title}\n订阅请求失败：${reason}`);
        return;
      }

      log("fetchInfo resp", "slot", index, "status:", resp.status);

      if (!(resp.status >= 200 && resp.status < 400)) {
        resolve(`机场：${title}\n订阅请求失败，状态码：${resp.status}`);
        return;
      }

      const headerVal = findHeaderValue(resp.headers || {}, "subscription-userinfo");
      log("fetchInfo header slot", index, "exists:", !!headerVal);

      if (!headerVal) {
        resolve(`机场：${title}\n未返回 subscription-userinfo`);
        return;
      }

      const data = parseSubscriptionUserInfo(headerVal);

      try {
        log("fetchInfo userinfo slot", index, JSON.stringify(data));
      } catch (_) {}

      const upload = Number(data.upload || 0);
      const download = Number(data.download || 0);
      const total = Number(data.total || 0);
      const used = upload + download;
      const remain = Math.max(total - used, 0);

      let expireMs;
      if (data.expire) {
        let exp = Number(data.expire);
        if (/^\d+$/.test(String(data.expire))) {
          if (exp < 10000000000) exp *= 1000;
        }
        expireMs = exp;
      } else {
        expireMs = new Date("2099-12-31T00:00:00Z").getTime();
      }

      const expireStr = formatDate(expireMs);
      const resetLinePart = buildResetLine(resetDayRaw);

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

      const titleLine = `${title} | ${bytesToSize(total)} | ${timeStr}`;
      const usedLine = `已用：${toPercent(used, total)} ➟ ${bytesToSize(used)}`;
      const remainLine = `剩余：${toReversePercent(used, total)} ➟ ${bytesToSize(remain)}`;

      let tailLine = `到期：${expireStr}`;
      if (resetLinePart) {
        tailLine = `${resetLinePart} | 到期：${expireStr}`;
      }

      const block = [titleLine, usedLine, remainLine, tailLine].join("\n");
      log("fetchInfo done", "slot", index, "\n" + block);
      resolve(block);
    });
  });
}

// =====================================================================
// 模块分类 · 主流程
// =====================================================================

(async () => {
  log("script start");

  const defaultIcon = pickStr(
    "defaultIcon",
    "DefaultIcon",
    "antenna.radiowaves.left.and.right.circle.fill",
    "antenna.radiowaves.left.and.right.circle.fill"
  );

  const defaultColor = pickStr(
    "defaultIconColor",
    "DefaultIconColor",
    "#00E28F",
    "#00E28F"
  );

  const tasks = [];

  for (let i = 1; i <= 10; i++) {
    const rawUrl = pickStr(`url${i}`, `URL${i}`, null, "订阅链接");
    const url = normalizeUrl(rawUrl, "url" + i);

    const rawTitle = pickStr(`title${i}`, `Title${i}`, null, "机场名称");
    const title = rawTitle || `机场${i}`;

    const reset = pickStr(`resetDay${i}`, `ResetDay${i}`, null, "重置日期");

    log(
      "slot", i,
      "| rawUrl:", rawUrl,
      "| url:", url,
      "| title:", title,
      "| reset:", reset
    );

    if (!url || !isHttpUrl(url)) {
      log("slot", i, "no valid url, skip request");
      continue;
    }

    tasks.push(() => fetchInfo(url, reset, title, i));
  }

  const results = await runPool(tasks, CONCURRENCY_LIMIT);
  const blocks = results.filter(Boolean);

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

  const contentAll = blocks.length ? blocks.join("\n\n") : "未配置订阅参数";
  const content = `${runAtLine()}\n\n${contentAll}`;

  log("final blocks count:", blocks.length);
  log("final content:\n" + content);

  $done({
    title: "订阅信息",
    content,
    icon: defaultIcon,
    iconColor: defaultColor
  });
})();
