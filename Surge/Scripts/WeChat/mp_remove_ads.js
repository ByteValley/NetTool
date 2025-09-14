// mp_remove_ads.js
// 功能：删除公众号扩展接口里的广告字段，避免文章渲染卡片广告
// 适配：/mp/getappmsgext、/mp/getappmsgad
// 作者：ByteValley & ChatGPT

(function () {
  try {
    const ct = $response?.headers?.["Content-Type"] || $response?.headers?.["content-type"] || "";
    let body = $response.body || "";

    // 仅处理 JSON
    if (!/application\/json/i.test(ct) && !(body.trim().startsWith("{") || body.trim().startsWith("["))) {
      return $done({});
    }

    let json = JSON.parse(body);

    // 常见字段清理（存在即删）
    const deleteKeys = [
      "advertisement_info",       // 广告信息列表
      "ad_render_data",           // 广告渲染数据
      "advertisement_num",        // 广告数量
      "no_remove_ad",             // 广告保留标记
      "exposure_info",            // 广告曝光信息
      "ad_list",                  // 其他广告列表命名
      "ad_info",
      "ad_content",
      "ad_data"
    ];

    // 深度删除工具
    const deepDelete = (obj) => {
      if (!obj || typeof obj !== "object") return;
      if (Array.isArray(obj)) {
        obj.forEach(deepDelete);
        return;
      }
      deleteKeys.forEach(k => { if (k in obj) delete obj[k]; });

      // 微信字段内嵌在 ext / appmsgstat / base_resp 等处
      if (obj.ext_info && typeof obj.ext_info === "object") {
        deleteKeys.forEach(k => { if (k in obj.ext_info) delete obj.ext_info[k]; });
      }
      Object.keys(obj).forEach(key => deepDelete(obj[key]));
    };

    deepDelete(json);

    // 某些返回会把广告计数独立返回，强制置零
    try {
      if (typeof json.advertisement_num === "number") json.advertisement_num = 0;
      if (json.appmsgstat && typeof json.appmsgstat.advertisement_num === "number") {
        json.appmsgstat.advertisement_num = 0;
      }
    } catch (e) {}

    body = JSON.stringify(json);
    $done({ body });
  } catch (e) {
    // 出错回退原文，避免影响正常阅读
    $done({});
  }
})();
