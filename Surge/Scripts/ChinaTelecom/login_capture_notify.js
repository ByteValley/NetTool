/*
 * 名称：电信登录地址抓取（稳定版）+ 捕获结果弹窗
 * 作用：从 e.dlife.cn 的登录跳转中提取 loginUrl，写入 BoxJS 键 yy_10000.china_telecom_loginUrl，并弹窗提示
 * 适配：Surge / Loon / Egern（type=http-request）
 * 作者：ByteValley
 */

(function () {
  try {
    if (typeof $request === 'undefined' || !$request.url) {
      toast('未获取到请求对象或URL');
      return $done({});
    }

    const raw = $request.url;
    const dec = safeDecode(raw);
    let loginUrl = '';

    // 1) 优先：query 里的 loginUrl=xxx
    const qMatch = dec.match(/[?&]loginUrl=([^&]+)/);
    if (qMatch && qMatch[1]) {
      loginUrl = safeDecode(qMatch[1]);
    }

    // 2) 其次：整串里出现 &sign=，取 &sign= 之前的 http(s) 开头那段
    if (!loginUrl) {
      const signMatch = dec.match(/(https?:\/\/.+?)&sign=/);
      if (signMatch && signMatch[1]) {
        loginUrl = signMatch[1];
      }
    }

    // 3) 兜底：如果本身就是 http(s) 开头的一串
    if (!loginUrl) {
      const httpOnly = dec.match(/https?:\/\/[^\s]+/);
      if (httpOnly && httpOnly[0]) {
        loginUrl = httpOnly[0];
      }
    }

    if (!loginUrl) {
      toast('未在URL中解析到登录地址', dec);
      return $done({});
    }

    // 写入 BoxJS 键（组件侧以 @yy_10000.china_telecom_loginUrl 引用）
    setVal('yy_10000.china_telecom_loginUrl', loginUrl);

    // 复制到剪贴板（多平台兜底）
    setClipboard(loginUrl);

    console.log('[电信登录地址] 已写入：' + loginUrl);
    toast('捕获成功（已复制）', loginUrl, loginUrl);

    return $done({});

  } catch (e) {
    const msg = (e && e.stack) || String(e);
    console.log('[电信登录地址] 异常：' + msg);
    toast('脚本异常', msg);
    return $done({});
  }

  // —— 工具函数 —— //
  function safeDecode(s) {
    try { return decodeURIComponent(s); } catch (_) { return s; }
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
        // Loon / Egern
        $clipboard.set(text);
      } else if (typeof $notification !== 'undefined' && $notification.post) {
        // Surge 无 $clipboard，但有 apps 可通过通知 actions 再打开（这里仍尝试下）
        // 有些环境也内置 $clipboard.text
        if (typeof $clipboard !== 'undefined' && 'text' in $clipboard) $clipboard.text = text;
      }
    } catch (_) {}
  }

  // 统一的通知封装（带 open-url/url，适配多平台；subtitle/body 都可传）
  function toast(subtitle, body, openUrl) {
    const title = '电信登录地址';
    // Surge / Loon (老式)
    if (typeof $notify !== 'undefined') {
      try {
        $notify(title, subtitle || '', body || '');
      } catch (_) {}
    }
    // Surge / Loon 新式（带 options）
    if (typeof $notification !== 'undefined' && $notification.post) {
      try {
        const opts = {};
        if (openUrl) {
          // 尽量兼容
          opts['open-url'] = openUrl;
          opts['url'] = openUrl;
        }
        $notification.post(title, subtitle || '', body || '', opts);
      } catch (_) {}
    }
    // Egern
    if (typeof $notify === 'undefined' && typeof $notification === 'undefined' && typeof console !== 'undefined') {
      console.log(`[${title}] ${subtitle || ''} ${body || ''}`);
    }
  }
})();
