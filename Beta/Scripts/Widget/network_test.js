// 网络测速小组件 (Speedtest Pro 极简无瑕版)
// 逻辑：10MB 稳定样本 + 内存安全模式
// 修正：彻底删除“测速状态”文本，回归极简视觉

export default async function (ctx) {
  const mb = 10; 
  const bytes = Math.round(mb * 1024 * 1024);

  let speedMBs = "--";
  let speedMbps = "--";
  let ping = "--";
  let duration = "--";
  let usedData = "--"; 
  let timeLabel = "--";
  let nodeIp = "获取中...";
  let nodeLocation = "";
  
  // 初始 UI 配置 (等待状态)
  let gradientColors = ["#374151", "#111827"]; 
  let pillText = "READY | 等待";

  try {
    // 1. 获取节点信息
    const traceResp = await ctx.http.get("https://speed.cloudflare.com/cdn-cgi/trace", { timeout: 3000 });
    const traceText = await traceResp.text();
    const ipMatch = traceText.match(/ip=(.*)/);
    const locMatch = traceText.match(/loc=(.*)/);
    nodeIp = ipMatch ? ipMatch[1] : "未知IP";
    nodeLocation = locMatch ? ` (${locMatch[1].toUpperCase()})` : "";

    // 2. 延迟测试
    const pingStart = Date.now();
    await ctx.http.get("https://www.speedtest.net/generate_204", { timeout: 5000 });
    const pingEnd = Date.now();
    const rawPing = pingEnd - pingStart;

    // 3. 下载测速 (10MB)
    const dlStart = Date.now();
    const dlResp = await ctx.http.get(
      `https://speed.cloudflare.com/__down?bytes=${bytes}&_=${Date.now()}`,
      { timeout: 15000 } 
    );
    const contentLength = dlResp.headers["Content-Length"] || dlResp.headers["content-length"];
    const actualBytes = contentLength ? parseInt(contentLength) : bytes;
    await dlResp.arrayBuffer(); 

    const dlEnd = Date.now();
    const dlDuration = (dlEnd - dlStart) / 1000;
    const rawMBs = mb / dlDuration;
    const rawMbps = rawMBs * 8;

    speedMBs = rawMBs.toFixed(2);
    speedMbps = rawMbps.toFixed(1);
    ping = rawPing;
    duration = dlDuration.toFixed(2);
    usedData = (actualBytes / (1024 * 1024)).toFixed(1) + "MB";

    // 4. 等级判定与动态背景
    if (rawMbps >= 1000) {
      pillText = "24K | INFINITY";
      gradientColors = ["#1F2937", "#B45309"];
    } else if (rawMbps >= 500) {
      pillText = "16K | MONSTER";
      gradientColors = ["#4C1D95", "#2E1065"];
    } else if (rawMbps >= 200) {
      pillText = "8K | EXTREME";
      gradientColors = ["#065F46", "#064E3B"];
    } else if (rawMbps >= 80) {
      pillText = "4K | ULTRA";
      gradientColors = ["#1E3A8A", "#172554"];
    } else if (rawMbps >= 30) {
      pillText = "2K | QHD";
      gradientColors = ["#92400E", "#451A03"];
    } else {
      pillText = "HD | STABLE";
      gradientColors = ["#7F1D1D", "#450A0A"];
    }

    timeLabel = new Date().toTimeString().slice(0, 8);
  } catch (e) {
    pillText = "TIMEOUT | 超时";
    gradientColors = ["#1C1C1E", "#000000"];
  }

  const statItem = (value, label) => ({
    type: "stack",
    direction: "column",
    gap: 2,
    children: [
      { type: "text", text: value, font: { size: 10, weight: "bold" }, textColor: "#FFFFFF" },
      { type: "text", text: label, font: { size: 9, weight: "medium" }, textColor: "#FFFFFF80" },
    ],
  });

    return {
    type: "widget",
    padding: [16, 16, 16, 16],
    backgroundColor: "transparent",   // ← 改这里
    children: [
      // 第一层：标题与药丸描述
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        children: [
          { type: "text", text: "Speedtest Pro", font: { size: 14, weight: "heavy" }, textColor: "#FFFFFF" },
          { type: "spacer" },
          {
            type: "stack",
            direction: "row",
            padding: [4, 12, 4, 12],
            background: "#00000045",
            cornerRadius: 12,
            children: [
              { type: "text", text: pillText, font: { size: 10, weight: "heavy" }, textColor: "#FFFFFF" },
            ],
          },
        ],
      },
      
      // 第二层：IP 药丸
      {
        type: "stack",
        direction: "row",
        padding: [4, 0, 0, 0],
        children: [
          {
            type: "stack",
            direction: "row",
            padding: [2, 8, 2, 8],
            background: "#FFFFFF15",
            cornerRadius: 8,
            children: [
              { type: "text", text: `${nodeIp}${nodeLocation}`, font: { size: 8, weight: "bold" }, textColor: "#FFFFFFCC" },
            ],
          },
        ],
      },

      { type: "spacer" },

      // 第三层：主速度显示
      {
        type: "stack",
        direction: "row",
        alignItems: "end",
        gap: 4,
        children: [
          { type: "text", text: `${speedMBs}`, font: { size: 48, weight: "thin" }, textColor: "#FFFFFF" },
          {
            type: "stack",
            direction: "column",
            alignItems: "start",
            padding: [0, 0, 11, 0],
            children: [
              { type: "text", text: "MB/s", font: { size: 13, weight: "bold" }, textColor: "#FFFFFF" },
              { type: "text", text: `${speedMbps} Mbps`, font: { size: 10, weight: "medium" }, textColor: "#FFFFFF80" },
            ],
          },
        ],
      },

      { type: "spacer" },

      // 第四层：底部参数
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        children: [
          statItem(ping !== "--" ? `${ping}ms` : "--", "延迟"),
          { type: "spacer" },
          statItem(duration !== "--" ? `${duration}s` : "--", "耗时"),
          { type: "spacer" },
          statItem(usedData, "流量"),
          { type: "spacer" },
          statItem(timeLabel, "刷新"),
        ],
      },
    ],
  };
}
