/*
 * 名称：电信登录地址抓取（稳定版）
 * 作用：从 e.dlife.cn 的登录跳转中提取 loginUrl，写入 BoxJS 键 yy_10000.china_telecom_loginUrl
 * 适配：Surge / Loon / Egern（type=http-request）
 * 作者：ByteValley & ChatGPT
 */

(function () {
  try {
    if (typeof $request === 'undefined' || !$request.url) {
      notify('未获取到请求对象或URL');
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
      notify('未在URL中解析到登录地址', dec);
      return $done({});
    }

    // 写入 BoxJS 键（组件侧以 @yy_10000.china_telecom_loginUrl 引用）
    setVal('yy_10000.china_telecom_loginUrl', loginUrl);

    console.log('[电信登录地址] 已写入：' + loginUrl);
    notify('登录地址已更新', loginUrl);

    return $done({});

  } catch (e) {
    console.log('[电信登录地址] 异常：' + (e && e.stack || e));
    notify('脚本异常', String(e));
    return $done({});
  }

  // —— 工具函数 —— //
  function safeDecode(s) {
    try { return decodeURIComponent(s); } catch (_) { return s; }
  }
  function setVal(k, v) {
    if (typeof $prefs !== 'undefined' && $prefs.setValueForKey) {
      $prefs.setValueForKey(v, k); // Surge/Loon
    } else if (typeof $storage !== 'undefined' && $storage.set) {
      $storage.set({ key: k, value: v }); // Egern
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem(k, v); // 兜底
    }
  }
  function notify(title, msg) {
    if (typeof $notify !== 'undefined') {
      $notify('电信登录地址', title || '', msg || '');
    }
  }
})();
