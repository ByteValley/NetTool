// ===== 工具函数 =====
function bytesToSize(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024, sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${val >= 100 ? val.toFixed(0) : val >= 10 ? val.toFixed(1) : val.toFixed(2)} ${sizes[i]}`;
}
function toPercent(used, total) {
  if (!total) return "0%";
  return `${Math.round((used / total) * 100)}%`;
}
function toReversePercent(used, total) {
  if (!total) return "0%";
  return `${Math.round(((total - used) / total) * 100)}%`;
}
function toMultiply(total, used) { // 实际即“剩余字节”
  const remain = Math.max((total || 0) - (used || 0), 0);
  return bytesToSize(remain);
}
function formatTime(ts) {
  try {
    const d = new Date(ts);
    const Y = d.getFullYear();
    const M = String(d.getMonth() + 1).padStart(2, "0");
    const D = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${Y}-${M}-${D} ${h}:${m}`;
  } catch {
    return "--";
  }
}

// ===== 参数解析（兼容大小写）=====
const args = {};
($argument || "").split("&").forEach(p => {
  const idx = p.indexOf("=");
  if (idx === -1) return;
  const key = p.substring(0, idx);
  const value = p.substring(idx + 1);
  args[key] = decodeURIComponent(value || "");
});
function pickArg(prefLower, prefUpper) {
  return args[prefLower] ?? args[prefUpper] ?? null;
}

// ===== 计算重置信息（返回天数整数）=====
function getResetDaysLeft(resetDay) {
  if (!resetDay) return null;
  const today = new Date();
  const nowDay = today.getDate();
  const nowMonth = today.getMonth();
  const nowYear = today.getFullYear();
  let resetDate;
  if (nowDay < resetDay) {
    resetDate = new Date(nowYear, nowMonth, resetDay);
  } else {
    resetDate = new Date(nowYear, nowMonth + 1, resetDay);
  }
  const diff = Math.ceil((resetDate - today) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

// ===== 拉取一个订阅并按“这样”的样式拼装 =====
function fetchInfo(url, resetDay) {
  return new Promise(resolve => {
    $httpClient.get({ url, headers: { "User-Agent": "Quantumult%20X/1.5.2" } }, (err, resp) => {
      if (err || !resp || resp.status !== 200) {
        resolve(`订阅请求失败，状态码：${resp ? resp.status : "请求错误"}`);
        return;
      }

      const data = {};
      const headerKey = Object.keys(resp.headers).find(k => k.toLowerCase() === "subscription-userinfo");
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

      // 第一行：已用/剩余（百分比 + 字节）
      const lines = [];
      const line1 = `已用：${toPercent(used, total)} ➟ ${bytesToSize(used)} \n剩余：${toReversePercent(used, total)} ➟ ${toMultiply(total, used)}`;
      lines.push(line1);

      // 第二行：重置天数与到期时间
      let expire = data.expire;
      let expireMs = null;
      if (expire) {
        // 兼容秒/毫秒
        expireMs = /^[\d.]+$/.test(String(expire)) ? (Number(expire) < 10_000_000_000 ? Number(expire) * 1000 : Number(expire)) : null;
      }
      const resetLeft = getResetDaysLeft(resetDay);

      if ((resetLeft !== null && resetLeft !== undefined) || expireMs) {
        if (resetLeft !== null && expireMs) {
          lines.push(`重置：${resetLeft}天 \t|  ${formatTime(expireMs)}`);
        } else if (resetLeft !== null && !expireMs) {
          lines.push(`重置：${resetLeft}天`);
        } else if ((resetLeft === null || resetLeft === undefined) && expireMs) {
          lines.push(`到期：${formatTime(expireMs)}`);
        }
      }

      resolve(lines.join("\n"));
    });
  });
}

// ===== 主流程：最多 10 个订阅，兼容大小写参数 =====
(async () => {
  const panels = [];

  for (let i = 1; i <= 10; i++) {
    const url = pickArg(`url${i}`, `URL${i}`);
    if (!url) continue;

    const title = pickArg(`title${i}`, `Title${i}`);
    const resetRaw = pickArg(`resetDay${i}`, `ResetDay${i}`);
    const resetDay = resetRaw ? parseInt(resetRaw) : null;

    const content = await fetchInfo(url, Number.isInteger(resetDay) ? resetDay : null);
    panels.push(title ? `机场：${title}\n${content}` : content);
  }

  $done({
    title: "订阅流量",
    content: panels.length ? panels.join("\n\n") : "未配置订阅参数",
    icon: "antenna.radiowaves.left.and.right.circle.fill",
    "icon-color": "#00E28F"
  });
})();
