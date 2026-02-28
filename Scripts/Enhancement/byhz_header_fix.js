/*
 * 脚本功能：鲍鱼盒子
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
const token = "bearer 33debe0063bb6a599e5c6b360dc782c1"; 

let headers = { ...$request.headers };

// 遍历所有 header，找到 authorization 并替换
for (let key in headers) {
    if (key.toLowerCase() === 'authorization') {
        headers[key] = token;
    }
}

// 针对你抓包看到的那个 IP 服务器，额外确保 Host 正确
if ($request.url.includes('211.154.21.150')) {
    headers['Host'] = '211.154.21.150:8020';
}

$done({ headers: headers });
