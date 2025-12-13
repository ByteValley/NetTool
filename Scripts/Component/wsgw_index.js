/******************************************
 * @name 网上国网小组件数据更新接口
 * @description 网上国网电费查询
 * @channel https://t.me/yqc_123/
 * @feedback https://t.me/NobyDa_Chat
 * @author 小白脸｜𝐎𝐍𝐙𝟑𝐕｜ByteValley
 *
 * BoxJs订阅地址:
 * https://raw.githubusercontent.com/ByteValley/NetTool/main/BoxJs/ComponentService.boxjs.json
 *
 * 原脚本地址：
 * https://raw.githubusercontent.com/dompling/Script/master/wsgw/index.js
 *
 * 根 JSON（驼峰）：
 * ComponentService = {
 *   SGCC: {
 *     Settings: { phoneNum, password, logDebug, notifyType, recentElcFee },
 *     Caches: { bizrt }
 *   }
 * }
 ******************************************/

function getUrlParams(url) {
    const queryString = url.split("?")[1];
    if (!queryString) return {};
    const query = queryString.split("&");
    let params = {};
    for (let i = 0; i < query.length; i++) {
        let pair = query[i].split("=");
        let key = decodeURIComponent(pair[0]);
        let value = decodeURIComponent(pair[1] || "");
        params[key] = value;
    }
    return params;
}

const getEnv = () =>
  typeof $environment !== "undefined" && $environment["surge-version"]
    ? "Surge"
    : typeof $environment !== "undefined" && $environment["egern-version"]
    ? "Egern"
    : typeof $environment !== "undefined" && $environment["stash-version"]
    ? "Stash"
    : eval('typeof process !== "undefined"')
    ? "Node.js"
    : typeof $task !== "undefined"
    ? "Quantumult X"
    : typeof $loon !== "undefined"
    ? "Loon"
    : typeof $rocket !== "undefined"
    ? "Shadowrocket"
    : void 0;

const ENV = getEnv();

const isSurge  = () => ENV === "Surge";
const isEgern  = () => ENV === "Egern";
const isQuanX  = () => ENV === "Quantumult X";
const isLoon   = () => ENV === "Loon";
const isStash  = () => ENV === "Stash";
const isShadow = () => ENV === "Shadowrocket";
const isNode   = () => ENV === "Node.js";

// 把 Surge / Egern / Stash / Loon / Shadowrocket 归为 “$httpClient 系”
const isHttpClientLike = () =>
  ENV === "Surge" || ENV === "Egern" || ENV === "Stash" || ENV === "Loon" || ENV === "Shadowrocket";

class Logger {
    constructor(e = "日志输出", o = "info") {
        (this.prefix = e),
            (this.levels = ["trace", "debug", "info", "warn", "error"]),
            this.setLevel(o);
    }

    setLevel(e) {
        this.currentLevelIndex = this.levels.indexOf(e);
    }

    log(e, ...o) {
        this.levels.indexOf(e) >= this.currentLevelIndex &&
        console.log(
            `${this.prefix ? `[${this.prefix}] ` : ""}[${e.toUpperCase()}]\n` +
            [...o].join("\n")
        );
    }

    trace(...e) {
        this.log("trace", ...e);
    }

    debug(...e) {
        this.log("debug", ...e);
    }

    info(...e) {
        this.log("info", ...e);
    }

    warn(...e) {
        this.log("warn", ...e);
    }

    error(...e) {
        this.log("error", ...e);
    }
}

const request$1 = async (request = {} || "", option = {}) => {
  switch (request.constructor) {
    case Object:
      request = { ...request, ...option };
      break;
    case String:
      request = { url: request, ...option };
  }

  request.method ||
    ((request.method = "GET"),
    (request.body ?? request.bodyBytes) && (request.method = "POST"));

  delete request.headers?.["Content-Length"];
  delete request.headers?.["content-length"];

  const method = request.method.toLocaleLowerCase();

  switch (ENV) {
    case "Loon":
    case "Surge":
    case "Egern":         // ✅ 新增
    case "Stash":
    case "Shadowrocket":
    default:
      return (
        delete request.id,
        request.policy &&
          (isLoon() && (request.node = request.policy),
          isStash() &&
            (request.headers || (request.headers = {}),
            (request.headers["X-Stash-Selected-Proxy"] = encodeURI(request.policy)))),
        ArrayBuffer.isView(request.body) && (request["binary-mode"] = !0),
        await new Promise((resolve, reject) => {
          $httpClient[method](request, (err, resp, body) => {
            err
              ? reject(err)
              : ((resp.ok = /^2\d\d$/.test(resp.status)),
                (resp.statusCode = resp.status),
                body &&
                  ((resp.body = body),
                  1 == request["binary-mode"] && (resp.bodyBytes = body)),
                resolve(resp));
          });
        })
      );

    case "Quantumult X":
      switch (
        (delete request.scheme,
        delete request.sessionIndex,
        delete request.charset,
        request.policy &&
          (request.opts || (request.opts = {}), (request.opts.policy = request.policy)),
        (request?.headers?.["Content-Type"] ?? request?.headers?.["content-type"])?.split(";")?.[0])
      ) {
        default:
          delete request.bodyBytes;
          break;
        case "application/protobuf":
        case "application/x-protobuf":
        case "application/vnd.google.protobuf":
        case "application/grpc":
        case "application/grpc+proto":
        case "application/octet-stream":
          delete request.body,
            ArrayBuffer.isView(request.bodyBytes) &&
              (request.bodyBytes = request.bodyBytes.buffer.slice(
                request.bodyBytes.byteOffset,
                request.bodyBytes.byteLength + request.bodyBytes.byteOffset
              ));
        case void 0:
      }
      return await $task.fetch(request).then(
        (res) => ((res.ok = /^2\d\d$/.test(res.statusCode)), (res.status = res.statusCode), res),
        (e) => Promise.reject(e.error)
      );

    case "Node.js":
      const got = eval('require("got")');
      let iconv = eval('require("iconv-lite")');
      const { url, ...option2 } = request;
      return await got[method](url, option2).then(
        (res) => (
          (res.statusCode = res.status),
          (res.body = iconv.decode(res.rawBody, request?.encoding || "utf-8")),
          (res.bodyBytes = res.rawBody),
          res
        ),
        (e) => {
          if (e.response && 500 === e.response.statusCode) return Promise.reject(e.response.body);
          return Promise.reject(e.message);
        }
      );
  }
};

class Store {
  constructor(NAMESPACE) {
    this.env = ENV;
    this.Store = "./store";
    if (NAMESPACE) this.Store = `./store/${NAMESPACE}`;
    if (this.env === "Node.js") {
      const { LocalStorage } = eval('require("node-localstorage")');
      this.localStorage = new LocalStorage(this.Store);
    }
  }

  get(key) {
    switch (this.env) {
      case "Surge":
      case "Egern":
      case "Loon":
      case "Stash":
      case "Shadowrocket":
        return $persistentStore.read(key);
      case "Quantumult X":
        return $prefs.valueForKey(key);
      case "Node.js":
        return this.localStorage.getItem(key);
      default:
        return null;
    }
  }

  set(key, val) {
    switch (this.env) {
      case "Surge":
      case "Egern":
      case "Loon":
      case "Stash":
      case "Shadowrocket":
        return $persistentStore.write(val, key);
      case "Quantumult X":
        return $prefs.setValueForKey(val, key);
      case "Node.js":
        this.localStorage.setItem(key, val);
        return true;
      default:
        return null;
    }
  }

  clear(key) {
    switch (this.env) {
      case "Surge":
      case "Egern":
      case "Loon":
      case "Stash":
      case "Shadowrocket":
        return $persistentStore.write(null, key);
      case "Quantumult X":
        return $prefs.removeValueForKey(key);
      case "Node.js":
        this.localStorage.removeItem(key);
        return true;
      default:
        return null;
    }
  }
}

const notify = (e = "", o = "", r = "", s = {}) => {
    const n = (e2) => {
        const {$open: o2, $copy: r2, $media: s2, $mediaMime: n2} = e2;
        switch (typeof e2) {
            case void 0:
                return e2;
            case "string":
                switch (getEnv()) {
                    case "Surge":
                    case "Egern":
                    case "Stash":
                    default:
                        return {url: e2};
                    case "Loon":
                    case "Shadowrocket":
                        return e2;
                    case "Quantumult X":
                        return {"open-url": e2};
                    case "Node.js":
                        return;
                }
            case "object":
                switch (getEnv()) {
                    case "Surge":
                    case "Egern":
                    case "Stash":
                    case "Shadowrocket":
                    default: {
                        const c = {};
                        let t = e2.openUrl || e2.url || e2["open-url"] || o2;
                        t && Object.assign(c, {action: "open-url", url: t});
                        let a = e2["update-pasteboard"] || e2.updatePasteboard || r2;
                        a && Object.assign(c, {action: "clipboard", text: a});
                        if (s2) {
                            let e3, o3, r3;
                            if (s2.startsWith("http")) e3 = s2;
                            else if (s2.startsWith("data:")) {
                                const [e4] = s2.split(";"),
                                    [, n3] = s2.split(",");
                                (o3 = n3), (r3 = e4.replace("data:", ""));
                            } else {
                                (o3 = s2),
                                    (r3 = ((e5) => {
                                        const o4 = {
                                            JVBERi0: "application/pdf",
                                            R0lGODdh: "image/gif",
                                            R0lGODlh: "image/gif",
                                            iVBORw0KGgo: "image/png",
                                            "/9j/": "image/jpg",
                                        };
                                        for (var r4 in o4) if (0 === e5.indexOf(r4)) return o4[r4];
                                        return null;
                                    })(s2));
                            }
                            Object.assign(c, {
                                "media-url": e3,
                                "media-base64": o3,
                                "media-base64-mime": n2 ?? r3,
                            });
                        }
                        return (
                            Object.assign(c, {
                                "auto-dismiss": e2["auto-dismiss"],
                                sound: e2.sound,
                            }),
                                c
                        );
                    }
                    case "Loon": {
                        const r3 = {};
                        let n3 = e2.openUrl || e2.url || e2["open-url"] || o2;
                        n3 && Object.assign(r3, {openUrl: n3});
                        let c2 = e2.mediaUrl || e2["media-url"];
                        s2?.startsWith("http") && (c2 = s2);
                        c2 && Object.assign(r3, {mediaUrl: c2});
                        console.log(JSON.stringify(r3));
                        return r3;
                    }
                    case "Quantumult X": {
                        const n3 = {};
                        let c2 = e2["open-url"] || e2.url || e2.openUrl || o2;
                        c2 && Object.assign(n3, {"open-url": c2});
                        let t = e2["media-url"] || e2.mediaUrl;
                        s2?.startsWith("http") && (t = s2);
                        t && Object.assign(n3, {"media-url": t});
                        let a = e2["update-pasteboard"] || e2.updatePasteboard || r2;
                        a && Object.assign(n3, {"update-pasteboard": a});
                        console.log(JSON.stringify(n3));
                        return n3;
                    }
                    case "Node.js":
                        return;
                }
            default:
                return;
        }
    };

    switch (getEnv()) {
        case "Surge":
        case "Egern":
        case "Loon":
        case "Stash":
        case "Shadowrocket":
        default:
            $notification.post(e, o, r, n(s));
            break;
        case "Quantumult X":
            $notify(e, o, r, n(s));
        case "Node.js":
    }
    let c = ["", "==============📣系统通知📣=============="];
    c.push(e), o && c.push(o), r && c.push(r), console.log(c.join("\n"));
};

const done = (e = {}) => {
    switch (getEnv()) {
        case "Surge":
        case "Egern":
        case "Loon":
        case "Stash":
        case "Shadowrocket":
        case "Quantumult X":
        default:
            $done(e);
            break;
        case "Node.js":
            process.exit(1);
    }
};

/* =======================
 * SafeDone：避免多次 $done 导致部分内核无响应
 * ======================= */
let __finished = false;
const safeDone = (payload) => {
  if (__finished) return;
  __finished = true;
  done(payload);
};

const SERVER_HOST = "https://api.120399.xyz";
const BASE_URL = "https://www.95598.cn";

const SCRIPTNAME = "网上国网";
const NAMESPACE = "ONZ3V";
const store = new Store(NAMESPACE);
const Notify = isNode() ? require("./sendNotify") : "";

/* =======================
 * ComponentService 根 JSON
 * ======================= */
const ROOT_KEY = "ComponentService";

const jsonParse = (e) => {
    try {
        return JSON.parse(e);
    } catch {
        return e;
    }
};
const jsonStr = (e, ...o) => {
    try {
        return JSON.stringify(e, ...o);
    } catch {
        return e;
    }
};
const isTrue = (e) => !0 === e || "true" === e || 1 === e || "1" === e;

function ensureRoot(root) {
    if (!root || typeof root !== "object") root = {};
    if (!root.SGCC || typeof root.SGCC !== "object") root.SGCC = {};
    if (!root.SGCC.Settings || typeof root.SGCC.Settings !== "object")
        root.SGCC.Settings = {};
    if (!root.SGCC.Caches || typeof root.SGCC.Caches !== "object")
        root.SGCC.Caches = {};
    return root;
}

function readRoot() {
    const raw = store.get(ROOT_KEY);
    return ensureRoot(jsonParse(raw || "{}") || {});
}

function writeRoot(root) {
    return store.set(ROOT_KEY, jsonStr(ensureRoot(root)));
}

function getSetting(key, defVal = "") {
    const root = readRoot();
    const v = root.SGCC.Settings[key];
    return v === undefined || v === null || v === "" ? defVal : v;
}

function getCache(key, defVal = null) {
    const root = readRoot();
    const v = root.SGCC.Caches[key];
    return v === undefined || v === null || v === "" ? defVal : v;
}

function setCache(key, val) {
    const root = readRoot();
    root.SGCC.Caches[key] = val;
    return writeRoot(root);
}

function clearCache(key) {
    const root = readRoot();
    delete root.SGCC.Caches[key];
    return writeRoot(root);
}

/* =======================
 * 必需 API（只保留用到的）
 * ======================= */
const $api = {
    getKeyCode: "/oauth2/outer/c02/f02",
    getAuth: "/oauth2/oauth/authorize",
    getWebToken: "/oauth2/outer/getWebToken",

    // 登录/验证码
    loginVerifyCodeNew: "/osg-web0004/open/c44/f05",
    loginTestCodeNew: "/osg-web0004/open/c44/f06",

    // 绑定/账单/用电量
    searchUser: "/osg-open-uc0001/member/c9/f02",
    accapi: "/osg-open-bc0001/member/c05/f01",
    busInfoApi: "/osg-web0004/member/c24/f01",

    // 江苏特殊
    segmentDate: "/osg-open-bc0001/member/arg/020070013",

    // 阶梯电费
    LowelectBill: "/osg-open-bc0001/member/c04/f01",
    HideelectBill: "/osg-open-bc0001/member/c04/f02",
    electBill: "/osg-open-bc0001/member/c04/f03",
};

/* =======================
 * 必需 configuration（只保留用到的）
 * ======================= */
const $configuration = {
    uscInfo: {
        member: "0902",
        devciceIp: "",
        devciceId: "",
        tenant: "state_grid",
    },
    source: "SGAPP",
    target: "32101",

    userInform: {serviceCode: "0101183", source: "SGAPP"},

    // 查询电费（accapi 的 data.serviceCode 用了 0101143）
    account: {channelCode: "0902", funcCode: "WEBA1007200"},

    // 日用电量
    getday: {
        channelCode: "0902",
        clearCache: "11",
        funcCode: "WEBALIPAY_01",
        promotCode: "1",
        promotType: "1",
        serviceCode: "BCP_000026",
        source: "app",
    },

    // 月/去年用电量
    mouthOut: {
        channelCode: "0902",
        clearCache: "11",
        funcCode: "WEBALIPAY_01",
        promotCode: "1",
        promotType: "1",
        serviceCode: "BCP_000026",
        source: "app",
    },

    // 阶梯用电
    stepelect: {
        channelCode: "0902",
        funcCode: "WEBALIPAY_01",
        promotType: "1",
        clearCache: "09",
        serviceCode: "BCP_000026",
        source: "app",
    },
};

/* =======================
 * 读取 Settings（你要求的字段）
 * ======================= */
const USERNAME = (isNode() ? process.env.WSGW_USERNAME : getSetting("phoneNum")) || "";
const PASSWORD = (isNode() ? process.env.WSGW_PASSWORD : getSetting("password")) || "";
const LOG_DEBUG = isNode() ? process.env.WSGW_LOG_DEBUG : getSetting("logDebug", "false");
const NOTIFY_TYPE = String(getSetting("notifyType", "all"));
const RECENT_ELC_FEE = Number(getSetting("recentElcFee", 0)) || 0;

const log = new Logger(SCRIPTNAME, isTrue(LOG_DEBUG) ? "debug" : "info");

/* =======================
 * 全局变量
 * ======================= */
const Global =
    "undefined" != typeof globalThis
        ? globalThis
        : "undefined" != typeof window
            ? window
            : "undefined" != typeof global
                ? global
                : "undefined" != typeof self
                    ? self
                    : {};

Global.bizrt = jsonParse(getCache("bizrt", "{}")) || {};
let bizrt = Global.bizrt;

const request = async (e) => {
    try {
        const o = {
                url: `${SERVER_HOST}/wsgw/encrypt`,
                headers: {"content-type": "application/json"},
                body: JSON.stringify({yuheng: e}),
            },
            r = await Encrypt(o);

        if ("/api/oauth2/oauth/authorize" === e.url)
            Object.assign(r, {body: r.body.replace(/^\"|\"$/g, "")});

        let {body: s} = await request$1(r);
        try {
            s = JSON.parse(s);
        } catch {
        }

        if (
            s.code &&
            (10010 == s.code ||
                (10002 === s.code && "WEB渠道KeyCode已失效" == s.message) ||
                30010 === s.code ||
                "20103" === s.code ||
                (10002 === s.code && bizrt.token && "Token 为空！" == s.message))
        )
            return Promise.reject(s.message);

        const n = {config: {...e}, data: s};
        if ("/api/oauth2/outer/c02/f02" === e.url)
            Object.assign(n.config, {headers: {encryptKey: r.encryptKey}});

        const c = {
            url: `${SERVER_HOST}/wsgw/decrypt`,
            headers: {"content-type": "application/json"},
            body: JSON.stringify({yuheng: n}),
        };
        return await Decrypt(c);
    } catch (e2) {
        return Promise.reject(e2);
    }
};

const Encrypt = async (e) =>
    request$1(e).then(({body: e2}) => {
        try {
            e2 = JSON.parse(e2);
        } catch {
        }
        return (
            (e2.data.url = BASE_URL + e2.data.url),
                (e2.data.body = JSON.stringify(e2.data.data)),
                delete e2.data.data,
                e2.data
        );
    });

const Decrypt = async (e) =>
    request$1(e).then(({body: o}) => {
        let r = JSON.parse(o);
        const {code: s, message: n, data: c} = r.data;
        return "" + s == "1"
            ? c
            : e.url.indexOf("oauth2/oauth/authorize") > -1 &&
            c &&
            s &&
            "" != s &&
            (10015 === s ||
                10108 === s ||
                10009 === s ||
                10207 === s ||
                10005 === s ||
                10010 === s ||
                30010 === s ||
                (10002 === s && "WEB渠道KeyCode已失效" == n) ||
                (10002 === s && bizrt.token && "Token 为空！" == n))
                ? Promise.reject(`重新获取: ${n}`)
                : Promise.reject(n);
    });

const Recoginze = async (e) => {
    const o = {
        url: `${SERVER_HOST}/wsgw/get_x`,
        headers: {"content-type": "application/json"},
        body: JSON.stringify({yuheng: e}),
    };
    return request$1(o).then(({body: e2}) => JSON.parse(e2));
};

const getBeforeDate = (e) => {
    const o = new Date();
    o.setDate(o.getDate() - e);
    return `${o.getFullYear()}-${String(o.getMonth() + 1).padStart(2, "0")}-${String(
        o.getDate()
    ).padStart(2, "0")}`;
};

async function showNotice() {
    console.log("");
    console.log("1. 本脚本仅用于学习研究，禁止用于商业用途");
    console.log("2. 本脚本不保证准确性、可靠性、完整性和及时性");
    console.log("3. 任何个人或组织均可无需经过通知而自由使用");
    console.log("4. 作者对任何脚本问题概不负责，包括由此产生的任何损失");
    console.log(
        "5. 如果任何单位或个人认为该脚本可能涉嫌侵犯其权利，应及时通知并提供身份证明、所有权证明，我将在收到认证文件确认后删除"
    );
    console.log("6. 请勿将本脚本用于商业用途，由此引起的问题与作者无关");
    console.log("7. 本脚本及其更新版权归作者所有");
    console.log("");
}

async function sendMsg(e, o, r, s) {
    const n = s?.["open-url"] || s?.openUrl || s?.$open || s?.url,
        c = s?.["media-url"] || s?.mediaUrl || s?.$media;
    isNode()
        ? ((r += n ? `\n点击跳转: ${n}` : ""),
            (r += c ? `\n多媒体: ${c}` : ""),
            console.log(`${e}\n${o}\n${r}\n`),
            await Notify.sendNotify(`${e}\n${o}`, r))
        : notify(e, o, r, s);
}

/* =======================
 * 业务流程
 * ======================= */
let requestKey = {};
let authorizecode = "";
let accessToken = "";
let bindInfo = {};
let eleBill = {};
let dayElecQuantity = {};
let dayElecQuantity31 = {};
let monthElecQuantity = {};
let lastYearElecQuantity = {};
let stepElecQuantity = {};

async function getKeyCode() {
    console.log("⏳ 获取keyCode和publicKey...");
    try {
        const e = {url: `/api${$api.getKeyCode}`, method: "post", headers: {}};
        requestKey = await request(e);
        Global.requestKey = requestKey;
        log.info("✅ 获取keyCode和publicKey成功");
        log.debug(`🔑 keyCode&publicKey: ${jsonStr(requestKey, null, 2)}`);
    } catch (e2) {
        return Promise.reject(`获取keyCode和PublicKey失败: ${e2}`);
    } finally {
        console.log("🔚 获取keyCode和publicKey结束");
    }
}

async function getVerifyCode() {
    console.log("⏳ 获取验证码...");
    try {
        const e = {
                url: `/api${$api.loginVerifyCodeNew}`,
                method: "post",
                data: {
                    password: PASSWORD,
                    account: USERNAME,
                    canvasHeight: 200,
                    canvasWidth: 310,
                },
                headers: {...requestKey},
            },
            o = await request(e);

        log.info("✅ 获取验证码凭证成功");
        log.debug(`🔑 验证码凭证: ${o.ticket}`);

        const {data: r} = await Recoginze(o.canvasSrc);
        log.info("✅ 识别验证码成功");
        log.debug(`🔑 验证码: ${r}`);

        return {code: r, ticket: o.ticket};
    } catch (e2) {
        return Promise.reject("获取验证码失败: " + e2);
    } finally {
        console.log("🔚 获取验证码结束");
    }
}

async function login(loginKey, code) {
    console.log("⏳ 登录中...");
    try {
        const r = {
                url: `/api${$api.loginTestCodeNew}`,
                method: "post",
                headers: {...requestKey},
                data: {
                    loginKey,
                    code,
                    params: {
                        uscInfo: {
                            devciceIp: "",
                            tenant: "state_grid",
                            member: "0902",
                            devciceId: "",
                        },
                        quInfo: {
                            optSys: "android",
                            pushId: "000000",
                            addressProvince: "110100",
                            password: PASSWORD,
                            addressRegion: "110101",
                            account: USERNAME,
                            addressCity: "330100",
                        },
                    },
                    Channels: "web",
                },
            },
            {bizrt: s} = await request(r);

        if (!(s?.userInfo?.length > 0))
            return Promise.reject("登录失败: 请检查信息填写是否正确! ");

        setCache("bizrt", jsonStr(s));
        Global.bizrt = s;
        bizrt = s;

        log.info("✅ 登录成功");
        log.debug(
            `🔑 用户凭证: ${s.token}`,
            `👤 用户信息: ${s.userInfo[0].nickname || s.userInfo[0].loginAccount}`
        );
    } catch (e) {
        return /验证错误/.test(e)
            ? (log.error(`滑块验证出错, 重新登录: ${e}`), await doLogin())
            : Promise.reject(`登陆失败: ${e}`);
    } finally {
        console.log("🔚 登录结束");
    }
}

async function doLogin() {
    const {code, ticket} = await getVerifyCode();
    await login(ticket, code);
}

async function getAuthcode() {
    console.log("⏳ 获取授权码...");
    try {
        const e = {
                url: `/api${$api.getAuth}`,
                method: "post",
                headers: {...requestKey, token: bizrt.token},
            },
            {redirect_url: o} = await request(e);

        authorizecode = o.split("?code=")[1] || "";
        Global.authorizecode = authorizecode;

        log.info("✅ 获取授权码成功");
        log.debug(`🔑 授权码: ${authorizecode}`);
    } catch (e2) {
        return Promise.reject(`获取授权码失败: ${e2}`);
    } finally {
        console.log("🔚 获取授权码结束");
    }
}

async function getAccessToken() {
    console.log("⏳ 获取凭证...");
    try {
        const e = {
            url: `/api${$api.getWebToken}`,
            method: "post",
            headers: {
                ...requestKey,
                token: bizrt.token,
                authorizecode: authorizecode,
            },
        };
        accessToken = await request(e).then((e2) => e2.access_token);
        Global.accessToken = accessToken;

        log.info("✅ 获取凭证成功");
        log.debug(`🔑 AccessToken: ${accessToken}`);
    } catch (e2) {
        return Promise.reject(`获取凭证失败: ${e2}`);
    } finally {
        console.log("🔚 获取凭证结束");
    }
}

async function getBindInfo() {
    console.log("⏳ 查询绑定信息...");
    try {
        const e = {
            url: `/api${$api.searchUser}`,
            method: "post",
            headers: {...requestKey, token: bizrt.token, acctoken: accessToken},
            data: {
                serviceCode: $configuration.userInform.serviceCode,
                source: $configuration.source,
                target: $configuration.target,
                uscInfo: {
                    member: $configuration.uscInfo.member,
                    devciceIp: $configuration.uscInfo.devciceIp,
                    devciceId: $configuration.uscInfo.devciceId,
                    tenant: $configuration.uscInfo.tenant,
                },
                quInfo: {userId: bizrt.userInfo[0].userId},
                token: bizrt.token,
                Channels: "web",
            },
        };

        bindInfo = await request(e).then((e2) => e2.bizrt);
        Global.bindInfo = bindInfo;

        log.info("✅ 获取绑定信息成功");
        log.debug(`🔑 用户绑定信息: ${jsonStr(bindInfo, null, 2)}`);
    } catch (e2) {
        return Promise.reject(`获取绑定信息失败: ${e2}`);
    } finally {
        console.log("🔚 查询绑定信息结束");
    }
}

async function getElcFee(idx) {
    console.log("⏳ 查询电费...");
    try {
        const o = bindInfo.powerUserList[idx];
        const [r] = bizrt.userInfo;

        const s = {
            url: `/api${$api.accapi}`,
            method: "post",
            headers: {...requestKey, token: bizrt.token, acctoken: accessToken},
            data: {
                data: {
                    srvCode: "",
                    serialNo: "",
                    channelCode: $configuration.account.channelCode,
                    funcCode: $configuration.account.funcCode,
                    acctId: r.userId,
                    userName: r.loginAccount ? r.loginAccount : r.nickname,
                    promotType: "1",
                    promotCode: "1",
                    userAccountId: r.userId,
                    list: [
                        {
                            consNoSrc: o.consNo_dst,
                            proCode: o.proNo,
                            sceneType: o.constType,
                            consNo: o.consNo,
                            orgNo: o.orgNo,
                        },
                    ],
                },
                serviceCode: "0101143",
                source: $configuration.source,
                target: o.proNo || o.provinceId,
            },
        };

        eleBill = await request(s).then((e2) => e2.list[0]);
        Global.eleBill = eleBill;

        log.info("✅ 查询电费成功");
        log.debug(`🔑 电费信息: ${jsonStr(eleBill, null, 2)}`);

        if (eleBill.powerUserList) store.set("eleBill", jsonStr(eleBill));
        else if (store.get("eleBill")) Global.eleBill = jsonParse(store.get("eleBill"));
    } catch (e2) {
        if (store.get("eleBill")) Global.eleBill = jsonParse(store.get("eleBill"));
        return console.log(`查询电费失败: ${e2}`);
    } finally {
        console.log("🔚 查询电费结束");
    }
}

async function getDayElecQuantity(idx) {
    console.log("⏳ 获取日用电量...");
    try {
        const o = bindInfo.powerUserList[idx];
        const [r] = bizrt.userInfo;
        const s = getBeforeDate(6);
        const n = getBeforeDate(1);

        const c = {
            url: `/api${$api.busInfoApi}`,
            method: "post",
            headers: {...requestKey, token: bizrt.token, acctoken: accessToken},
            data: {
                params1: {
                    serviceCode: $configuration.serviceCode,
                    source: $configuration.source,
                    target: $configuration.target,
                    uscInfo: {...$configuration.uscInfo},
                    quInfo: {userId: r.userId},
                    token: bizrt.token,
                },
                params3: {
                    data: {
                        acctId: r.userId,
                        consNo: o.consNo_dst,
                        consType: "02" == o.constType ? "02" : "01",
                        endTime: n,
                        orgNo: o.orgNo,
                        queryYear: new Date().getFullYear().toString(),
                        proCode: o.proNo || o.provinceId,
                        serialNo: "",
                        srvCode: "",
                        startTime: s,
                        userName: r.nickname ? r.nickname : r.loginAccount,
                        funcCode: $configuration.getday.funcCode,
                        channelCode: $configuration.getday.channelCode,
                        clearCache: $configuration.getday.clearCache,
                        promotCode: $configuration.getday.promotCode,
                        promotType: $configuration.getday.promotType,
                    },
                    serviceCode: $configuration.getday.serviceCode,
                    source: $configuration.getday.source,
                    target: o.proNo || o.provinceId,
                },
                params4: "010103",
            },
        };

        const t = await request(c);
        dayElecQuantity = t;
        Global.dayElecQuantity = t;

        log.info("✅ 获取日用电量成功");
        log.debug(jsonStr(t, null, 2));

        if (t.sevenEleList) store.set("dayElecQuantity", jsonStr(t));
        else if (store.get("dayElecQuantity"))
            Global.dayElecQuantity = jsonParse(store.get("dayElecQuantity"));
    } catch (e2) {
        if (store.get("dayElecQuantity"))
            Global.dayElecQuantity = jsonParse(store.get("dayElecQuantity"));
        return console.log("获取日用电量失败: " + e2);
    } finally {
        console.log("🔚 获取日用电量结束");
    }
}

async function getDay31ElecQuantity(idx) {
    console.log("⏳ 获取32日用电量...");
    try {
        const o = bindInfo.powerUserList[idx];
        const [r] = bizrt.userInfo;
        const s = getBeforeDate(32);
        const n = getBeforeDate(1);

        const c = {
            url: `/api${$api.busInfoApi}`,
            method: "post",
            headers: {...requestKey, token: bizrt.token, acctoken: accessToken},
            data: {
                params1: {
                    serviceCode: $configuration.serviceCode,
                    source: $configuration.source,
                    target: $configuration.target,
                    uscInfo: {...$configuration.uscInfo},
                    quInfo: {userId: r.userId},
                    token: bizrt.token,
                },
                params3: {
                    data: {
                        acctId: r.userId,
                        consNo: o.consNo_dst,
                        consType: "02" == o.constType ? "02" : "01",
                        endTime: n,
                        orgNo: o.orgNo,
                        queryYear: new Date().getFullYear().toString(),
                        proCode: o.proNo || o.provinceId,
                        serialNo: "",
                        srvCode: "",
                        startTime: s,
                        userName: r.nickname ? r.nickname : r.loginAccount,
                        funcCode: $configuration.getday.funcCode,
                        channelCode: $configuration.getday.channelCode,
                        clearCache: $configuration.getday.clearCache,
                        promotCode: $configuration.getday.promotCode,
                        promotType: $configuration.getday.promotType,
                    },
                    serviceCode: $configuration.getday.serviceCode,
                    source: $configuration.getday.source,
                    target: o.proNo || o.provinceId,
                },
                params4: "010103",
            },
        };

        const t = await request(c);
        dayElecQuantity31 = t;
        Global.dayElecQuantity31 = t;

        log.info("✅ 获取32日用电量成功");
        log.debug(jsonStr(t, null, 2));

        if (t.sevenEleList) store.set("dayElecQuantity31", jsonStr(t));
        else if (store.get("dayElecQuantity31"))
            Global.dayElecQuantity31 = jsonParse(store.get("dayElecQuantity31"));
    } catch (e2) {
        if (store.get("dayElecQuantity31"))
            Global.dayElecQuantity31 = jsonParse(store.get("dayElecQuantity31"));
        return console.log("获取32日用电量失败: " + e2);
    } finally {
        console.log("🔚 获取32日用电量结束");
    }
}

async function getMonthElecQuantity(idx) {
    console.log("⏳ 获取月用电量...");
    const o = bindInfo.powerUserList[idx];
    const [r] = bizrt.userInfo;
    try {
        const e = {
            url: `/api${$api.busInfoApi}`,
            method: "post",
            headers: {...requestKey, token: bizrt.token, acctoken: accessToken},
            data: {
                params1: {
                    serviceCode: $configuration.serviceCode,
                    source: $configuration.source,
                    target: $configuration.target,
                    uscInfo: {...$configuration.uscInfo},
                    quInfo: {userId: r.userId},
                    token: bizrt.token,
                },
                params3: {
                    data: {
                        acctId: r.userId,
                        consNo: o.consNo_dst,
                        consType: "02" == o.constType ? "02" : "01",
                        orgNo: o.orgNo,
                        proCode: o.proNo || o.provinceId,
                        provinceCode: o.proNo || o.provinceId,
                        queryYear: new Date().getFullYear().toString(),
                        serialNo: "",
                        srvCode: "",
                        userName: r.nickname ? r.nickname : r.loginAccount,
                        funcCode: $configuration.mouthOut.funcCode,
                        channelCode: $configuration.mouthOut.channelCode,
                        clearCache: $configuration.mouthOut.clearCache,
                        promotCode: $configuration.mouthOut.promotCode,
                        promotType: $configuration.mouthOut.promotType,
                    },
                    serviceCode: $configuration.mouthOut.serviceCode,
                    source: $configuration.mouthOut.source,
                    target: o.proNo || o.provinceId,
                },
                params4: "010102",
            },
        };

        const s = await request(e);
        monthElecQuantity = s;
        Global.monthElecQuantity = s;

        log.info("✅ 获取月用电量成功");
        log.debug(jsonStr(s, null, 2));

        if (s.mothEleList) store.set("monthElecQuantity", jsonStr(s));
        else if (store.get("monthElecQuantity"))
            Global.monthElecQuantity = jsonParse(store.get("monthElecQuantity"));
    } catch (e2) {
        if (store.get("monthElecQuantity"))
            Global.monthElecQuantity = jsonParse(store.get("monthElecQuantity"));
        return console.log(`获取月用电量失败: ${e2}`);
    } finally {
        console.log("🔚 获取月用电量结束");
    }
}

async function getLastYearElecQuantity(idx) {
    console.log("⏳ 获取去年用电量...");
    const o = bindInfo.powerUserList[idx];
    const [r] = bizrt.userInfo;
    try {
        const e = {
            url: `/api${$api.busInfoApi}`,
            method: "post",
            headers: {...requestKey, token: bizrt.token, acctoken: accessToken},
            data: {
                params1: {
                    serviceCode: $configuration.serviceCode,
                    source: $configuration.source,
                    target: $configuration.target,
                    uscInfo: {...$configuration.uscInfo},
                    quInfo: {userId: r.userId},
                    token: bizrt.token,
                },
                params3: {
                    data: {
                        acctId: r.userId,
                        consNo: o.consNo_dst,
                        consType: "02" == o.constType ? "02" : "01",
                        orgNo: o.orgNo,
                        proCode: o.proNo || o.provinceId,
                        provinceCode: o.proNo || o.provinceId,
                        queryYear: (new Date().getFullYear() - 1).toString(),
                        serialNo: "",
                        srvCode: "",
                        userName: r.nickname ? r.nickname : r.loginAccount,
                        funcCode: $configuration.mouthOut.funcCode,
                        channelCode: $configuration.mouthOut.channelCode,
                        clearCache: $configuration.mouthOut.clearCache,
                        promotCode: $configuration.mouthOut.promotCode,
                        promotType: $configuration.mouthOut.promotType,
                    },
                    serviceCode: $configuration.mouthOut.serviceCode,
                    source: $configuration.mouthOut.source,
                    target: o.proNo || o.provinceId,
                },
                params4: "010102",
            },
        };

        const s = await request(e);
        lastYearElecQuantity = s;
        Global.lastYearElecQuantity = s;

        log.info("✅ 获取去年电量成功");
        log.debug(jsonStr(s, null, 2));

        if (s.dataInfo) store.set("lastYearElecQuantity", jsonStr(s));
        else if (store.get("lastYearElecQuantity"))
            Global.lastYearElecQuantity = jsonParse(store.get("lastYearElecQuantity"));
    } catch (e2) {
        if (store.get("lastYearElecQuantity"))
            Global.lastYearElecQuantity = jsonParse(store.get("lastYearElecQuantity"));
        return console.log(`获取去年电量失败: ${e2}`);
    } finally {
        console.log("🔚 获取去年用电量结束");
    }
}

async function getSegmentDate(user, dateObj) {
    console.log("⏳ 江苏地区特殊处理...");
    try {
        const r = {
            url: `/api${$api.segmentDate}`,
            method: "post",
            headers: {...requestKey, token: bizrt.token, acctoken: accessToken},
            data: {
                data: {
                    acctId: "acctid01",
                    channelCode: "SGAPP",
                    consNo: user.consNo_dst,
                    funcCode: "A10079078",
                    promotCode: "1",
                    promotType: "1",
                    provinceCode: "32101",
                    serialNo: "",
                    srvCode: "123",
                    userName: "acctid01",
                    year: dateObj.year,
                },
                serviceCode: "0101798",
                source: "app",
                target: user.proNo,
            },
        };

        const s = await request(r);
        log.info("✅ 江苏地区特殊处理成功");
        log.debug(jsonStr(s, null, 2));

        let t = s.billList || [];
        return t[t.length - 1];
    } catch (e2) {
        throw new Error(`江苏地区特殊处理失败: ${e2}`);
    } finally {
        console.log("🔚 江苏地区特殊处理结束");
    }
}

async function getStepElecQuantity(idx, months) {
    console.log("⏳ 获取阶梯用电...");
    try {
        const o = bindInfo.powerUserList[idx];
        const [r] = bizrt.userInfo;

        let s = new Date();
        let t = {year: s.getFullYear(), months: months || s.getMonth()};
        let n = "";
        let c = "";
        let a = t.months;
        a <= 9 ? (n = t.year + "-0" + a) : (n = t.year + "-" + a);

        let i = "";
        if ("32101" === o.proNo) {
            c = await getSegmentDate(o, t);
            i = t.year + "-" + a;
        } else {
            i = n;
        }

        const m = {
            url: `/api/${
                "33101" == (o.orgNo || o.provinceId)
                    ? "01" == o.constType
                        ? $api.HideelectBill
                        : $api.LowelectBill
                    : $api.electBill
            }`,
            method: "post",
            headers: {...requestKey, token: bizrt.token, acctoken: accessToken},
            data: {
                data: {
                    channelCode: $configuration.stepelect.channelCode,
                    funcCode: $configuration.stepelect.funcCode,
                    promotType: $configuration.stepelect.promotType,
                    clearCache: $configuration.stepelect.clearCache,
                    consNo: o.consNo_dst,
                    promotCode: o.proNo || o.provinceId,
                    orgNo: o.orgNo,
                    queryDate: i,
                    provinceCode: o.proNo || o.provinceId,
                    consType: o.constType || o.consSortCode,
                    userAccountId: r.userId,
                    serialNo: "",
                    srvCode: "",
                    calcId: c ? c.calcId : void 0,
                    userName: r.nickname || r.loginAccount,
                    acctId: r.userId,
                },
                serviceCode: $configuration.stepelect.serviceCode,
                source: $configuration.stepelect.source,
                target: o.proNo || o.provinceId,
            },
        };

        const g = await request(m);
        log.info("✅ 获取阶梯用电成功");
        log.debug(jsonStr(g, null, 2));

        if ("1" !== g.rtnCode) return Promise.reject(g.rtnMsg);

        stepElecQuantity = g.list || {};
        Global.stepElecQuantity = stepElecQuantity;

        if (stepElecQuantity.sevenEleList) store.set("stepElecQuantity", jsonStr(stepElecQuantity));
        else if (store.get("stepElecQuantity"))
            Global.stepElecQuantity = jsonParse(store.get("stepElecQuantity"));
    } catch (e2) {
        if (store.get("stepElecQuantity"))
            Global.stepElecQuantity = jsonParse(store.get("stepElecQuantity"));
        return console.log(`获取阶梯用电失败: ${e2}`);
    } finally {
        console.log("🔚 获取阶梯用电结束");
    }
}

function getDataSource(idx) {
    const params = getUrlParams($request.url);
    if (!Object.keys(params).length) {
        return Promise.all([
            getElcFee(idx),
            getDayElecQuantity(idx),
            getDay31ElecQuantity(idx),
            getMonthElecQuantity(idx),
            getLastYearElecQuantity(idx),
            getStepElecQuantity(idx),
        ]);
    }

    const requestData = [];
    if (params.eleBill) requestData.push(getElcFee(idx));
    if (params.dayElecQuantity) requestData.push(getDayElecQuantity(idx));
    if (params.dayElecQuantity31) requestData.push(getDay31ElecQuantity(idx));
    if (params.monthElecQuantity) requestData.push(getMonthElecQuantity(idx));
    if (params.lastYearElecQuantity) requestData.push(getLastYearElecQuantity(idx));
    if (params.stepElecQuantity) requestData.push(getStepElecQuantity(idx));
    return Promise.all(requestData);
}

(async () => {
    console.log(`✅ WSGW 脚本已触发 | ENV=${ENV} | url=${typeof $request !== "undefined" ? $request.url : "no $request"}`);

    await showNotice();

    // 仅提示：notifyType / recentElcFee 你要在 BoxJs 配；脚本逻辑里暂不强制使用
    log.debug(`⚙️ notifyType=${NOTIFY_TYPE} recentElcFee=${RECENT_ELC_FEE}`);

    if (!USERNAME || !PASSWORD) {
        await sendMsg(
            SCRIPTNAME,
            "请先在 BoxJs 配置 phoneNum/password!",
            "点击前往BoxJs配置",
            {
                "open-url":
                    "http://boxjs.com/#/sub/add/https%3A%2F%2Fraw.githubusercontent.com%2FYuheng0101%2FX%2Fmain%2FTasks%2Fboxjs.json",
            }
        );

        const resp = {
            status: isQuanX() ? "HTTP/1.1 200" : 200,
            headers: { "content-type": "application/json;charset=utf8" },
            body: jsonStr({ ok: false, error: "Missing phoneNum/password" }),
        };
        return safeDone(isQuanX() ? resp : { response: resp });
    }

    await getKeyCode();

    // 有缓存就用缓存，否则登录
    if (!(bizrt?.token && bizrt?.userInfo)) await doLogin();

    await getAuthcode();
    await getAccessToken();
    await getBindInfo();

    const result = new Array(bindInfo.powerUserList.length);

    for (let i = 0; i < bindInfo.powerUserList.length; i++) {
        try {
            await getDataSource(i);
        } catch (error) {
            let months = new Date().getMonth() - 1;
            if (months === -1) months = 11;
            await getStepElecQuantity(i, months);
        }

        const user = bindInfo.powerUserList[i];
        const arrears =
            Number(Global.eleBill?.historyOwe || "0") > 0 ||
            Number(Global.eleBill?.sumMoney || "0") < 0;

        result[i] = {
            eleBill: Global.eleBill,
            userInfo: user,
            dayElecQuantity: Global.dayElecQuantity,
            dayElecQuantity31: Global.dayElecQuantity31,
            monthElecQuantity: Global.monthElecQuantity,
            lastYearElecQuantity: Global.lastYearElecQuantity,
            stepElecQuantity: Global.stepElecQuantity,
            arrearsOfFees: arrears,
        };
    }

    const resp = {
        status: isQuanX() ? "HTTP/1.1 200" : 200,
        headers: { "content-type": "application/json;charset=utf8" },
        body: jsonStr(result),
    };

      safeDone(isQuanX() ? resp : { response: resp });
    })()
      .catch((e) => {
        const err = String(e);

        /无效|失效|过期|重新获取|请求异常/.test(err) &&
          (clearCache("bizrt"), console.log("✅ 清理缓存 bizrt 成功"));

        log.error(err);

        const resp = {
          status: isQuanX() ? "HTTP/1.1 500" : 500,
          headers: { "content-type": "application/json;charset=utf8" },
          body: jsonStr({ ok: false, error: err }),
        };
        safeDone(isQuanX() ? resp : { response: resp });
      })
      .finally(() => {
        // ✅ 这里只做收尾日志，不再 safeDone，避免二次 done
        console.log("🔚 WSGW 脚本结束");
      });