/*
 * 名称：中国移动登录地址抓取（通用版，含弹窗）
 * 作用：从 10086 相关登录跳转中提取最终登录/回跳地址，写入 BoxJS 键 yy_10086.china_mobile_loginUrl
 * 适配：Surge / Loon / Egern（type=http-request）
 * 作者：ByteValley & ChatGPT
 */

(function () {
  try {
    if (typeof $request === 'undefined' || !$request.url) {
      toast('未获取到请求对象或URL');
      return $done({});
    }

    const raw = $request.url;
    const dec = multiDecode(raw, 3);
    let loginUrl = '';

    // 1) 优先：从 query 里常见的回跳/登录参数取值
    const KEY_CANDIDATES = [
      'loginUrl', 'backUrl', 'backurl', 'redirectURL', 'redirectUrl',
      'returnUrl', 'targetUrl', 'service', 'continue', 'url'
    ];
    for (const k of KEY_CANDIDATES) {
      const m = dec.match(new RegExp(`[?&]${k}=([^&#]+)`,'i'));
      if (m && m[1]) {
        loginUrl = multiDecode(m[1], 3);
        // 有些站会把整段塞入 base64
        const b64 = tryBase64(loginUrl);
        if (b64) loginUrl = b64;
        break;
      }
    }

    // 2) 其次：遇到 &ticket= / &token= / &sign= 等，取其之前的 http(s) 段
    if (!loginUrl) {
      const m = dec.match(/(https?:\/\/.+?)(?:&(ticket|token|sign|auth|code)=)/i);
      if (m && m[1]) loginUrl = m[1];
    }

    // 3) 兜底：全串里抓第一段 http(s) URL
    if (!loginUrl) {
      const m = dec.match(/https?:\/\/[^\s]+/i);
      if (m && m[0]) loginUrl = m[0];
    }

    if (!loginUrl) {
      toast('未解析到登录地址', dec);
      return $done({});
    }

    // 写入 BoxJS 键（组件侧可用 @yy_10086.china_mobile_loginUrl 引用）
    setVal('yy_10086.china_mobile_loginUrl', loginUrl);

    // 复制到剪贴板
    setClipboard(loginUrl);

    console.log('[中国移动登录地址] 已写入：' + loginUrl);
    toast('捕获成功（已复制）', loginUrl, loginUrl);

    return $done({});

  } catch (e) {
    const msg = (e && e.stack) || String(e);
    console.log('[中国移动登录地址] 异常：' + msg);
    toast('脚本异常', msg);
    return $done({});
  }

  // —— 工具函数 —— //
  function multiDecode(s, times = 2) {
    let t = s;
    for (let i = 0; i < times; i++) {
      try {
        const d = decodeURIComponent(t);
        if (d === t) break;
        t = d;
      } catch (_) { break; }
    }
    return t;
  }

  function tryBase64(s) {
    try {
      // 仅当看起来像 base64 的时候再尝试，避免误解码
      if (/^[A-Za-z0-9+/=]{8,}$/.test(s)) {
        const data = Data.fromBase64String(s);
        if (data) {
          const str = data.toRawString();
          // 若解出也是 URL，返回它
          if (/^https?:\/\//i.test(str)) return str;
        }
      }
    } catch (_) {}
    return '';
  }

  function setVal(k, v) {
    if (typeof $prefs !== 'undefined' && $prefs.setValueForKey) {
      // Surge / Loon
      $prefs.setValueForKey(v, k);
    } else if (typeof $storage !== 'undefined' && $storage.set) {
      // Egern
      $storage.set({ key: k, value: v });
    } else if (typeof localStorage !== 'undefined') {
      // 兜底（一般用不到）
      localStorage.setItem(k, v);
    }
  }

  // 复制到剪贴板（兼容多平台）
  function setClipboard(text) {
    try {
      if (typeof $clipboard !== 'undefined' && $clipboard.set) {
        $clipboard.set(text);         // Loon / Egern
      } else if (typeof $clipboard !== 'undefined' && 'text' in $clipboard) {
        $clipboard.text = text;       // 某些 Surge 环境
      }
    } catch (_) {}
  }

  // 统一通知（带 open-url/url，适配多平台）
  function toast(subtitle, body, openUrl) {
    const title = '中国移动登录地址';
    if (typeof $notify !== 'undefined') {
      try { $notify(title, subtitle || '', body || ''); } catch (_) {}
    }
    if (typeof $notification !== 'undefined' && $notification.post) {
      try {
        const opts = {};
        if (openUrl) { opts['open-url'] = openUrl; opts['url'] = openUrl; }
        $notification.post(title, subtitle || '', body || '', opts);
      } catch (_) {}
    }
    if (typeof $notify === 'undefined' && typeof $notification === 'undefined' && typeof console !== 'undefined') {
      console.log(`[${title}] ${subtitle || ''} ${body || ''}`);
    }
  }
})();
