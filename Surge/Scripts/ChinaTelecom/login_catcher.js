/*
 * 名称：电信登录地址抓取 + 捕获结果弹窗
 * 作用：从 e.dlife.cn 的登录跳转中提取 loginUrl，写入 BoxJS 键 yy_10000.china_telecom_loginUrl，并弹窗提示
 * 适配：Surge / Loon / Egern / Quantumult X（type=http-request）
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

    // ——— 优先：query 里的 loginUrl=xxx ———
    const qMatch = dec.match(/[?&]loginUrl=([^&]+)/);
    if (qMatch && qMatch[1]) {
      loginUrl = safeDecode(qMatch[1]);
    }

    // ——— 其次：整串里出现 &sign=，取 &sign= 之前的 http(s) 开头那段 ———
    if (!loginUrl) {
      const signMatch = dec.match(/(https?:\/\/.+?)&sign=/);
      if (signMatch && signMatch[1]) loginUrl = signMatch[1];
    }

    // ——— 兜底：抓第一个 http(s):// 开头的片段 ———
    if (!loginUrl) {
      const httpOnly = dec.match(/https?:\/\/[^\s"']+/);
      if (httpOnly && httpOnly[0]) loginUrl = httpOnly[0];
    }

    if (!loginUrl) {
      toast('未在URL中解析到登录地址', dec);
      return $done({});
    }

    // 写入 BoxJS 键（组件侧以 @yy_10000.china_telecom_loginUrl 引用）
    const BOX_KEY = 'yy_10000.china_telecom_loginUrl';
    setVal(BOX_KEY, loginUrl);

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

  // ——— 工具函数 ———
  function safeDecode(s) {
    try { return decodeURIComponent(s.replace(/\+/g, '%20')); } catch (_) { return s; }
  }

  // 跨平台持久化：Surge/Loon → QX → Egern（两种签名） → localStorage
  function setVal(k, v) {
    // Surge / Loon
    try {
      if (typeof $persistentStore !== 'undefined' && $persistentStore.write) {
        $persistentStore.write(String(v), String(k));
        return;
      }
    } catch (_) {}

    // Quantumult X
    try {
      if (typeof $prefs !== 'undefined' && $prefs.setValueForKey) {
        $prefs.setValueForKey(String(v), String(k));
        return;
      }
    } catch (_) {}

    // Egern：写法一
    try {
      if (typeof $storage !== 'undefined' && typeof $storage.set === 'function') {
        $storage.set({ key: String(k), value: String(v) });
        return;
      }
    } catch (_) {}

    // Egern：写法二（有些版本支持 set(k, v)）
    try {
      if (typeof $storage !== 'undefined' && typeof $storage.set === 'function') {
        $storage.set(String(k), String(v));
        return;
      }
    } catch (_) {}

    // 兜底（通常不会用到）
    try {
      if (typeof localStorage !== 'undefined' && localStorage.setItem) {
        localStorage.setItem(String(k), String(v));
        return;
      }
    } catch (_) {}

    // 实在不行，打日志但不抛错
    console.log('[电信登录地址] 持久化失败：未检测到可用存储 API');
  }

  // 复制到剪贴板（兼容多平台）
  function setClipboard(text) {
    try {
      if (typeof $clipboard !== 'undefined') {
        // QX：$clipboard.text；Loon/Egern：$clipboard.set
        if (typeof $clipboard.set === 'function') {
          $clipboard.set(String(text));
          return;
        }
        if ('text' in $clipboard) {
          $clipboard.text = String(text);
          return;
        }
      }
    } catch (_) {}
    // 不能复制就忽略，不影响主流程
  }

  // 统一通知（支持 open-url/url）
  function toast(subtitle, body, openUrl) {
    const title = '电信登录地址';
    // QX / 旧 Surge/Loon
    if (typeof $notify !== 'undefined') {
      try { $notify(title, subtitle || '', body || ''); } catch (_) {}
    }
    // Surge / Loon 新式
    if (typeof $notification !== 'undefined' && $notification.post) {
      try {
        const opts = {};
        if (openUrl) { opts['open-url'] = openUrl; opts['url'] = openUrl; }
        $notification.post(title, subtitle || '', body || '', opts);
      } catch (_) {}
    }
    // 控制台兜底
    if (typeof $notify === 'undefined' && typeof $notification === 'undefined' && typeof console !== 'undefined') {
      console.log(`[${title}] ${subtitle || ''} ${body || ''}`);
    }
  }
})();
