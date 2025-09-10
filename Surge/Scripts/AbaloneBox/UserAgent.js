/*
 * 脚本功能：鲍鱼盒子18+，支持外部参数传递token
 * 脚本作者：基于@WeiGiegie脚本解密重写
 * 更新时间：2025年9月10日
 * 电报频道：https://t.me/GieGie777
 * 使用声明：此脚本仅供学习与交流，请在下载使用24小时内删除！
 *
 * 配置文件示例：
 * [Script]
 * # 鲍鱼盒子增强
 * 鲍鱼盒子增强 = type=http-request, pattern=^https?:\/\/.+\/api\/(video\/report_item?|live\/room\/detail?|video\/related?|video\/detail|socialposts_info|my\/profile), script-path=https://raw.githubusercontent.com/你的用户名/你的仓库/path/to/DecryptedScript.js, argument=token=baoyuvip
 *
 */

// 仅处理请求阶段
if (typeof $response !== 'undefined') {
  $done({});
  return;
}

// 默认值，如果未从参数中获取到
let token = '';

try {
  // 兼容 $argument 是字符串或对象的情况
  if (typeof $argument === 'string') {
    // 解析如 "token=baoyuvip" 的字符串
    const params = new URLSearchParams($argument.replace(/;/g, '&'));
    token = params.get('token');
  } else if ($argument && typeof $argument === 'object') {
    token = $argument.token || '';
  }
} catch (e) {
  console.log('[byhz] 解析 argument 失败:', e.message);
}

// 如果没有获取到 token，则使用一个默认值（可以根据需要修改）
if (!token) {
  token = 'baoyuvip';
  console.log('[byhz] 未从参数获取到token，使用默认值');
}

// 准备修改请求头
const headers = $request.headers;
const outHeaders = {};

// 复制所有现有请求头，并确保 Authorization 头是唯一的
for (let key in headers) {
  if (Object.prototype.hasOwnProperty.call(headers, key)) {
    // 如果存在，移除旧的 Authorization 头
    if (key.toLowerCase() === 'authorization') {
      continue;
    }
    outHeaders[key] = headers[key];
  }
}

// 设置新的 Authorization 请求头，格式为 Bearer + token
outHeaders['Authorization'] = `${token}`;

console.log(`[byhz] 成功替换Authorization: Bearer ${token}`);

// 完成并返回修改后的请求
$done({
  headers: outHeaders
});
