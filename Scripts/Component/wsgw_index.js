/******************************************
 * @name 网上国网（95598）组件服务 - 数据接口
 * @description 通过网上国网账号密码登录，聚合电费/电量/阶梯等数据，供小组件读取
 *
 * BoxJs Keys（仅新 Key｜全带 @｜Settings 风格）:
 * - @ComponentService.SGCC.Settings.phoneNum
 * - @ComponentService.SGCC.Settings.password
 * - @ComponentService.SGCC.Settings.logDebug
 *
 * Rewrite:
 * ^https?:\/\/api\.wsgw-rewrite\.com\/electricity\/bill\/all
 ******************************************/

const ENV = (() => {
    if (typeof $environment !== "undefined" && $environment["surge-version"]) return "Surge"
    if (typeof $environment !== "undefined" && $environment["stash-version"]) return "Stash"
    if (typeof $loon !== "undefined") return "Loon"
    if (typeof $task !== "undefined") return "QuantumultX"
    if (typeof $rocket !== "undefined") return "Shadowrocket"
    if (typeof process !== "undefined" && process.release && process.release.name === "node") return "Node"
    return "Unknown"
})()

const isQX = ENV === "QuantumultX"

class Store {
    constructor(namespace = "ComponentService") {
        this.namespace = namespace
        this.env = ENV
        if (this.env === "Node") {
            const {LocalStorage} = require("node-localstorage")
            this.localStorage = new LocalStorage(`./store/${namespace}`)
        }
    }

    get(key) {
        switch (this.env) {
            case "Surge":
            case "Loon":
            case "Stash":
            case "Shadowrocket":
                return $persistentStore.read(key)
            case "QuantumultX":
                return $prefs.valueForKey(key)
            case "Node":
                return this.localStorage.getItem(key)
            default:
                return null
        }
    }
}

class Logger {
    constructor(prefix, debug = false) {
        this.prefix = prefix;
        this.debugEnabled = !!debug
    }

    info(...a) {
        console.log(`[${this.prefix}] ${a.join(" ")}`)
    }

    warn(...a) {
        console.log(`[${this.prefix}] [WARN] ${a.join(" ")}`)
    }

    error(...a) {
        console.log(`[${this.prefix}] [ERROR] ${a.join(" ")}`)
    }

    debug(...a) {
        if (this.debugEnabled) console.log(`[${this.prefix}] [DEBUG] ${a.join(" ")}`)
    }
}

function notify(title = "", sub = "", body = "", opts = {}) {
    const build = (o) => {
        const open = o.openUrl || o.url || o["open-url"]
        if (!open) return o
        if (ENV === "QuantumultX") return {"open-url": open}
        if (ENV === "Loon") return {openUrl: open}
        return {url: open}
    }
    try {
        if (ENV === "QuantumultX") $notify(title, sub, body, build(opts))
        else $notification.post(title, sub, body, build(opts))
    } catch {
    }
    console.log(`\n==============📣系统通知📣==============\n${title}\n${sub}\n${body}\n`)
}

function done(payload = {}) {
    $done(payload)
}

async function http(request) {
    const method = (request.method || "GET").toUpperCase()
    const lower = method.toLowerCase()
    if (request.headers) {
        delete request.headers["Content-Length"]
        delete request.headers["content-length"]
    }
    if (ENV === "QuantumultX") {
        return $task.fetch(request).then(
            (r) => {
                r.status = r.statusCode
                r.ok = /^2\d\d$/.test(String(r.statusCode))
                return r
            },
            (e) => Promise.reject(e.error || e)
        )
    }
    return new Promise((resolve, reject) => {
        $httpClient[lower](request, (err, resp, data) => {
            if (err) return reject(err)
            resp.status = resp.statusCode || resp.status
            resp.ok = /^2\d\d$/.test(String(resp.status))
            resp.body = data
            resolve(resp)
        })
    })
}

function safeJsonParse(s, fallback = null) {
    try {
        return JSON.parse(s)
    } catch {
        return fallback
    }
}

function safeJsonStringify(o) {
    try {
        return JSON.stringify(o)
    } catch {
        return String(o)
    }
}

function getUrlParams(url) {
    const q = (url.split("?")[1] || "").trim()
    if (!q) return {}
    const out = {}
    q.split("&").forEach((kv) => {
        const [k, v = ""] = kv.split("=")
        if (!k) return
        out[decodeURIComponent(k)] = decodeURIComponent(v)
    })
    return out
}

/* ===========================
 *  业务配置
 * =========================== */

const SCRIPTNAME = "网上国网"
const store = new Store("ComponentService")

// ✅ 统一 Settings 风格 Key（全带 @）
const KEY_PHONE = "@ComponentService.SGCC.Settings.phoneNum"
const KEY_PASS = "@ComponentService.SGCC.Settings.password"
const KEY_DEBUG = "@ComponentService.SGCC.Settings.logDebug"

// ✅ BoxJs 常见“总 Key = 大 JSON”存储（你现在就是这种）
const ROOT_KEY_1 = "ComponentService"
const ROOT_KEY_2 = "@ComponentService"

function getByPath(obj, path) {
    if (!obj || !path) return null
    return path.split(".").reduce((acc, k) => (acc && acc[k] != null ? acc[k] : null), obj)
}

/**
 * 优先读扁平新 Key；读不到就从 Root JSON 里按路径拿（兼容 BoxJs 大 JSON）
 * rootPath 示例：SGCC.Settings.phoneNum
 */
function readSetting(flatKey, rootPath) {
    const v1 = store.get(flatKey)
    if (v1 != null && String(v1).trim() !== "") return String(v1)

    const raw = store.get(ROOT_KEY_1) || store.get(ROOT_KEY_2)
    if (!raw) return ""

    const root = safeJsonParse(raw, null)
    if (!root) return ""

    // 你现在结构里同时有 SGCC.phoneNum 和 SGCC.Settings.phoneNum，这里都兜底
    const v2 =
        getByPath(root, rootPath) ??
        getByPath(root, rootPath.replace(".Settings.", "."))

    return v2 == null ? "" : String(v2)
}

const DEBUG_RAW = readSetting(KEY_DEBUG, "SGCC.Settings.logDebug").trim()
const DEBUG = DEBUG_RAW === "true" || DEBUG_RAW === "1"
const log = new Logger(SCRIPTNAME, DEBUG)

const USERNAME = readSetting(KEY_PHONE, "SGCC.Settings.phoneNum").trim()
const PASSWORD = readSetting(KEY_PASS, "SGCC.Settings.password").trim()

// 🔎 方便排障：到底从哪里读到的
log.debug("ENV =", ENV)
log.debug("Flat phone =", store.get(KEY_PHONE) ? "[SET]" : "[EMPTY]")
log.debug("Flat pass  =", store.get(KEY_PASS) ? "[SET]" : "[EMPTY]")
log.debug("Root JSON  =", (store.get(ROOT_KEY_1) || store.get(ROOT_KEY_2)) ? "[SET]" : "[EMPTY]")
log.debug("Resolved phone =", USERNAME ? "[OK]" : "[EMPTY]")
log.debug("Resolved pass  =", PASSWORD ? "[OK]" : "[EMPTY]")

const SERVER_HOST = "https://api.120399.xyz"
const BASE_URL = "https://www.95598.cn"

const API = {
    getKeyCode: "/oauth2/outer/c02/f02",
    loginVerifyCodeNew: "/osg-web0004/open/c44/f05",
    loginTestCodeNew: "/osg-web0004/open/c44/f06",
    getAuth: "/oauth2/oauth/authorize",
    getWebToken: "/oauth2/outer/getWebToken",
    searchUser: "/osg-open-uc0001/member/c9/f02",
    accapi: "/osg-open-bc0001/member/c05/f01",
    busInfoApi: "/osg-web0004/member/c24/f01",
    electBill: "/osg-open-bc0001/member/c04/f03",
    LowelectBill: "/osg-open-bc0001/member/c04/f01",
    HideelectBill: "/osg-open-bc0001/member/c04/f02",
    mouthOutFunc: {
        funcCode: "WEBALIPAY_01",
        channelCode: "0902",
        clearCache: "11",
        promotCode: "1",
        promotType: "1",
        serviceCode: "BCP_000026",
        source: "app"
    },
    getdayFunc: {
        funcCode: "WEBALIPAY_01",
        channelCode: "0902",
        clearCache: "11",
        promotCode: "1",
        promotType: "1",
        serviceCode: "BCP_000026",
        source: "app"
    },
    accountFunc: {channelCode: "0902", funcCode: "WEBA1007200"}
}

const CFG = {
    source: "SGAPP",
    target: "32101",
    uscInfo: {member: "0902", devciceIp: "", devciceId: "", tenant: "state_grid"},
    userInformServiceCode: "0101183",
    stepelect: {
        channelCode: "0902",
        funcCode: "WEBALIPAY_01",
        promotType: "1",
        clearCache: "09",
        serviceCode: "BCP_000026",
        source: "app"
    }
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms))
}

/* ===========================
 *  加解密请求封装（增强：失败信息 + 重试）
 * =========================== */

async function Encrypt(config) {
    const r = await http(config)
    const j = safeJsonParse(r.body, null)
    if (!j || !j.data || !j.data.url) throw new Error("Encrypt: invalid response")
    j.data.url = BASE_URL + j.data.url
    j.data.body = safeJsonStringify(j.data.data)
    delete j.data.data
    return j.data
}

async function Decrypt(config) {
    const r = await http(config)
    const j = safeJsonParse(r.body, null)
    if (!j || !j.data) {
        // 兜底：把原始 body 打出来
        throw new Error(`Decrypt: invalid response: ${String(r.body || "").slice(0, 200)}`)
    }

    const {code, message, data} = j.data
    if (String(code) === "1") return data

    // ✅ 关键：把 code/message 都带出来，debug 时更好判断
    const msg = message || "Decrypt failed"
    throw new Error(`${msg}${code ? `（code=${code}）` : ""}`)
}

async function request95598(reqCfg) {
    const encCfg = {
        url: `${SERVER_HOST}/wsgw/encrypt`,
        method: "POST",
        headers: {"content-type": "application/json"},
        body: safeJsonStringify({yuheng: reqCfg})
    }
    const enc = await Encrypt(encCfg)

    const res = await http(enc)
    let parsed = safeJsonParse(res.body, null)
    if (!parsed) parsed = res.body

    const payload = {config: {...reqCfg}, data: parsed}
    if (reqCfg.url === "/api" + API.getKeyCode) payload.config.headers = {encryptKey: enc.encryptKey}

    const decCfg = {
        url: `${SERVER_HOST}/wsgw/decrypt`,
        method: "POST",
        headers: {"content-type": "application/json"},
        body: safeJsonStringify({yuheng: payload})
    }
    return Decrypt(decCfg)
}

// ✅ 新增：对 GB002/系统繁忙类错误做重试
async function request95598WithRetry(reqCfg, opt = {}) {
    const {
        retries = 3,
        baseDelayMs = 450,
        jitterMs = 250
    } = opt

    let lastErr = null
    for (let i = 0; i <= retries; i++) {
        try {
            // 轻微随机抖动，避免踩相同风控窗口
            if (i > 0) await sleep(baseDelayMs * i + Math.floor(Math.random() * jitterMs))
            return await request95598(reqCfg)
        } catch (e) {
            const msg = String(e && e.message ? e.message : e)
            lastErr = e

            // 只对“值得重试”的错误重试
            const retryable =
                msg.includes("GB002") ||
                msg.includes("系统繁忙") ||
                msg.includes("网络") ||
                msg.includes("超时") ||
                msg.includes("请求异常")

            log.warn(`request95598 failed [${i + 1}/${retries + 1}]`, msg)

            if (!retryable) break
            if (i === retries) break
        }
    }
    throw lastErr || new Error("request95598WithRetry failed")
}

async function recognizeCaptcha(canvasSrc) {
    const cfg = {
        url: `${SERVER_HOST}/wsgw/get_x`,
        method: "POST",
        headers: {"content-type": "application/json"},
        body: safeJsonStringify({yuheng: canvasSrc})
    }
    const r = await http(cfg)
    const j = safeJsonParse(r.body, null)
    if (!j || !j.data) throw new Error("验证码识别失败")
    return j.data
}

function getBeforeDate(days) {
    const d = new Date()
    d.setDate(d.getDate() - days)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/* ===========================
 *  登录链路
 * =========================== */

let requestKey = null
let bizrt = null
let authorizecode = ""
let accessToken = ""
let bindInfo = null

async function getKeyCode() {
    log.info("⏳ 获取 keyCode/publicKey ...")
    requestKey = await request95598WithRetry(
        {url: `/api${API.getKeyCode}`, method: "POST", headers: {}},
        {retries: 2}
    )
}

async function getVerifyCode() {
    log.info("⏳ 获取验证码凭证 ...")
    const r = await request95598WithRetry(
        {
            url: `/api${API.loginVerifyCodeNew}`,
            method: "POST",
            headers: {...requestKey},
            data: {password: PASSWORD, account: USERNAME, canvasHeight: 200, canvasWidth: 310}
        },
        {retries: 4, baseDelayMs: 500}
    )

    if (!r || !r.ticket || !r.canvasSrc) {
        log.warn("verifyCode resp:", safeJsonStringify(r).slice(0, 200))
        throw new Error("验证码凭证为空")
    }

    const code = await recognizeCaptcha(r.canvasSrc)
    return {ticket: r.ticket, code}
}

async function login(ticket, code) {
    log.info("⏳ 登录中 ...")
    const r = await request95598WithRetry(
        {
            url: `/api${API.loginTestCodeNew}`,
            method: "POST",
            headers: {...requestKey},
            data: {
                loginKey: ticket,
                code,
                params: {
                    uscInfo: {devciceIp: "", tenant: "state_grid", member: "0902", devciceId: ""},
                    quInfo: {
                        optSys: "android",
                        pushId: "000000",
                        addressProvince: "110100",
                        addressRegion: "110101",
                        addressCity: "330100",
                        password: PASSWORD,
                        account: USERNAME
                    }
                },
                Channels: "web"
            }
        },
        {retries: 2, baseDelayMs: 600}
    )

    if (!r || !r.bizrt || !(r.bizrt.userInfo && r.bizrt.userInfo.length)) {
        throw new Error("登录失败：账号/密码/验证码可能不正确")
    }
    bizrt = r.bizrt
}

async function getAuthcode() {
    log.info("⏳ 获取授权码 ...")
    const r = await request95598({
        url: `/api${API.getAuth}`,
        method: "POST",
        headers: {...requestKey, token: bizrt.token}
    })
    const redirect = r && r.redirect_url
    if (!redirect || redirect.indexOf("code=") === -1) throw new Error("授权码获取失败：redirect_url 异常")
    authorizecode = redirect.split("code=")[1]
}

async function getAccessToken() {
    log.info("⏳ 获取 accessToken ...")
    const r = await request95598({
        url: `/api${API.getWebToken}`,
        method: "POST",
        headers: {...requestKey, token: bizrt.token, authorizecode}
    })
    accessToken = r && r.access_token
    if (!accessToken) throw new Error("accessToken 为空")
}

async function getBindInfo() {
    log.info("⏳ 查询绑定户号 ...")
    const [u] = bizrt.userInfo
    const r = await request95598({
        url: `/api${API.searchUser}`,
        method: "POST",
        headers: {...requestKey, token: bizrt.token, acctoken: accessToken},
        data: {
            serviceCode: CFG.userInformServiceCode,
            source: CFG.source,
            target: CFG.target,
            uscInfo: CFG.uscInfo,
            quInfo: {userId: u.userId},
            token: bizrt.token,
            Channels: "web"
        }
    })
    bindInfo = r && r.bizrt
    if (!bindInfo || !bindInfo.powerUserList || !bindInfo.powerUserList.length) throw new Error("未获取到绑定户号")
}

/* ===========================
 *  数据查询
 * =========================== */

async function getElcFee(index) {
    const o = bindInfo.powerUserList[index]
    const [u] = bizrt.userInfo
    const r = await request95598({
        url: `/api${API.accapi}`,
        method: "POST",
        headers: {...requestKey, token: bizrt.token, acctoken: accessToken},
        data: {
            data: {
                srvCode: "",
                serialNo: "",
                channelCode: API.accountFunc.channelCode,
                funcCode: API.accountFunc.funcCode,
                acctId: u.userId,
                userName: u.loginAccount || u.nickname,
                promotType: "1",
                promotCode: "1",
                userAccountId: u.userId,
                list: [{
                    consNoSrc: o.consNo_dst,
                    proCode: o.proNo,
                    sceneType: o.constType,
                    consNo: o.consNo,
                    orgNo: o.orgNo
                }]
            },
            serviceCode: "0101143",
            source: CFG.source,
            target: o.proNo || o.provinceId
        }
    })
    return (r && r.list && r.list[0]) || {}
}

async function getDayElecQuantity(index, days = 6) {
    const o = bindInfo.powerUserList[index]
    const [u] = bizrt.userInfo
    const startTime = getBeforeDate(days)
    const endTime = getBeforeDate(1)

    return request95598({
        url: `/api${API.busInfoApi}`,
        method: "POST",
        headers: {...requestKey, token: bizrt.token, acctoken: accessToken},
        data: {
            params1: {
                serviceCode: "",
                source: CFG.source,
                target: CFG.target,
                uscInfo: CFG.uscInfo,
                quInfo: {userId: u.userId},
                token: bizrt.token
            },
            params3: {
                data: {
                    acctId: u.userId,
                    consNo: o.consNo_dst,
                    consType: (o.constType === "02" ? "02" : "01"),
                    endTime,
                    orgNo: o.orgNo,
                    queryYear: String(new Date().getFullYear()),
                    proCode: o.proNo || o.provinceId,
                    serialNo: "",
                    srvCode: "",
                    startTime,
                    userName: u.nickname || u.loginAccount,
                    funcCode: API.getdayFunc.funcCode,
                    channelCode: API.getdayFunc.channelCode,
                    clearCache: API.getdayFunc.clearCache,
                    promotCode: API.getdayFunc.promotCode,
                    promotType: API.getdayFunc.promotType
                },
                serviceCode: API.getdayFunc.serviceCode,
                source: API.getdayFunc.source,
                target: o.proNo || o.provinceId
            },
            params4: "010103"
        }
    })
}

async function getMonthElecQuantity(index, yearOffset = 0) {
    const o = bindInfo.powerUserList[index]
    const [u] = bizrt.userInfo
    const queryYear = String(new Date().getFullYear() + yearOffset)

    return request95598({
        url: `/api${API.busInfoApi}`,
        method: "POST",
        headers: {...requestKey, token: bizrt.token, acctoken: accessToken},
        data: {
            params1: {
                serviceCode: "",
                source: CFG.source,
                target: CFG.target,
                uscInfo: CFG.uscInfo,
                quInfo: {userId: u.userId},
                token: bizrt.token
            },
            params3: {
                data: {
                    acctId: u.userId,
                    consNo: o.consNo_dst,
                    consType: (o.constType === "02" ? "02" : "01"),
                    orgNo: o.orgNo,
                    proCode: o.proNo || o.provinceId,
                    provinceCode: o.proNo || o.provinceId,
                    queryYear,
                    serialNo: "",
                    srvCode: "",
                    userName: u.nickname || u.loginAccount,
                    funcCode: API.mouthOutFunc.funcCode,
                    channelCode: API.mouthOutFunc.channelCode,
                    clearCache: API.mouthOutFunc.clearCache,
                    promotCode: API.mouthOutFunc.promotCode,
                    promotType: API.mouthOutFunc.promotType
                },
                serviceCode: API.mouthOutFunc.serviceCode,
                source: API.mouthOutFunc.source,
                target: o.proNo || o.provinceId
            },
            params4: "010102"
        }
    })
}

async function getStepElecQuantity(index, monthOverride) {
    const o = bindInfo.powerUserList[index]
    const [u] = bizrt.userInfo

    const now = new Date()
    const year = now.getFullYear()
    const m0 = (typeof monthOverride === "number" ? monthOverride : now.getMonth()) // 0-11
    const m1 = Math.max(1, Math.min(12, m0 + 1)) // 1-12
    const queryDate = `${year}-${String(m1).padStart(2, "0")}`

    const apiPath =
        (String(o.orgNo || o.provinceId) === "33101")
            ? (String(o.constType) === "01" ? API.HideelectBill : API.LowelectBill)
            : API.electBill

    const r = await request95598({
        url: `/api${apiPath}`,
        method: "POST",
        headers: {...requestKey, token: bizrt.token, acctoken: accessToken},
        data: {
            data: {
                channelCode: CFG.stepelect.channelCode,
                funcCode: CFG.stepelect.funcCode,
                promotType: CFG.stepelect.promotType,
                clearCache: CFG.stepelect.clearCache,
                consNo: o.consNo_dst,
                promotCode: o.proNo || o.provinceId,
                orgNo: o.orgNo || "",
                queryDate,
                provinceCode: o.proNo || o.provinceId,
                consType: o.constType || o.consSortCode,
                userAccountId: u.userId,
                serialNo: "",
                srvCode: "",
                userName: u.nickname || u.loginAccount,
                acctId: u.userId
            },
            serviceCode: CFG.stepelect.serviceCode,
            source: CFG.stepelect.source,
            target: o.proNo || o.provinceId
        }
    })

    if (r && r.rtnCode && String(r.rtnCode) !== "1") throw new Error(r.rtnMsg || "阶梯用电查询失败")
    return r
}

async function getDataSourceByParams(index) {
    const params = getUrlParams($request && $request.url ? $request.url : "")
    if (!params || !Object.keys(params).length) {
        const [eleBill, dayElecQuantity, dayElecQuantity31, monthElecQuantity, lastYearElecQuantity, stepElecQuantity] = await Promise.all([
            getElcFee(index),
            getDayElecQuantity(index, 6),
            getDayElecQuantity(index, 32),
            getMonthElecQuantity(index, 0),
            getMonthElecQuantity(index, -1),
            getStepElecQuantity(index)
        ])
        return {eleBill, dayElecQuantity, dayElecQuantity31, monthElecQuantity, lastYearElecQuantity, stepElecQuantity}
    }

    const tasks = []
    const out = {}
    if (params.eleBill) tasks.push(getElcFee(index).then(v => out.eleBill = v))
    if (params.dayElecQuantity) tasks.push(getDayElecQuantity(index, 6).then(v => out.dayElecQuantity = v))
    if (params.dayElecQuantity31) tasks.push(getDayElecQuantity(index, 32).then(v => out.dayElecQuantity31 = v))
    if (params.monthElecQuantity) tasks.push(getMonthElecQuantity(index, 0).then(v => out.monthElecQuantity = v))
    if (params.lastYearElecQuantity) tasks.push(getMonthElecQuantity(index, -1).then(v => out.lastYearElecQuantity = v))
    if (params.stepElecQuantity) tasks.push(getStepElecQuantity(index).then(v => out.stepElecQuantity = v))

    await Promise.all(tasks)
    return out
}

/* ===========================
 *  主流程
 * =========================== */

;(async () => {
    if (!USERNAME || !PASSWORD) {
        notify(
            SCRIPTNAME,
            "请先在 BoxJs 配置账号密码",
            `需要：${KEY_PHONE} / ${KEY_PASS}`,
            {url: "http://boxjs.com/#/app"}
        )
        throw new Error("账号密码未配置")
    }

    await getKeyCode()
    const {ticket, code} = await getVerifyCode()
    await login(ticket, code)
    await getAuthcode()
    await getAccessToken()
    await getBindInfo()

    const list = bindInfo.powerUserList || []
    const result = new Array(list.length)

    for (let i = 0; i < list.length; i++) {
        let data = {}
        try {
            data = await getDataSourceByParams(i)
        } catch (e) {
            log.warn(`户号[${i}] 部分数据失败，尝试回退阶梯月份：`, String(e))
            let m = new Date().getMonth() - 1
            if (m < 0) m = 11
            data.stepElecQuantity = await getStepElecQuantity(i, m)
        }

        const userInfo = list[i]
        const eleBill = data.eleBill || {}
        const arrears = Number(eleBill.historyOwe || "0") > 0 || Number(eleBill.sumMoney || "0") < 0

        result[i] = {
            eleBill,
            userInfo,
            dayElecQuantity: data.dayElecQuantity || {},
            dayElecQuantity31: data.dayElecQuantity31 || {},
            monthElecQuantity: data.monthElecQuantity || {},
            lastYearElecQuantity: data.lastYearElecQuantity || {},
            stepElecQuantity: data.stepElecQuantity || {},
            arrearsOfFees: arrears
        }
    }

    const resp = {
        status: isQX ? "HTTP/1.1 200" : 200,
        headers: {"content-type": "application/json;charset=utf-8"},
        body: safeJsonStringify(result)
    }
    done(isQX ? resp : {response: resp})
})().catch((e) => {
    log.error(String(e))
    const resp = {
        status: isQX ? "HTTP/1.1 200" : 200,
        headers: {"content-type": "application/json;charset=utf-8"},
        body: "[]"
    }
    done(isQX ? resp : {response: resp})
})
