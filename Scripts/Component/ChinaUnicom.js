/*
获取方式：
1. 打开【中国联通】官方 App
2. 进入首页的「流量查询」页面，触发接口
3. 脚本将自动抓取 Cookie 并写入 BoxJS 变量 ChinaUnicom_cookie

===================
【MITM】
hostname = m.client.10010.com

===================
【Surge 脚本配置】
[Script]
联通组件 = type=http-request,pattern=https:\/\/m\.client\.10010\.com\/(.*)\/smartwisdomCommon,requires-body=1,max-size=0,script-path=https://raw.githubusercontent.com/ByteValley/NetTool/main/Scripts/ComponentService/ChinaUnicom.js,script-update-interval=0

===================
【Loon 脚本配置】
[Script]
http-request https:\/\/m\.client\.10010\.com\/(.*)\/smartwisdomCommon tag=联通组件, script-path=https://raw.githubusercontent.com/ByteValley/NetTool/main/Scripts/ComponentService/ChinaUnicom.js, timeout=60

===================
【Quantumult X 脚本配置】
[rewrite_local]
https:\/\/m\.client\.10010\.com\/(.*)\/smartwisdomCommon url script-request-header https://raw.githubusercontent.com/ByteValley/NetTool/main/Scripts/ComponentService/ChinaUnicom.js

[mitm]
hostname = m.client.10010.com
*/


const APIKey = 'ComponentService.ChinaUnicom'; // 只是脚本名字，便于日志识别
const ROOT_KEY = '#ComponentService';         // ✅ 持久化根 key：ComponentService

$ = new API(APIKey, true);

if (typeof $request !== 'undefined') {
    GetCookie();
}

function GetCookie() {
    const headers = $request.headers || {};
    const cookie = headers.Cookie || headers.cookie || '';

    $.log(headers);

    if (cookie && cookie.indexOf('JSESSIONID') > -1) {
        let root = {};
        try {
            const raw = $.read(ROOT_KEY); // 读已有 ComponentService
            if (raw) {
                root = JSON.parse(raw);
            }
        } catch (e) {
            root = {};
        }

        // 确保层级存在
        if (!root.ChinaUnicom) root.ChinaUnicom = {};
        if (!root.ChinaUnicom.Settings) root.ChinaUnicom.Settings = {};

        // 写入 Cookie
        root.ChinaUnicom.Settings.Cookie = cookie;

        // 持久化回 ComponentService
        $.write(JSON.stringify(root), ROOT_KEY);

        $.notify(
            '中国联通',
            'Cookie 写入成功',
            'ComponentService.ChinaUnicom.Settings.Cookie'
        );
    } else {
        $.notify(
            '中国联通',
            '未检测到 JSESSIONID',
            '请在【首页-流量查询】界面重新触发一次'
        );
    }

    $.done();

}

/* prettier-ignore */
function ENV() {
    const isJSBox = typeof require == "function" && typeof $jsbox != "undefined";
    return {
        isQX: typeof $task !== "undefined",
        isLoon: typeof $loon !== "undefined",
        isSurge: typeof $httpClient !== "undefined" && typeof $utils !== "undefined",
        isBrowser: typeof document !== "undefined",
        isNode: typeof require == "function" && !isJSBox,
        isJSBox,
        isRequest: typeof $request !== "undefined",
        isScriptable: typeof importModule !== "undefined",
        isShadowrocket: "undefined" !== typeof $rocket,
        isStash: "undefined" !== typeof $environment && $environment["stash-version"]
    }
}

/* prettier-ignore */
function HTTP(defaultOptions = {baseURL: ""}) {
    const {isQX, isLoon, isSurge, isScriptable, isNode, isBrowser, isShadowrocket, isStash,} = ENV();
    const methods = ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "PATCH"];
    const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/;

    function send(method, options) {
        options = typeof options === "string" ? {url: options} : options;
        const baseURL = defaultOptions.baseURL;
        if (baseURL && !URL_REGEX.test(options.url || "")) {
            options.url = baseURL ? baseURL + options.url : options.url
        }
        if (options.body && options.headers && !options.headers["Content-Type"]) {
            options.headers["Content-Type"] = "application/x-www-form-urlencoded"
        }
        options = {...defaultOptions, ...options};
        const timeout = options.timeout;
        const events = {
            ...{
                onRequest: () => {
                }, onResponse: (resp) => resp, onTimeout: () => {
                },
            }, ...options.events,
        };
        events.onRequest(method, options);
        let worker;
        if (isQX) {
            worker = $task.fetch({method, ...options})
        } else if (isLoon || isSurge || isNode || isShadowrocket || isStash) {
            worker = new Promise((resolve, reject) => {
                const request = isNode ? require("request") : $httpClient;
                request[method.toLowerCase()](options, (err, response, body) => {
                    if (err) reject(err); else resolve({
                        statusCode: response.status || response.statusCode,
                        headers: response.headers,
                        body,
                    })
                })
            })
        } else if (isScriptable) {
            const request = new Request(options.url);
            request.method = method;
            request.headers = options.headers;
            request.body = options.body;
            worker = new Promise((resolve, reject) => {
                request.loadString().then((body) => {
                    resolve({statusCode: request.response.statusCode, headers: request.response.headers, body,})
                }).catch((err) => reject(err))
            })
        } else if (isBrowser) {
            worker = new Promise((resolve, reject) => {
                fetch(options.url, {
                    method,
                    headers: options.headers,
                    body: options.body,
                }).then((response) => response.json()).then((response) => resolve({
                    statusCode: response.status,
                    headers: response.headers,
                    body: response.data,
                })).catch(reject)
            })
        }
        let timeoutid;
        const timer = timeout ? new Promise((_, reject) => {
            timeoutid = setTimeout(() => {
                events.onTimeout();
                return reject(`${method}URL:${options.url}exceeds the timeout ${timeout}ms`)
            }, timeout)
        }) : null;
        return (timer ? Promise.race([timer, worker]).then((res) => {
            clearTimeout(timeoutid);
            return res
        }) : worker).then((resp) => events.onResponse(resp))
    }

    const http = {};
    methods.forEach((method) => (http[method.toLowerCase()] = (options) => send(method, options)));
    return http
}

/* prettier-ignore */
function API(name = "untitled", debug = false) {
    const {isQX, isLoon, isSurge, isScriptable, isNode, isShadowrocket, isStash,} = ENV();
    return new (class {
        constructor(name, debug) {
            this.name = name;
            this.debug = debug;
            this.http = HTTP();
            this.env = ENV();
            this.node = (() => {
                if (isNode) {
                    const fs = require("fs");
                    return {fs}
                } else {
                    return null
                }
            })();
            this.initCache();
            const delay = (t, v) => new Promise(function (resolve) {
                setTimeout(resolve.bind(null, v), t)
            });
            Promise.prototype.delay = function (t) {
                return this.then(function (v) {
                    return delay(t, v)
                })
            }
        }

        initCache() {
            if (isQX) this.cache = JSON.parse($prefs.valueForKey(this.name) || "{}");
            if (isLoon || isSurge || isStash || isShadowrocket) this.cache = JSON.parse($persistentStore.read(this.name) || "{}");
            if (isNode) {
                let fpath = "root.json";
                if (!this.node.fs.existsSync(fpath)) {
                    this.node.fs.writeFileSync(fpath, JSON.stringify({}), {flag: "wx"}, (err) => console.log(err))
                }
                this.root = {};
                fpath = `${this.name}.json`;
                if (!this.node.fs.existsSync(fpath)) {
                    this.node.fs.writeFileSync(fpath, JSON.stringify({}), {flag: "wx"}, (err) => console.log(err));
                    this.cache = {}
                } else {
                    this.cache = JSON.parse(this.node.fs.readFileSync(`${this.name}.json`))
                }
            }
        }

        persistCache() {
            const data = JSON.stringify(this.cache, null, 2);
            if (isQX) $prefs.setValueForKey(data, this.name);
            if (isLoon || isSurge || isStash || isShadowrocket) $persistentStore.write(data, this.name);
            if (isNode) {
                this.node.fs.writeFileSync(`${this.name}.json`, data, {flag: "w"}, (err) => console.log(err));
                this.node.fs.writeFileSync("root.json", JSON.stringify(this.root, null, 2), {flag: "w"}, (err) => console.log(err))
            }
        }

        write(data, key) {
            this.log(`SET ${key}`);
            if (key.indexOf("#") !== -1) {
                key = key.substr(1);
                if (isLoon || isSurge || isStash || isShadowrocket) {
                    return $persistentStore.write(data, key)
                }
                if (isQX) {
                    return $prefs.setValueForKey(data, key)
                }
                if (isNode) {
                    this.root[key] = data
                }
            } else {
                this.cache[key] = data
            }
            this.persistCache()
        }

        read(key) {
            this.log(`READ ${key}`);
            if (key.indexOf("#") !== -1) {
                key = key.substr(1);
                if (isLoon || isSurge || isStash || isShadowrocket) {
                    return $persistentStore.read(key)
                }
                if (isQX) {
                    return $prefs.valueForKey(key)
                }
                if (isNode) {
                    return this.root[key]
                }
            } else {
                return this.cache[key]
            }
        }

        delete(key) {
            this.log(`DELETE ${key}`);
            if (key.indexOf("#") !== -1) {
                key = key.substr(1);
                if (isLoon || isSurge || isStash || isShadowrocket) {
                    return $persistentStore.write(null, key)
                }
                if (isQX) {
                    return $prefs.removeValueForKey(key)
                }
                if (isNode) {
                    delete this.root[key]
                }
            } else {
                delete this.cache[key]
            }
            this.persistCache()
        }

        notify(title, subtitle = "", content = "", options = {}) {
            const openURL = options["open-url"];
            const mediaURL = options["media-url"];
            if (isQX) $notify(title, subtitle, content, options);
            if (isSurge) {
                $notification.post(title, subtitle, content + `${mediaURL ? "\n多媒体:" + mediaURL : ""}`, {url: openURL})
            }
            if (isLoon || isStash || isShadowrocket) {
                let opts = {};
                if (openURL) opts["openUrl"] = openURL;
                if (mediaURL) opts["mediaUrl"] = mediaURL;
                if (JSON.stringify(opts) === "{}") {
                    $notification.post(title, subtitle, content)
                } else {
                    $notification.post(title, subtitle, content, opts)
                }
            }
            if (isNode || isScriptable) {
                const content_ = content + (openURL ? `\n点击跳转:${openURL}` : "") + (mediaURL ? `\n多媒体:${mediaURL}` : "");
                if (isJSBox) {
                    const push = require("push");
                    push.schedule({title: title, body: (subtitle ? subtitle + "\n" : "") + content_,})
                } else {
                    console.log(`${title}\n${subtitle}\n${content_}\n\n`)
                }
            }
        }

        log(msg) {
            if (this.debug) console.log(`[${this.name}]LOG:${this.stringify(msg)}`)
        }

        info(msg) {
            console.log(`[${this.name}]INFO:${this.stringify(msg)}`)
        }

        error(msg) {
            console.log(`[${this.name}]ERROR:${this.stringify(msg)}`)
        }

        wait(millisec) {
            return new Promise((resolve) => setTimeout(resolve, millisec))
        }

        done(value = {}) {
            if (isQX || isLoon || isSurge || isStash || isShadowrocket) {
                $done(value)
            } else if (isNode && !isJSBox) {
                if (typeof $context !== "undefined") {
                    $context.headers = value.headers;
                    $context.statusCode = value.statusCode;
                    $context.body = value.body
                }
            }
        }

        stringify(obj_or_str) {
            if (typeof obj_or_str === "string" || obj_or_str instanceof String) return obj_or_str; else try {
                return JSON.stringify(obj_or_str, null, 2)
            } catch (err) {
                return "[object Object]"
            }
        }
    })(name, debug)
}
