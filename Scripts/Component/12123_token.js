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

// ========================
// 配置
// ========================
const TOKEN_KEY = "@ComponentService.12123.Settings.token";
const DEBUG_KEY = "@ComponentService.12123.Settings.debug";

// ========================
// 主逻辑
// ========================
!(async () => {
    if (typeof $request === "undefined") return $.done();

    const req = $request;
    if (!req.body || !req.body.includes("sign")) return $.done();

    try {
        const raw = decodeURIComponent(req.body).replace(/^params=/, "");
        const json = JSON.parse(raw);

        debug("RAW BODY:\n" + JSON.stringify(json, null, 2));

        // 只处理订阅接口
        if (json.api !== "biz.user.msg.subscribe") return $.done();

        if (!json.authToken) {
            debug("未发现 authToken，跳过");
            return $.done();
        }

        const newToken = {
            authToken: json.authToken,
            accessTime: json.accessTime,
            sign: json.sign,
            appId: json.appId,
            api: json.api,
            updateTime: Date.now()
        };

        const oldTokenStr = $.getdata(TOKEN_KEY);
        const oldToken = oldTokenStr ? JSON.parse(oldTokenStr) : {};

        // 避免重复写入
        if (oldToken.sign === newToken.sign) {
            debug("Token 未变化，跳过写入");
            return $.done();
        }

        $.setdata(JSON.stringify(newToken), TOKEN_KEY);

        $.msg(
            $.name,
            "✅ 12123 Token 获取成功",
            `authToken 已写入 BoxJs`,
            {
                "media-url":
                    "https://raw.githubusercontent.com/Nanako718/Scripting/main/images/12123.png"
            }
        );

        console.log("✅ 写入 Token：\n" + JSON.stringify(newToken, null, 2));
    } catch (e) {
        $.logErr(e);
    } finally {
        $.done();
    }
})();

// ========================
// Debug
// ========================
function debug(msg) {
    if ($.getdata(DEBUG_KEY) === "true") {
        console.log("[DEBUG]", msg);
    }
}

/* =======================
 * Env 工具（原样保留）
 * ======================= */

// prettier-ignore
function Env(t, e) {
    class s {
        constructor(t) {
            this.env = t
        }

        send(t, e = "GET") {
            t = "string" == typeof t ? {url: t} : t;
            let s = this.get;
            return "POST" === e && (s = this.post), new Promise((e, i) => {
                s.call(this, t, (t, s, r) => {
                    t ? i(t) : e(s)
                })
            })
        }

        get(t) {
            return this.send.call(this.env, t)
        }

        post(t) {
            return this.send.call(this.env, t, "POST")
        }
    }

    return new class {
        constructor(t, e) {
            this.name = t, this.http = new s(this), this.data = null, this.dataFile = "box.dat", this.logs = [], this.isMute = !1, this.isNeedRewrite = !1, this.logSeparator = "\n", this.encoding = "utf-8", this.startTime = (new Date).getTime(), Object.assign(this, e), this.log("", `🔔${this.name}, 开始!`)
        }

        isNode() {
            return "undefined" != typeof module && !!module.exports
        }

        isQuanX() {
            return "undefined" != typeof $task
        }

        isSurge() {
            return "undefined" != typeof $httpClient && "undefined" == typeof $loon
        }

        isLoon() {
            return "undefined" != typeof $loon
        }

        isShadowrocket() {
            return "undefined" != typeof $rocket
        }

        isStash() {
            return "undefined" != typeof $environment && $environment["stash-version"]
        }

        getdata(t) {
            let e = this.getval(t);
            if (/^@/.test(t)) {
                const [, s, i] = /^@(.*?)\.(.*?)$/.exec(t), r = s ? this.getval(s) : "";
                if (r) try {
                    const t = JSON.parse(r);
                    e = t ? i.split(".").reduce((t, e) => t?.[e], t) ?? "" : e
                } catch {
                    e = ""
                }
            }
            return e
        }

        setdata(t, e) {
            let s = !1;
            if (/^@/.test(e)) {
                const [, i, r] = /^@(.*?)\.(.*?)$/.exec(e), o = this.getval(i) || "{}";
                try {
                    const e = JSON.parse(o);
                    r.split(".").reduce((t, e, s, a) => (t[e] = s === a.length - 1 ? JSON.parse(t[e] ?? "null") || t[e] || t[e] : t[e] || {}), e), s = this.setval(JSON.stringify(e), i)
                } catch {
                    const o = {};
                    r.split(".").reduce((t, e, s, a) => (t[e] = s === a.length - 1 ? t[e] = t : t[e] || {}), o), s = this.setval(JSON.stringify(o), i)
                }
            } else s = this.setval(t, e);
            return s
        }

        getval(t) {
            return this.isSurge() || this.isLoon() ? $persistentStore.read(t) : this.isQuanX() ? $prefs.valueForKey(t) : this.isNode() ? (this.data = this.data || {}, this.data[t]) : null
        }

        setval(t, e) {
            return this.isSurge() || this.isLoon() ? $persistentStore.write(t, e) : this.isQuanX() ? $prefs.setValueForKey(t, e) : this.isNode() ? (this.data = this.data || {}, this.data[e] = t, !0) : null
        }

        msg(e = t, s = "", i = "", r) {
            const o = t => "string" == typeof t ? (this.isQuanX() ? {"open-url": t} : {url: t}) : t;
            (this.isSurge() || this.isLoon()) && $notification.post(e, s, i, o(r)), this.isQuanX() && $notify(e, s, i, o(r))
        }

        logErr(t) {
            console.log("❗️", t)
        }

        done() {
            $done()
        }
    }(t, e)
}