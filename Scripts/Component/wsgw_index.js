/******************************************
 * @name 网上国网（95598）组件服务 - 数据接口（登录态版｜Authorization 兜底）
 * @description 使用官方 App 抓取到的 token/acctoken/userId（或 Authorization），聚合电费/电量/阶梯等数据
 *
 * BoxJs Keys（仅新 Key｜全带 @｜Settings 风格）:
 * - @ComponentService.SGCC.Settings.token
 * - @ComponentService.SGCC.Settings.acctoken
 * - @ComponentService.SGCC.Settings.userId
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
const isNode = ENV === "Node"

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

    set(key, val) {
        const v = val == null ? "" : String(val)
        switch (this.env) {
            case "Surge":
            case "Loon":
            case "Stash":
            case "Shadowrocket":
                return $persistentStore.write(v, key)
            case "QuantumultX":
                return $prefs.setValueForKey(v, key)
            case "Node":
                this.localStorage.setItem(key, v)
                return true
            default:
                return false
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
    if (ENV === "Node") process.exit(0)
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

    if (ENV === "Node") {
        const got = require("got")
        const {url, ...opt} = request
        return got[lower](url, opt).then(
            (r) => ({status: r.statusCode, ok: /^2\d\d$/.test(String(r.statusCode)), body: r.body}),
            (e) => Promise.reject(e.message || e)
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
 *  BoxJs 读值：直读 @Key + 读 root JSON 双通道
 * =========================== */

const store = new Store("ComponentService")

function readRootJSON() {
    const raw = store.get("ComponentService")
    const j = safeJsonParse(raw, null)
    return j && typeof j === "object" ? j : {}
}

function readSetting(pathKey) {
    const flatKey = `@ComponentService.SGCC.Settings.${pathKey}`
    const flat = store.get(flatKey)
    if (flat != null && String(flat).trim() !== "") return String(flat)

    const root = readRootJSON()
    const v = root && root.SGCC && root.SGCC.Settings ? root.SGCC.Settings[pathKey] : null
    return v == null ? "" : String(v)
}

function stripBearer(v) {
    const s = String(v || "").trim()
    if (!s) return ""
    return s.replace(/^Bearer\s+/i, "").trim()
}

function base64UrlDecode(input) {
    try {
        let s = String(input || "")
        s = s.replace(/-/g, "+").replace(/_/g, "/")
        const pad = s.length % 4
        if (pad) s += "=".repeat(4 - pad)
        const raw = (typeof atob !== "undefined") ? atob(s) : Buffer.from(s, "base64").toString("binary")
        let out = ""
        for (let i = 0; i < raw.length; i++) out += String.fromCharCode(raw.charCodeAt(i))
        try {
            return decodeURIComponent(escape(out))
        } catch {
            return out
        }
    } catch {
        return ""
    }
}

function tryDecodeJwtUserId(token) {
    const t = stripBearer(token)
    const parts = t.split(".")
    if (parts.length < 2) return ""
    const payloadText = base64UrlDecode(parts[1])
    const payload = safeJsonParse(payloadText, null)
    if (!payload || typeof payload !== "object") return ""
    const cand = ["userId", "userid", "user_id", "uid", "memberId", "acctId", "sub"]
    for (const k of cand) {
        if (payload[k] != null && String(payload[k]).trim() !== "") return String(payload[k])
    }
    return ""
}

/* ===========================
 *  业务配置
 * =========================== */

const SCRIPTNAME = "网上国网"

const KEY_TOKEN = "@ComponentService.SGCC.Settings.token"
const KEY_ACCTOKEN = "@ComponentService.SGCC.Settings.acctoken"
const KEY_USERID = "@ComponentService.SGCC.Settings.userId"

const DEBUG = readSetting("logDebug") === "true" || readSetting("logDebug") === "1"
const log = new Logger(SCRIPTNAME, DEBUG)

log.debug(`ENV = ${ENV}`)

let TOKEN = stripBearer(readSetting("token"))
let ACCTOKEN = stripBearer(readSetting("acctoken"))
let USERID = String(readSetting("userId") || "").trim()

// ✅ 兜底：很多情况下只有 Authorization（token）——那就 token=acctoken=Authorization
if (!ACCTOKEN && TOKEN) ACCTOKEN = TOKEN
if (!TOKEN && ACCTOKEN) TOKEN = ACCTOKEN
if (!USERID && TOKEN) {
    const uid = tryDecodeJwtUserId(TOKEN)
    if (uid) USERID = uid
}

log.debug(`token=${TOKEN ? "[SET]" : "[EMPTY]"} acctoken=${ACCTOKEN ? "[SET]" : "[EMPTY]"} userId=${USERID ? "[SET]" : "[EMPTY]"}`)

// 第三方加解密服务（不可控：但原链路需要）
const SERVER_HOST = "https://api.120399.xyz"
const BASE_URL = "https://www.95598.cn"

const API = {
    getKeyCode: "/oauth2/outer/c02/f02",
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

/* ===========================
 *  加解密请求封装
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
    if (!j || !j.data) throw new Error("Decrypt: invalid response")
    const {code, message, data} = j.data
    if (String(code) === "1") return data
    throw new Error(message || "Decrypt failed")
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

function getBeforeDate(days) {
    const d = new Date()
    d.setDate(d.getDate() - days)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/* ===========================
 *  登录态版主流程
 * =========================== */

let requestKey = null
let bindInfo = null

async function getKeyCode() {
    log.info("⏳ 获取 keyCode/publicKey ...")
    requestKey = await request95598({url: `/api${API.getKeyCode}`, method: "POST", headers: {}})
}

async function getBindInfo() {
    log.info("⏳ 查询绑定户号 ...")
    const r = await request95598({
        url: `/api${API.searchUser}`,
        method: "POST",
        headers: {...requestKey, token: TOKEN, acctoken: ACCTOKEN},
        data: {
            serviceCode: CFG.userInformServiceCode,
            source: CFG.source,
            target: CFG.target,
            uscInfo: CFG.uscInfo,
            quInfo: {userId: USERID},
            token: TOKEN,
            Channels: "web"
        }
    })
    bindInfo = r && r.bizrt
    if (!bindInfo || !bindInfo.powerUserList || !bindInfo.powerUserList.length) throw new Error("未获取到绑定户号（登录态可能已失效）")
}

async function getElcFee(index) {
    const o = bindInfo.powerUserList[index]
    const r = await request95598({
        url: `/api${API.accapi}`,
        method: "POST",
        headers: {...requestKey, token: TOKEN, acctoken: ACCTOKEN},
        data: {
            data: {
                srvCode: "",
                serialNo: "",
                channelCode: API.accountFunc.channelCode,
                funcCode: API.accountFunc.funcCode,
                acctId: USERID,
                userName: "",
                promotType: "1",
                promotCode: "1",
                userAccountId: USERID,
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
    const startTime = getBeforeDate(days)
    const endTime = getBeforeDate(1)

    return request95598({
        url: `/api${API.busInfoApi}`,
        method: "POST",
        headers: {...requestKey, token: TOKEN, acctoken: ACCTOKEN},
        data: {
            params1: {
                serviceCode: "",
                source: CFG.source,
                target: CFG.target,
                uscInfo: CFG.uscInfo,
                quInfo: {userId: USERID},
                token: TOKEN
            },
            params3: {
                data: {
                    acctId: USERID,
                    consNo: o.consNo_dst,
                    consType: (o.constType === "02" ? "02" : "01"),
                    endTime,
                    orgNo: o.orgNo,
                    queryYear: String(new Date().getFullYear()),
                    proCode: o.proNo || o.provinceId,
                    serialNo: "",
                    srvCode: "",
                    startTime,
                    userName: "",
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
    const queryYear = String(new Date().getFullYear() + yearOffset)

    return request95598({
        url: `/api${API.busInfoApi}`,
        method: "POST",
        headers: {...requestKey, token: TOKEN, acctoken: ACCTOKEN},
        data: {
            params1: {
                serviceCode: "",
                source: CFG.source,
                target: CFG.target,
                uscInfo: CFG.uscInfo,
                quInfo: {userId: USERID},
                token: TOKEN
            },
            params3: {
                data: {
                    acctId: USERID,
                    consNo: o.consNo_dst,
                    consType: (o.constType === "02" ? "02" : "01"),
                    orgNo: o.orgNo,
                    proCode: o.proNo || o.provinceId,
                    provinceCode: o.proNo || o.provinceId,
                    queryYear,
                    serialNo: "",
                    srvCode: "",
                    userName: "",
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
    const now = new Date()
    const year = now.getFullYear()
    const m0 = (typeof monthOverride === "number" ? monthOverride : now.getMonth())
    const m1 = Math.max(1, Math.min(12, m0 + 1))
    const queryDate = `${year}-${String(m1).padStart(2, "0")}`

    const apiPath =
        (String(o.orgNo || o.provinceId) === "33101")
            ? (String(o.constType) === "01" ? API.HideelectBill : API.LowelectBill)
            : API.electBill

    const r = await request95598({
        url: `/api${apiPath}`,
        method: "POST",
        headers: {...requestKey, token: TOKEN, acctoken: ACCTOKEN},
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
                userAccountId: USERID,
                serialNo: "",
                srvCode: "",
                userName: "",
                acctId: USERID
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

;(async () => {
    if (!TOKEN || !ACCTOKEN || !USERID) {
        notify(
            SCRIPTNAME,
            "请先从官方 App 抓取登录态",
            `需要：${KEY_TOKEN} / ${KEY_ACCTOKEN} / ${KEY_USERID}\n现状：token=${TOKEN ? "OK" : "EMPTY"} acctoken=${ACCTOKEN ? "OK" : "EMPTY"} userId=${USERID ? "OK" : "EMPTY"}\n操作：打开网上国网 App 登录后，多点首页/账单/我的触发请求`,
            {url: "http://boxjs.com/#/app"}
        )
        throw new Error("登录态未配置")
    }

    await getKeyCode()
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