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
function getResetDaysLeft(resetDay) {
  if (!resetDay) return null;
  const today = new Date();
  const nowDay = today.getDate();
  const nowMonth = today.getMonth();
  const nowYear = today.getFullYear();
  let resetDate;
  if (nowDay < resetDay) resetDate = new Date(nowYear, nowMonth, resetDay);
  else resetDate = new Date(nowYear, nowMonth + 1, resetDay);
  const diff = Math.ceil((resetDate - today) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

// ===== 参数解析 =====
const args = {};
($argument || "").split("&").forEach(p => {
  const idx = p.indexOf("=");
  if (idx === -1) return;
  const key = p.substring(0, idx);
  const value = p.substring(idx + 1);
  args[key] = decodeURIComponent(value);
});
function getArg(lower, upper) {
  return args[lower] ?? args[upper] ?? null;
}

// ===== 机场图标与颜色映射 =====
const iconMap = {
  snpt: { icon: "bandage.fill", color: "#FF9500" },
  ktmiepl: { icon: "waveform.path.ecg", color: "#FF7F00" },
  ktmcloud: { icon: "atom", color: "#FF3B30" },
  cornsscloud: { icon: "waveform", color: "#30D158" },
  aladdinnetwork: { icon: "network", color: "#007AFF" },
};

// ===== 拉取机场信息 =====
function fetchInfo(url, resetDay, title) {
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
      const resetLeft = getResetDaysLeft(resetDay);

      // 到期时间逻辑
      let expireMs;
      if (data.expire) {
        let exp = Number(data.expire);
        if (/^\d+$/.test(data.expire)) {
          if (exp < 10_000_000_000) exp *= 1000; // 秒转毫秒
        }
        expireMs = exp;
      } else {
        expireMs = new Date("2099-12-31T00:00:00Z").getTime();
      }
      const expireStr = formatDate(expireMs);

      // 构建内容
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
      const titleLine = `${title} | ${bytesToSize(total)} | ${timeStr}`;
      const usedLine = `已用：${toPercent(used, total)} ➟ ${bytesToSize(used)}`;
      const remainLine = `剩余：${toReversePercent(used, total)} ➟ ${bytesToSize(remain)}`;
      const resetLine = `重置：${resetLeft !== null ? resetLeft : 0}天 | 到期：${expireStr}`;

      resolve([titleLine, usedLine, remainLine, resetLine].join("\n"));
    });
  });
}

// ===== 主流程 =====
(async () => {
  const defaultIcon = "antenna.radiowaves.left.and.right.circle.fill";
  const defaultColor = "#00E28F";
  const panels = [];

  for (let i = 1; i <= 10; i++) {
    const url = getArg(`url${i}`, `URL${i}`);
    if (!url) continue;

    const title = getArg(`title${i}`, `Title${i}`) || `机场${i}`;
    const reset = getArg(`resetDay${i}`, `ResetDay${i}`);
    const resetDay = reset ? parseInt(reset) : null;

    const customIcon = getArg(`icon${i}`, `Icon${i}`);
    const customColor = getArg(`iconColor${i}`, `IconColor${i}`);

    const key = title.toLowerCase();
    const autoIcon = iconMap[key]?.icon || defaultIcon;
    const autoColor = iconMap[key]?.color || defaultColor;

    const icon = customIcon || autoIcon;
    const color = customColor || autoColor;

    const content = await fetchInfo(url, resetDay, title);
    panels.push({
      title,
      content,
      icon,
      iconColor: color
    });
  }

  if (panels.length === 1) {
    $done(panels[0]);
  } else {
    const contentAll = panels.map(p => p.content).join("\n\n");
    $done({
      title: "订阅流量",
      content: contentAll,
      icon: defaultIcon,
      iconColor: defaultColor
    });
  }
})();
