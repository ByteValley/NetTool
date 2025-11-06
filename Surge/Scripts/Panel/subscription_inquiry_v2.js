// ===== 工具函数 =====
function bytesToSize(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024, sizes = ["B", "KB", "MB", "GB", "TB"];
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

// ===== 参数解析 & 清洗 =====
const args = {};
($argument || "").split("&").forEach(p => {
  const idx = p.indexOf("=");
  if (idx === -1) return;
  const key = p.substring(0, idx);
  const value = p.substring(idx + 1);
  args[key] = decodeURIComponent(value || "");
});
function getArg(lower, upper) { return args[lower] ?? args[upper] ?? null; }
function isPlaceholder(val) {
  const s = String(val || "").trim();
  return /^{{{[^}]+}}}$/.test(s);
}
function cleanArg(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s) return null;
  const low = s.toLowerCase();
  if (isPlaceholder(s) || low === "null" || low === "undefined") return null;
  return s;
}
function isPureNumber(s) { return typeof s === "number" || (/^\d+$/.test(String(s || "").trim())); }
function isHttpUrl(s) { return /^https?:\/\//i.test(String(s || "")); }

// ===== 带超时的 GET 包装 =====
function httpGetWithTimeout(url, timeoutMs) {
  return new Promise((resolve) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      resolve({ err: new Error("Timeout"), resp: null });
    }, timeoutMs);

    $httpClient.get(
      { url, headers: { "User-Agent": "Quantumult%20X/1.5.2", "Accept": "*/*" } },
      (err, resp) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve({ err, resp });
      }
    );
  });
}

// ===== 解析订阅头 =====
function parseSubInfo(headers = {}) {
  const headerKey = Object.keys(headers).find(k => k.toLowerCase() === "subscription-userinfo");
  const info = {};
  if (headerKey && headers[headerKey]) {
    String(headers[headerKey]).split(";").forEach(p => {
      const [k, v] = p.trim().split("=");
      if (k && v && /^\d+(\.\d+)?$/.test(v)) info[k] = parseInt(v, 10);
    });
  }
  return info;
}

// ===== 拉取机场信息（返回文本块） =====
async function fetchInfo(url, resetDayRaw, title, timeoutMs) {
  const { err, resp } = await httpGetWithTimeout(url, timeoutMs);

  if (err || !resp) {
    return `机场：${title}\n订阅请求失败，状态码：${resp ? resp.status : "请求错误/超时"}`;
  }
  if (resp.status !== 200) {
    return `机场：${title}\n订阅请求失败，状态码：${resp.status}`;
  }

  const data = parseSubInfo(resp.headers || {});
  const upload = data.upload || 0;
  const download = data.download || 0;
  const total = data.total || 0;
  const used = upload + download;
  const remain = Math.max(total - used, 0);

  // 到期时间：无则 2099-12-31
  let expireMs;
  if (data.expire != null) {
    let exp = Number(data.expire);
    if (Number.isFinite(exp)) {
      if (exp < 10_000_000_000) exp *= 1000; // 秒→毫秒
      expireMs = exp;
    }
  }
  if (!expireMs) expireMs = new Date("2099-12-31T00:00:00Z").getTime();
  const expireStr = formatDate(expireMs);

  // 重置：数字→N天；中文/非数字→原文；未提供则不显示
  let resetLinePart = "";
  const resetClean = cleanArg(resetDayRaw);
  if (resetClean) {
    if (isPureNumber(resetClean)) {
      const left = getResetDaysLeft(parseInt(resetClean, 10));
      resetLinePart = `重置：${left ?? 0}天`;
    } else {
      resetLinePart = `重置：${resetClean}`;
    }
  }

  // 构建内容
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  const titleLine  = `${title} | ${bytesToSize(total)} | ${timeStr}`;
  const usedLine   = `已用：${toPercent(used, total)} ➟ ${bytesToSize(used)}`;
  const remainLine = `剩余：${toReversePercent(used, total)} ➟ ${bytesToSize(remain)}`;
  let tailLine = `到期：${expireStr}`;
  if (resetLinePart) tailLine = `${resetLinePart} | 到期：${expireStr}`;

  return [titleLine, usedLine, remainLine, tailLine].join("\n");
}

// ===== 并发池（限流执行器） =====
async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) break;
      try {
        results[i] = await worker(items[i], i);
      } catch (e) {
        results[i] = `机场：${items[i].name}\n订阅请求失败：${e && e.message ? e.message : "未知错误"}`;
      }
    }
  }

  const size = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: size }, runner));
  return results;
}

// ===== 主流程 =====
(async () => {
  // 面板图标
  const defaultIcon  = cleanArg(getArg("defaultIcon", "DefaultIcon")) || "antenna.radiowaves.left.and.right.circle.fill";
  const defaultColor = cleanArg(getArg("defaultIconColor", "DefaultIconColor")) || "#00E28F";

  // 并发与超时参数
  const concurrent = (() => {
    const raw = cleanArg(getArg("concurrent", "Concurrent"));
    const n = raw && /^\d+$/.test(raw) ? parseInt(raw, 10) : 5;
    return Math.max(1, Math.min(10, n)); // 安全上限 10
  })();
  const reqTimeout = (() => {
    const raw = cleanArg(getArg("timeout", "Timeout"));
    const n = raw && /^\d+$/.test(raw) ? parseInt(raw, 10) : 6000;
    return Math.max(1000, Math.min(30000, n)); // 1s ~ 30s
  })();

  // 收集任务
  const items = [];
  for (let i = 1; i <= 10; i++) {
    const urlRaw   = getArg(`url${i}`,   `URL${i}`);
    const titleRaw = getArg(`title${i}`, `Title${i}`);
    const resetRaw = getArg(`resetDay${i}`, `ResetDay${i}`);

    const url   = cleanArg(urlRaw);
    const title = cleanArg(titleRaw);

    if (!url || !isHttpUrl(url)) continue;

    items.push({
      url,
      name: title || `机场${i}`,
      reset: resetRaw
    });
  }

  let blocks = [];
  if (items.length) {
    blocks = await runPool(
      items,
      concurrent,
      (it) => fetchInfo(it.url, it.reset, it.name, reqTimeout)
    );
  }

  const contentAll = blocks.length ? blocks.join("\n\n") : "未配置订阅参数";
  $done({
    title: "订阅信息",
    content: contentAll,
    icon: defaultIcon,
    iconColor: defaultColor
  });
})();
