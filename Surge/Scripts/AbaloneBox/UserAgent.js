/*
 * 脚本功能: 替换 HTTP 请求的 User-Agent
 * 作者: AI Assistant
 * 更新时间: 2025年9月10日
 */

const userAgentKey = 'User-Agent';
let userAgentValue = '';

// 检查是否为请求阶段
if (typeof $request !== 'undefined' && $request.headers) {

  // 尝试从 argument 中获取 userAgent 的值
  try {
    if (typeof $argument === 'string') {
      const decodedArg = decodeURIComponent($argument);
      // Surge 的 argument 格式通常是 key=value
      const match = decodedArg.match(/userAgent=(.*)/);
      if (match && match[1]) {
        userAgentValue = match[1];
      }
    } else if (typeof $argument === 'object') {
      // 兼容某些工具将 argument 解析为对象的情况
      userAgentValue = $argument.userAgent || '';
    }
  } catch (e) {
    console.log('[UserAgent.js] 获取 argument 失败:', e.message);
  }

  // 如果成功获取到值
  if (userAgentValue) {
    const headers = $request.headers;
    let oldUserAgent = headers[userAgentKey] || headers[userAgentKey.toLowerCase()];

    // 移除旧的 User-Agent 头（不区分大小写）
    delete headers[userAgentKey];
    delete headers[userAgentKey.toLowerCase()];

    // 添加新的 User-Agent 头
    headers[userAgentKey] = userAgentValue;

    // 记录日志，方便调试
    console.log(`[UserAgent.js] 替换 User-Agent: "${oldUserAgent}" => "${userAgentValue}"`);

    // 完成并返回修改后的请求头
    $done({ headers });
  } else {
    // 未能获取到值，不做任何修改
    console.log('[UserAgent.js] 未传入 User-Agent 参数，请求未修改');
    $done({});
  }

} else {
  // 如果不是请求阶段，直接结束
  $done({});
}
