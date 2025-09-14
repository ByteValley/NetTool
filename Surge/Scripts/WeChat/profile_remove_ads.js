// wechat_profile_remove_ads.js
// 功能：删除订阅号流/看一看里的广告字段，避免出现广告卡片
(function () {
  try {
    let body = $response.body || "";
    if (!body.trim().startsWith("{")) return $done({});

    let data = JSON.parse(body);
    const adKeys = ["advertisement_info", "ad_render_data", "ad_list", "ad_info", "ad_content", "ad_data"];

    const deepClean = (obj) => {
      if (Array.isArray(obj)) {
        return obj.filter(item => !(item && (item.is_ad || item.advertisement_info))).map(deepClean);
      }
      if (obj && typeof obj === "object") {
        for (let k of Object.keys(obj)) {
          if (adKeys.includes(k)) {
            delete obj[k];
          } else {
            obj[k] = deepClean(obj[k]);
          }
        }
      }
      return obj;
    };

    data = deepClean(data);
    $done({ body: JSON.stringify(data) });
  } catch (e) {
    $done({});
  }
})();
