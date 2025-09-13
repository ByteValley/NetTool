/* JD Price (clean) – token/popup/render unified, no Unicode dashes */
(function () {
  var APP = "京东比价";
  var SECRET = "3E41D1331F5DDAFCD0A38FE2D52FF66F";
  var KEY_BODY = "manmanbuy_val";   // 原始 body（含 c_mmbDevId）
  var KEY_DEVID = "慢慢买CK";       // 直接保存 c_mmbDevId
  var DEBUG = false;                // 调试开关：true 会额外弹通知

  function notify(t, s, b, ext) {
    try {
      if (typeof $notify === "function") $notify(t || "", s || "", b || "", ext || {});
      else if (typeof $notification !== "undefined") $notification.post(t || "", s || "", b || "", ext || {});
    } catch (_) {}
  }
  function done(v) { try { $done(v || {}); } catch (_) {} }
  function getval(k) { try { return (typeof $prefs !== "undefined") ? $prefs.valueForKey(k) : $persistentStore.read(k); } catch (_) { return null; } }
  function setval(k, v) { try { return (typeof $prefs !== "undefined") ? $prefs.setValueForKey(v, k) : $persistentStore.write(v, k); } catch (_) { return false; } }
  function argObj(a) { var o = {}; if (!a) return o; String(a).split(/[&;,]/).forEach(function (kv) { var i = kv.indexOf("="); if (i === -1) return; o[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); }); return o; }
  var ARG = argObj(typeof $argument === "string" ? $argument : "");
  var MODE = (ARG.mode || "").toLowerCase();
  var REQ_URL = ($request && $request.url) || "";
  function dbg(msg) { if (DEBUG) notify(APP + " · 调试", "", String(msg)); }

  if (typeof Promise.withResolvers !== "function") {
    Promise.withResolvers = function () {
      var resolve, reject;
      var promise = new Promise(function (res, rej) { resolve = res; reject = rej; });
      return { promise: promise, resolve: resolve, reject: reject };
    };
  }

  function intCryptoJS() {
    if (typeof CryptoJS !== "undefined" && CryptoJS.MD5) return;
    /* 仅注入 MD5（删去多余注释与奇字符，避免“—”） */
    CryptoJS = function (t, r) {
      var n, e = function () { throw new Error("no crypto"); }, i = Object.create || function () { function t() {} return function (r) { t.prototype = r; var n = new t(); t.prototype = null; return n; }; }(), o = {}, a = o.lib = {}, s = a.Base = { extend: function (t) { var r = i(this); return t && r.mixIn(t), r.hasOwnProperty("init") && this.init !== r.init || (r.init = function () { r.$super.init.apply(this, arguments); }), r.init.prototype = r, r.$super = this, r }, create: function () { var t = this.extend(); return t.init.apply(t, arguments), t }, init: function () { }, mixIn: function (t) { for (var r in t) t.hasOwnProperty(r) && (this[r] = t[r]); t.hasOwnProperty("toString") && (this.toString = t.toString) }, clone: function () { return this.init.prototype.extend(this) } }, c = a.WordArray = s.extend({ init: function (t, r) { t = this.words = t || [], this.sigBytes = null != r ? r : 4 * t.length }, toString: function (t) { return (t || f).stringify(this) } }), u = o.enc = {}, f = u.Hex = { stringify: function (t) { for (var r = t.words, n = t.sigBytes, e = [], i = 0; i < n; i++) { var o = r[i >>> 2] >>> 24 - i % 4 * 8 & 255; e.push((o >>> 4).toString(16)), e.push((15 & o).toString(16)) } return e.join("") } }, h = u.Latin1 = { parse: function (t) { for (var r = t.length, n = [], e = 0; e < r; e++) n[e >>> 2] |= (255 & t.charCodeAt(e)) << 24 - e % 4 * 8; return new c.init(n, r) } }, p = u.Utf8 = { parse: function (t) { return h.parse(unescape(encodeURIComponent(t))) } }, d = a.BufferedBlockAlgorithm = s.extend({ reset: function () { this._data = new c.init, this._nDataBytes = 0 }, _append: function (t) { "string" == typeof t && (t = p.parse(t)), this._data.concat(t), this._nDataBytes += t.sigBytes }, _process: function (t) { var r, n = this._data, e = n.words, i = n.sigBytes, o = this.blockSize, a = i / (4 * o), s = (t = t ? Math.ceil(a) : Math.max((0 | a) - this._minBufferSize, 0)) * o, c = Math.min(4 * s, i); if (s) { for (var u = 0; u < s; u += o) this._doProcessBlock(e, u); r = e.splice(0, s), n.sigBytes -= c } return new c.init(r, c) }, _minBufferSize: 0 }), l = (a.Hasher = d.extend({ cfg: s.extend(), init: function (t) { this.cfg = this.cfg.extend(t), this.reset() }, reset: function () { d.reset.call(this), this._doReset() }, update: function (t) { return this._append(t), this._process(), this }, finalize: function (t) { return t && this._append(t), this._doFinalize() }, blockSize: 16, _createHelper: function (t) { return function (r, n) { return new t.init(n).finalize(r) } } }), o.algo = {});
      (function () {
        var t = o.algo, r = l.extend({ _doReset: function () { this._hash = new c.init([1732584193, 4023233417, 2562383102, 271733878]) }, _doProcessBlock: function (t, r) { function n(t, r, n, e, i, o, a) { var s = t + (r & n | ~r & e) + i + a; return (s << o | s >>> 32 - o) + r } function e(t, r, n, e, i, o, a) { var s = t + (r & e | n & ~e) + i + a; return (s << o | s >>> 32 - o) + r } function i(t, r, n, e, i, o, a) { var s = t + (r ^ n ^ e) + i + a; return (s << o | s >>> 32 - o) + r } function a(t, r, n, e, i, o, a) { var s = t + (n ^ (r | ~e)) + i + a; return (s << o | s >>> 32 - o) + r } for (var s = 0; s < 16; s++) { var c = r + s, u = t[c]; t[c] = 16711935 & (u << 8 | u >>> 24) | 4278255360 & (u << 24 | u >>> 8) } var f = this._hash.words, h = t[r + 0], p = t[r + 1], d = t[r + 2], l = t[r + 3], y = t[r + 4], v = t[r + 5], g = t[r + 6], w = t[r + 7], _ = t[r + 8], m = t[r + 9], B = t[r + 10], b = t[r + 11], C = t[r + 12], S = t[r + 13], x = t[r + 14], A = t[r + 15], H = f[0], z = f[1], M = f[2], D = f[3]; H = n(H, z, M, D, h, 7, -680876936); D = n(D, H, z, M, p, 12, -389564586); M = n(M, D, H, z, d, 17, 606105819); z = n(z, M, D, H, l, 22, -1044525330); H = n(H, z, M, D, y, 7, -176418897); D = n(D, H, z, M, v, 12, 1200080426); M = n(M, D, H, z, g, 17, -1473231341); z = n(z, M, D, H, w, 22, -45705983); H = n(H, z, M, D, _, 7, 1770035416); D = n(D, H, z, M, m, 12, -1958414417); M = n(M, D, H, z, B, 17, -42063); z = n(z, M, D, H, b, 22, -1990404162); H = n(H, z, M, D, C, 7, 1804603682); D = n(D, H, z, M, S, 12, -40341101); M = n(M, D, H, z, x, 17, -1502002290); z = n(z, M, D, H, A, 22, 1236535329); H = e(H, z, M, D, p, 5, -165796510); D = e(D, H, z, M, g, 9, -1069501632); M = e(M, D, H, z, b, 14, 643717713); z = e(z, M, D, H, h, 20, -373897302); H = e(H, z, M, D, v, 5, -701558691); D = e(D, H, z, M, B, 9, 38016083); M = e(M, D, H, z, A, 14, -660478335); z = e(z, M, D, H, y, 20, -405537848); H = e(H, z, M, D, m, 5, 568446438); D = e(D, H, z, M, x, 9, -1019803690); M = e(M, D, H, z, l, 14, -187363961); z = e(z, M, D, H, _, 20, 1163531501); H = e(H, z, M, D, S, 5, -1444681467); D = e(D, H, z, M, d, 9, -51403784); M = e(M, D, H, z, w, 14, 1735328473); z = e(z, M, D, H, C, 20, -1926607734); H = i(H, z, M, D, v, 4, -378558); D = i(D, H, z, M, _, 11, -2022574463); M = i(M, D, H, z, b, 16, 1839030562); z = i(z, M, D, H, S, 23, -35309556); H = i(H, z, M, D, p, 4, -1530992060); D = i(D, H, z, M, y, 11, 1272893353); M = i(M, D, H, z, w, 16, -155497632); z = i(z, M, D, H, B, 23, -1094730640); H = i(H, z, M, D, m, 4, 681279174); D = i(D, H, z, M, x, 11, -358537222); M = i(M, D, H, z, l, 16, -722521979); z = i(z, M, D, H, C, 23, 76029189); H = i(H, z, M, D, g, 4, -640364487); D = i(D, H, z, M, h, 11, -421815835); M = i(M, D, H, z, A, 16, 530742520); z = i(z, M, D, H, d, 23, -995338651); H = a(H, z, M, D, h, 6, -198630844); D = a(D, H, z, M, w, 10, 1126891415); M = a(M, D, H, z, x, 15, -1416354905); z = a(z, M, D, H, v, 21, -57434055); H = a(H, z, M, D, m, 6, 1700485571); D = a(D, H, z, M, B, 10, -1894986606); M = a(M, D, H, z, d, 15, -1051523); z = a(z, M, D, H, S, 21, -2054922799); H = a(H, z, M, D, p, 6, 1873313359); D = a(D, H, z, M, g, 10, -30611744); M = a(M, D, H, z, b, 15, -1560198380); z = a(z, M, D, H, y, 21, 1309151649); H = (H + f[0]) | 0; f[0] = H; f[1] = (z + f[1]) | 0; f[2] = (M + f[2]) | 0; f[3] = (D + f[3]) | 0 }, _doFinalize: function () { var r = this._data, n = r.words, e = 8 * this._nDataBytes, i = 8 * r.sigBytes; n[i >>> 5] |= 128 << 24 - i % 32; var o = Math.floor(e / 4294967296), a = e; n[15 + (i + 64 >>> 9 << 4)] = (o << 8 | o >>> 24) & 16711935 | (o << 24 | o >>> 8) & 4278255360; n[14 + (i + 64 >>> 9 << 4)] = (a << 8 | a >>> 24) & 16711935 | (a << 24 | a >>> 8) & 4278255360; r.sigBytes = 4 * (n.length + 1); this._process(); return this._hash } });
        o.MD5 = l._createHelper(r);
      })();
      return o;
    }(Math);
  }
  function md5(word) { intCryptoJS(); return CryptoJS.MD5(word).toString(); }

  function http(op, t) {
    var ttl = t || 8;
    var wr = Promise.withResolvers();
    var timer = setTimeout(function () { wr.reject(new Error("timeout")); }, (op.$timeout || ttl * 1000));
    function handle(res) {
      try {
        res.status = res.status || res.statusCode;
        if (res && typeof res.body === "string") {
          res.json = function () { return JSON.parse(res.body); };
        }
      } catch (_) { }
      clearTimeout(timer);
      if (res.error || res.status < 200 || res.status > 307) wr.reject(res.error || new Error("http_error"));
      else wr.resolve(res);
    }
    try { this.$httpClient && this.$httpClient[op.method || "get"](op, function (e, r, b) { handle({ error: e, status: r && (r.status || r.statusCode), headers: r && r.headers, body: b }); }); } catch (_) { }
    try { this.$task && this.$task.fetch(Object.assign({ url: op.url }, op)).then(handle, handle); } catch (_) { }
    return wr.promise;
  }

  function parseQS(q) { var o = {}; (q || "").split("&").forEach(function (p) { var kv = p.split("="); o[decodeURIComponent(kv[0] || "")] = decodeURIComponent(kv[1] || ""); }); return o; }
  function toQS(obj) { return Object.keys(obj).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(obj[k]); }).join("&"); }
  function toCustomStr(obj) { return Object.keys(obj).filter(function (k) { return obj[k] !== "" && k.toLowerCase() !== "token"; }).sort().map(function (k) { return k.toUpperCase() + String(obj[k]).toUpperCase(); }).join(""); }
  function getCk() { var ck = getval(KEY_BODY); if (!ck) { notify(APP, "请先打开【慢慢买】App 的“我的”页", "看到“获取 ck 成功”后再回京东"); return null; } return parseQS(ck).c_mmbDevId || getval(KEY_DEVID); }
  function extractId(u) { var m = u.match(/\/product\/(?:[A-Za-z]+\/)?(\d+)\.html/); if (m && m[1]) return m[1]; m = u.match(/[?&](?:wareId|sku|id)=(\d+)/); if (m && m[1]) return m[1]; m = u.match(/\/(\d+)\.html(?:[#?]|$)/); if (m && m[1]) return m[1]; return null; }

  function requestHistoryPrice(id) {
    var devid = getCk();
    if (!devid) return Promise.reject(new Error("no_devid"));

    var shareBody = { methodName: "trendJava", spbh: "1|" + id, url: "https://item.jd.com/" + id + ".html", t: String(Date.now()), c_appver: "4.8.3.1", c_mmbDevId: devid };
    var tokenStr = encodeURIComponent(SECRET + toCustomStr(shareBody) + SECRET);
    shareBody.token = md5(tokenStr).toUpperCase();

    var headers = { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8", "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 13_1_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 - mmbWebBrowse - ios" };
    var reqShare = { method: "post", url: "https://apapia-history-weblogic.manmanbuy.com/app/share", headers: headers, body: toQS(shareBody) };

    function buildMultipart(fields) {
      var boundary = "----WebKitFormBoundary" + Math.random().toString(36).slice(2);
      var body = "";
      Object.keys(fields).forEach(function (k) { body += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + k + "\"\r\n\r\n" + (fields[k] || "") + "\r\n"; });
      body += "--" + boundary + "--\r\n";
      return { body: body, boundary: boundary };
    }

    return http(reqShare).then(function (res) {
      var j = res.json();
      if (!j || j.code !== 2000 || !j.data) throw new Error(j && j.msg || "share_error");
      var q = String(j.data).split("?")[1] || "";
      var sp = parseQS(q);
      var fields = { shareId: sp.shareId || "", sign: sp.sign || "", spbh: sp.spbh || "", url: sp.url || "" };
      var mp = buildMultipart(fields);
      return http({ method: "post", url: "https://apapia-history-weblogic.manmanbuy.com/h5/share/trendData", headers: { "content-type": "multipart/form-data; boundary=" + mp.boundary }, body: mp.body });
    }).then(function (res) { return res.json(); });
  }

  function lowerMsg(r) {
    var lp = r && r.priceRemark && r.priceRemark.lowestPrice;
    var ld = r && r.priceRemark && r.priceRemark.lowestDate ? String(r.priceRemark.lowestDate).slice(0, 10) : "";
    return (lp != null) ? ("历史最低:¥" + lp + (ld ? "(" + ld + ")" : "")) : "";
  }
  function summaryText(r) {
    var arr = (r && r.priceRemark && r.priceRemark.ListPriceDetail) || [];
    var nameMap = { "双11价格": "双十一价格", "618价格": "六一八价格", "30天最低价": "三十天最低", "60天最低价": "六十天最低", "180天最低价": "一百八最低" };
    var list = [];
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i]; var nm = (it && it.Name) || ""; if (/历史最高|常购价/.test(nm)) continue;
      var row = { Name: nameMap[nm] || nm, Price: String((it && it.Price) != null ? it.Price : "-"), Date: (it && it.Date) || "", Difference: (it && it.Difference) || "" };
      list.push(row);
    }
    var maxW = 0; for (var j = 0; j < list.length; j++) maxW = Math.max(maxW, list[j].Price.length);
    var out = "";
    for (var k = 0; k < list.length; k++) {
      var it2 = list[k]; if (it2.Price === "-") continue;
      var p = it2.Price; if (p.length < maxW) { p = (p.indexOf(".") >= 0 || p.length + 1 === maxW) ? p : (p + "."); var fill = (p.indexOf(".") >= 0) ? "0" : " "; while (p.length < maxW) p += fill; }
      out += it2.Name + "  " + p + "  " + it2.Date + "  " + (it2.Difference === "-" ? "" : it2.Difference) + "\n";
    }
    return out.replace(/\n$/, "");
  }

  if (MODE === "token" && /baoliao\/center\/menu/.test(REQ_URL)) {
    try {
      var body = ($request && $request.body) || "";
      setval(KEY_BODY, body);
      var devId = "";
      try {
        if (typeof URLSearchParams === "function") devId = new URLSearchParams(body).get("c_mmbDevId") || "";
        if (!devId) {
          var ps = String(body).split("&");
          for (var i = 0; i < ps.length; i++) { var kv = ps[i].split("="); if (decodeURIComponent(kv[0] || "") === "c_mmbDevId") { devId = decodeURIComponent(kv[1] || ""); break; } }
        }
      } catch (_) { }
      setval(KEY_DEVID, devId || "");
      notify(APP, "获取 ck 成功🎉", devId ? ("c_mmbDevId=" + devId) : body.slice(0, 220));
    } catch (e) {
      notify(APP + " | 获取token异常", "", String((e && e.message) || e));
    }
    return done({});
  }

  if (MODE === "popup" && typeof $response === "undefined") {
    (async function () {
      try {
        var id = extractId(REQ_URL);
        if (!id) { dbg("未识别到商品ID"); return done({}); }
        var data = await requestHistoryPrice(id);
        if (data && data.ok === 1) {
          var r = data.result || {};
          var title = (r.trendData && r.trendData.title) || ("商品 " + id);
          var tip = ((r.priceRemark && r.priceRemark.Tip) || "") + "（仅供参考）";
          var lower = lowerMsg(r);
          var detail = summaryText(r);
          notify(title, lower + " " + tip, detail, { "open-url": "https://item.jd.com/" + id + ".html", "update-pasteboard": detail });
        } else if (data && data.ok === 0 && data.msg) {
          notify("比价结果", "", "慢慢买提示您：" + data.msg);
        } else {
          notify(APP + " | 接口异常", "", "返回结构无效");
        }
      } catch (e) {
        notify(APP + " | 接口异常", "", String((e && e.message) || e));
      }
      done({});
    })();
    return;
  }

  if (MODE === "render" && typeof $response !== "undefined") {
    (async function () {
      try {
        var id = extractId(REQ_URL);
        if (!id) { dbg("未识别到商品ID"); return $done($response); }
        var data = await requestHistoryPrice(id);
        if (!(data && data.ok === 1)) return $done($response);
        var r = data.result || {};
        var title = (r.trendData && r.trendData.title) || ("商品 " + id);
        var tip = ((r.priceRemark && r.priceRemark.Tip) || "") + "（仅供参考）";
        var lower = lowerMsg(r);

        var rows = "";
        var arr = (r.priceRemark && r.priceRemark.ListPriceDetail) || [];
        var map = { "双11价格": "双十一价格", "618价格": "六一八价格", "30天最低价": "三十天最低", "60天最低价": "六十天最低", "180天最低价": "一百八最低" };
        for (var i = 0; i < arr.length; i++) {
          var it = arr[i]; var nm = (it && it.Name) || ""; if (/历史最高|常购价/.test(nm)) continue;
          rows += "<tr><td>" + (map[nm] || nm || "") + "</td><td>" + (it && it.Price != null ? it.Price : "-") + "</td><td>" + ((it && it.Date) || "") + "</td><td>" + ((it && it.Difference === "-") ? "" : ((it && it.Difference) || "")) + "</td></tr>";
        }
        var tableHtml = rows ? '<table class="jd-price-table"><thead><tr><th>名称</th><th>价格</th><th>日期</th><th>差异</th></tr></thead><tbody>' + rows + '</tbody></table>' : '<div class="jd-price-muted">暂无表格数据</div>';

        var ptsSrc = r.priceTrend || [];
        var pts = [];
        for (var j = 0; j < ptsSrc.length; j++) {
          var val = ptsSrc[j]; var num = Number(val && (val.price != null ? val.price : (val.Price != null ? val.Price : val.p)));
          if (!isNaN(num)) pts.push(num);
        }
        var chartHtml = '<div class="jd-price-muted">暂无折线数据</div>';
        if (pts.length) {
          var W = 320, H = 120, P = 10, xmax = Math.max(1, pts.length - 1);
          var ymin = Infinity, ymax = -Infinity; for (var k = 0; k < pts.length; k++) { ymin = Math.min(ymin, pts[k]); ymax = Math.max(ymax, pts[k]); }
          if (ymin === Infinity) { ymin = 0; ymax = 1; }
          var sx = (W - 2 * P) / xmax, sy = (H - 2 * P) / Math.max(1, (ymax - ymin) || 1);
          var points = ""; for (var m = 0; m < pts.length; m++) { var xx = P + m * sx; var yy = H - P - ((pts[m] - ymin) * sy); points += (m ? "," : "") + xx + "," + yy; }
          chartHtml = '<svg class="jd-price-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"><polyline fill="none" stroke="#007aff" stroke-width="2" points="' + points + '"/></svg>';
        }

        var css = '<style>.jd-price-panel{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,PingFang SC,Helvetica,Arial;line-height:1.35;box-shadow:0 6px 18px rgba(0,0,0,.08);border:1px solid #eee;border-radius:12px;padding:12px 14px;margin:10px 8px;background:#fff}.jd-price-panel h3{font-size:15px;margin:0 0 8px 0}.jd-price-meta{color:#666;font-size:12px;margin-bottom:8px}.jd-price-pre{font-size:12px;background:#fafafa;border:1px dashed #ddd;border-radius:8px;padding:8px;white-space:pre-wrap}.jd-price-table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}.jd-price-table th,.jd-price-table td{border:1px solid #eee;padding:6px 8px;text-align:left}.jd-price-muted{color:#999}.jd-price-chart{width:100%;height:120px;margin-top:6px}</style>';
        var content = "";
        var style = (ARG.style || "line").toLowerCase();
        var lineOnly = String(ARG.line_only || "").toLowerCase() === "true";
        if (style === "table") content = tableHtml;
        else if (style === "raw") content = '<pre class="jd-price-pre">' + summaryText(r).replace(/[&<>]/g, function (s) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[s]; }) + '</pre>';
        else content = (lineOnly ? "" : tableHtml) + chartHtml;

        var panel = css + '<div class="jd-price-panel"><h3>价格趋势</h3><div class="jd-price-meta">' + lower + ' <span class="jd-price-muted">' + tip + '</span></div>' + content + '</div>';
        var html = ($response && $response.body) || "";
        if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, panel + "</body>"); else html = panel + html;
        $done({ body: html });
      } catch (e) {
        try { $done($response); } catch (_) { done({}); }
      }
    })();
    return;
  }

  done({});
})();
