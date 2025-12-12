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

const KEY_TOKEN = "@ComponentService.12123.Settings.token";
const KEY_DEBUG = "@ComponentService.12123.Settings.debug";

(async () => {
    try {
        if (typeof $request === "undefined") return;

        const body = $request.body || "";
        if (!body || !body.includes("sign")) return;

        // body 形如：params=xxxxxx(encodeURIComponent)
        const raw = decodeURIComponent(body).replace(/^params=/, "");
        let data;
        try {
            data = JSON.parse(raw);
        } catch (e) {
            debug("JSON.parse 失败，raw=\n" + raw);
            throw e;
        }

        debug("捕获 params：\n" + JSON.stringify(data, null, 2));

        // 仅处理订阅接口（Nanako 原逻辑）
        if (data.api !== "biz.user.msg.subscribe") return;
        if (!data.authToken) {
            debug("未发现 authToken，跳过");
            return;
        }

        const tokenObj = {
            authToken: data.authToken,
            accessTime: data.accessTime,
            sign: data.sign,
            appId: data.appId,
            api: data.api,
            updateTime: Date.now(),
        };

        // 避免重复写入
        const oldStr = $.getdata(KEY_TOKEN);
        const oldObj = oldStr ? safeJsonParse(oldStr, {}) : {};
        if (oldObj && oldObj.sign && oldObj.sign === tokenObj.sign) {
            debug("sign 未变化，跳过写入");
            return;
        }

        $.setdata(JSON.stringify(tokenObj), KEY_TOKEN);

        $.msg(
            $.name,
            "✅ Token 抓取成功",
            "已写入 @ComponentService.12123.Settings.token",
            {
                "media-url":
                    "https://raw.githubusercontent.com/Nanako718/Scripting/main/images/12123.png",
            }
        );

        console.log("[12123] 写入成功：\n" + JSON.stringify(tokenObj, null, 2));
    } catch (e) {
        $.logErr(e);
    } finally {
        $.done();
    }
})();

function debug(msg) {
    if ($.getdata(KEY_DEBUG) === "true") {
        console.log("[DEBUG]", msg);
    }
}

function safeJsonParse(str, fallback) {
    try {
        return JSON.parse(str);
    } catch {
        return fallback;
    }
}

/* =======================
 * Env（稳定实现：支持 @root.path 写入/读取）
 * Surge / Loon / QuanX
 * ======================= */
function Env(name) {
    return new (class {
        constructor() {
            this.name = name;
        }

        isSurge() {
            return typeof $httpClient !== "undefined" && typeof $loon === "undefined";
        }

        isLoon() {
            return typeof $loon !== "undefined";
        }

        isQuanX() {
            return typeof $task !== "undefined";
        }

        getval(key) {
            if (this.isSurge() || this.isLoon()) return $persistentStore.read(key);
            if (this.isQuanX()) return $prefs.valueForKey(key);
            return null;
        }

        setval(val, key) {
            if (this.isSurge() || this.isLoon()) return $persistentStore.write(val, key);
            if (this.isQuanX()) return $prefs.setValueForKey(val, key);
            return false;
        }

        getdata(key) {
            if (!key || typeof key !== "string") return "";
            if (!key.startsWith("@")) return this.getval(key) || "";

            const m = key.match(/^@([^\.]+)\.(.+)$/);
            if (!m) return "";
            const rootKey = m[1];
            const path = m[2];

            const rootStr = this.getval(rootKey);
            if (!rootStr) return "";

            let rootObj;
            try {
                rootObj = JSON.parse(rootStr);
            } catch {
                return "";
            }
            return path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : ""), rootObj) ?? "";
        }

        setdata(val, key) {
            if (!key || typeof key !== "string") return false;
            if (!key.startsWith("@")) return this.setval(val, key);

            const m = key.match(/^@([^\.]+)\.(.+)$/);
            if (!m) return false;
            const rootKey = m[1];
            const path = m[2];

            // root 读取/初始化
            let rootObj = {};
            const rootStr = this.getval(rootKey);
            if (rootStr) {
                try {
                    rootObj = JSON.parse(rootStr) || {};
                } catch {
                    rootObj = {};
                }
            }

            // 这里 val 我们约定是 JSON 字符串（tokenObj）
            let valueObj = val;
            try {
                valueObj = JSON.parse(val);
            } catch {
                // 如果不是 JSON，就当字符串写
            }

            // lodash-set（安全）
            const keys = path.split(".");
            let cur = rootObj;
            for (let i = 0; i < keys.length - 1; i++) {
                const k = keys[i];
                if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
                cur = cur[k];
            }
            cur[keys[keys.length - 1]] = valueObj;

            return this.setval(JSON.stringify(rootObj), rootKey);
        }

        msg(title, sub, body, opts) {
            if (this.isSurge() || this.isLoon()) $notification.post(title, sub, body, opts);
            if (this.isQuanX()) $notify(title, sub, body, opts);
        }

        logErr(e) {
            console.log("❗️", e && e.stack ? e.stack : e);
        }

        done() {
            $done();
        }
    })();
}