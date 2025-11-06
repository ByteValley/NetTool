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

function getArg(lower, upper) {
  return args[lower] ?? args[upper] ?? null;
}
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
function isPureNumber(s) {
  return typeof s === "number" || (/^\d+$/.test(String(s || "").trim()));
}
function isHttpUrl(s) {
  return /^https?:\/\//i.test(String(s || ""));
}

// ===== 拉取机场信息（返回文本块） =====
function fetchInfo(url, resetDayRaw, title) {
  return new Promise(resolve => {
    $httpClient.get({ url, headers: { "User-Agent": "Quantumult%20X/1.5.2" } }, (err, resp) => {
      if (err || !resp) {
        resolve(`机场：${title}\n订阅请求失败，状态码：${resp ? resp.status : "请求错误"}`);
        return;
      }
      if (resp.status !== 200) {
        resolve(`机场：${title}\n订阅请求失败，状态码：${resp.status}`);
        return;
      }

      const headerKey = Object.keys(resp.headers).find(k => k.toLowerCase() === "subscription-userinfo");
      const data = {};
      if (headerKey && resp.headers[headerKey]) {
        resp.headers[headerKey].split(";").forEach(p => {
          const [k, v] = p.trim().split("=");
          if (k && v) data[k] = parseInt(v);
        });
      }

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
          if (exp < 10_000_000_000) exp *= 1000; // 秒→毫秒
        }
        expireMs = exp;
      } else {
        expireMs = new Date("2099-12-31T00:00:00Z").getTime();
      }
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

      resolve([titleLine, usedLine, remainLine, tailLine].join("\n"));
    });
  });
}

// ===== 主流程 =====
(async () => {
  // 同一面板使用一个默认图标
  const defaultIcon  = cleanArg(getArg("defaultIcon", "DefaultIcon")) || "antenna.radiowaves.left.and.right.circle.fill";
  const defaultColor = cleanArg(getArg("defaultIconColor", "DefaultIconColor")) || "#00E28F";

  const blocks = [];
  for (let i = 1; i <= 10; i++) {
    const urlRaw   = getArg(`url${i}`,   `URL${i}`);
    const titleRaw = getArg(`title${i}`, `Title${i}`);
    const resetRaw = getArg(`resetDay${i}`, `ResetDay${i}`);

    const url   = cleanArg(urlRaw);
    const title = cleanArg(titleRaw);

    // 未填写 / 占位符 / 非 http(s) URL → 跳过该项
    if (!url || !isHttpUrl(url)) continue;

    const name = title || `机场${i}`;
    const block = await fetchInfo(url, resetRaw, name);
    blocks.push(block);
  }

  const contentAll = blocks.length ? blocks.join("\n\n") : "未配置订阅参数";
  $done({
    title: "订阅信息",
    content: contentAll,
    icon: defaultIcon,
    iconColor: defaultColor
  });
})();
