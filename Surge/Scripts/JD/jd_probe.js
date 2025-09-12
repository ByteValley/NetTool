// jd_probe.js
(() => {
  try {
    const u = ($request && $request.url) || "";
    const b = ($request && $request.body) || "";
    if (!u) return $done({});
    // 慢慢买 token 捕获提示
    if (/apapia-sqk-weblogic\.manmanbuy\.com\/baoliao\/center\/menu$/.test(u)) {
      let dev = "";
      try { const p = new URLSearchParams(b||""); dev = p.get("c_mmbDevId") || ""; } catch {}
      $notification.post("探针 | 慢慢买接口命中", dev ? `捕获 c_mmbDevId：${dev}` : "未解析到 c_mmbDevId", b ? b.slice(0,160) : "");
      return $done({});
    }
    // JD 商品页命中提示
    $notification.post("探针 | JD 商品页命中", "", u);
    $done({});
  } catch (e) { $done({}); }
})();
