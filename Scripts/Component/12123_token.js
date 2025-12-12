/******************************************
 * @name        交管12123 · Token 抓取
 * @author      ByteValley
 * @description 自动抓取交管12123 authToken，写入 BoxJs
 * @author ByteValley
 *
 * BoxJs订阅地址:
 * https://raw.githubusercontent.com/ByteValley/NetTool/main/BoxJs/ComponentService.boxjs.json
 *
 * 原脚本地址：
 * https://raw.githubusercontent.com/Nanako718/Scripting/main/Quantumult%20X/js/12123_token.js
 *
 * 写入路径：
 * @ComponentService.12123.Settings.token
 ******************************************/

const $ = new Env("交管12123");

const TOKEN_KEY = "@ComponentService.12123.Settings.token";
const DEBUG_KEY = "@ComponentService.12123.Settings.debug";

!(async () => {
  if (typeof $request === "undefined") return $.done();

  const body = $request.body;
  if (!body || !body.includes("sign")) return $.done();

  try {
    const raw = decodeURIComponent(body).replace(/^params=/, "");
    const json = JSON.parse(raw);

    debug(JSON.stringify(json, null, 2));

    // 仅处理订阅接口
    if (json.api !== "biz.user.msg.subscribe") return $.done();
    if (!json.authToken) return $.done();

    const tokenData = {
      authToken: json.authToken,
      accessTime: json.accessTime,
      sign: json.sign,
      appId: json.appId,
      api: json.api,
      updateTime: Date.now(),
    };

    const oldStr = $.getdata(TOKEN_KEY);
    const old = oldStr ? JSON.parse(oldStr) : {};

    if (old.sign === tokenData.sign) return $.done();

    $.setdata(JSON.stringify(tokenData), TOKEN_KEY);

    $.msg(
      $.name,
      "✅ 12123 Token 获取成功",
      "authToken 已写入 BoxJs",
      {
        "media-url":
          "https://raw.githubusercontent.com/Nanako718/Scripting/main/images/12123.png",
      }
    );

    console.log("[12123] Token 写入成功\n" + JSON.stringify(tokenData, null, 2));
  } catch (e) {
    $.logErr(e);
  } finally {
    $.done();
  }
})();

function debug(msg) {
  if ($.getdata(DEBUG_KEY) === "true") {
    console.log("[DEBUG]", msg);
  }
}

/* =======================
 * Env（稳定版）
 * ======================= */
function Env(name) {
  return new (class {
    constructor() {
      this.name = name;
    }

    isSurge() {
      return typeof $httpClient !== "undefined";
    }
    isQuanX() {
      return typeof $task !== "undefined";
    }
    isLoon() {
      return typeof $loon !== "undefined";
    }

    getdata(key) {
      if (!key.startsWith("@")) {
        return this._read(key);
      }
      const [, root, path] = key.match(/^@(.*?)\.(.*)$/);
      const raw = this._read(root);
      if (!raw) return "";
      try {
        return path.split(".").reduce((o, k) => o?.[k], JSON.parse(raw)) ?? "";
      } catch {
        return "";
      }
    }

    setdata(val, key) {
      if (!key.startsWith("@")) {
        return this._write(val, key);
      }
      const [, root, path] = key.match(/^@(.*?)\.(.*)$/);
      let obj = {};
      const raw = this._read(root);
      if (raw) {
        try {
          obj = JSON.parse(raw);
        } catch {}
      }
      const keys = path.split(".");
      let cur = obj;
      for (let i = 0; i < keys.length - 1; i++) {
        if (typeof cur[keys[i]] !== "object") cur[keys[i]] = {};
        cur = cur[keys[i]];
      }
      cur[keys[keys.length - 1]] = JSON.parse(val);
      return this._write(JSON.stringify(obj), root);
    }

    _read(key) {
      if (this.isSurge() || this.isLoon()) return $persistentStore.read(key);
      if (this.isQuanX()) return $prefs.valueForKey(key);
      return null;
    }

    _write(val, key) {
      if (this.isSurge() || this.isLoon())
        return $persistentStore.write(val, key);
      if (this.isQuanX()) return $prefs.setValueForKey(val, key);
      return false;
    }

    msg(title, sub, body, opt) {
      if (this.isSurge() || this.isLoon())
        $notification.post(title, sub, body, opt);
      if (this.isQuanX()) $notify(title, sub, body, opt);
    }

    logErr(e) {
      console.log("❗️", e);
    }

    done() {
      $done();
    }
  })();
}