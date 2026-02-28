/*
 * 脚本功能：鲍鱼盒子18+ (最新接口修复版)
 * 更新时间：2026-02-28
 * 修复说明：更新了最新的 Authorization Token 和 URL 签名参数
 *******************************
 [rewrite_local]
 ^https?:\/\/.*\/api\/(video\/report_item|live\/room\/detail|video\/related|video\/detail|socialposts_info|my\/profile) url script-request-header https://raw.githubusercontent.com/WeiGiegie/666/main/byhz.js
 
 [mitm]
 hostname = 211.154.21.150, w1c2.ooat88.com, *api.h8h4h.com, byapi.*.com
 *******************************
 */

// --- 核心配置参数 ---
const config = {
    token: "bearer 33debe0063bb6a599e5c6b360dc782c1",
    auth: "39e27f71ceb410f0f20b9ec66a326ba1",
    once: "6edde49dac38d3e2229a28f6223d8fd8",
    timestamp: "1772292332"
};

let url = $request.url;
let headers = { ...$request.headers };

// 1. 注入 Authorization
let authHeader = Object.keys(headers).find(k => k.toLowerCase() === 'authorization');
headers[authHeader || "Authorization"] = config.token;

// 2. 注入 URL 参数 (auth, once, timestamp)
// 使用 URL 对象更优雅地处理参数，防止正则替换失败
if (url.includes('auth=')) {
    url = url.replace(/auth=[^&]+/, "auth=" + config.auth)
             .replace(/once=[^&]+/, "once=" + config.once)
             .replace(/auth_timestamp_s=[^&]+/, "auth_timestamp_s=" + config.timestamp);
}

// 3. 容错处理：某些接口可能需要特定 Host
if (url.includes('211.154.21.150')) {
    headers['Host'] = '211.154.21.150:8020';
}

$done({ url, headers });
