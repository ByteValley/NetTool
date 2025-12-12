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

/* ===========================
 *  环境识别
 * =========================== */
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

/* ===========================
 *  存储（关键修复：@Key 与 Root JSON）
 * =========================== */
class Store {
    constructor(namespace = "ComponentService") {
        this.namespace = namespace
        this.env = ENV
        if (this.env === "Node") {
            const {LocalStorage} = require("node-localstorage")
            this.localStorage = new LocalStorage(`./store/${namespace}`)
        }
    }

    readRaw(key) {
        const k = String(key || "")
        const k2 = k.startsWith("@") ? k.slice(1) : k // ✅ 自动去掉 @ 再读一次
        switch (this.env) {
            case "Surge":
            case "Loon":
            case "Stash":
            case "Shadowrocket": {
                const v1 = $persistentStore.read(k)
                if (v1 != null && v1 !== "") return v1
                return $persistentStore.read(k2)
            }
            case "QuantumultX": {
                const v1 = $prefs.valueForKey(k)
                if (v1 != null && v1 !== "") return v1
                return $prefs.valueForKey(k2)
            }
            case "Node":
                return this.localStorage.getItem(k) || this.localStorage.getItem(k2)
            default:
                return null
        }
    }
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

function readByPath(store, fullKey) {
    // fullKey like "@ComponentService.SGCC.Settings.phoneNum"
    const key = String(fullKey || "")
    const keyNoAt = key.startsWith("@") ? key.slice(1) : key
    const parts = keyNoAt.split(".").filter(Boolean)
    if (parts.length < 2) return ""

    // ✅ BoxJs 实际落盘通常是根 Key：ComponentService（不带 @）
    const rootKey = parts[0] // "ComponentService"
    const rootRaw = store.readRaw(rootKey)
    const rootObj = safeJsonParse(rootRaw, null)

    if (rootObj && typeof rootObj === "object") {
        let cur = rootObj
        for (let i = 1; i < parts.length; i++) {
            if (cur == null) return ""
            cur = cur[parts[i]]
        }
        return cur == null ? "" : String(cur)
    }

    // 如果根 JSON 不存在，才尝试“平铺 key”
    const flat = store.readRaw(key)
    return flat == null ? "" : String(flat)
}

/* ===========================
 *  日志/通知
 * =========================== */
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

/* ===========================
 *  HTTP
 * =========================== */
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

/* ===========================
 *  业务配置
 * =========================== */
const SCRIPTNAME = "网上国网"
const store = new Store("ComponentService")

// ✅ 统一 Settings 风格 Key（全带 @）
const KEY_PHONE = "@ComponentService.SGCC.Settings.phoneNum"
const KEY_PASS = "@ComponentService.SGCC.Settings.password"
const KEY_DEBUG = "@ComponentService.SGCC.Settings.logDebug"

const DEBUG = (() => {
    const v = readByPath(store, KEY_DEBUG)
    return v === "true" || v === "1"
})()
const log = new Logger(SCRIPTNAME, DEBUG)

// ✅ 从根 JSON 解析
const USERNAME = (readByPath(store, KEY_PHONE) || "").trim()
const PASSWORD = (readByPath(store, KEY_PASS) || "").trim()

log.debug(`ENV = ${ENV}`)
log.debug(`Resolved phone = ${USERNAME ? "[OK]" : "[EMPTY]"}`)
log.debug(`Resolved pass  = ${PASSWORD ? "[OK]" : "[EMPTY]"}`)

// 这套加解密/识别码服务来自原脚本思路（第三方服务不可控）
// ✅ 做成列表，支持故障切换（你也可以只留一个）
const SERVER_HOSTS = [
    "https://api.120399.xyz"
    // "https://<your-backup-domain>"
]

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

function getBeforeDate(days) {
    const d = new Date()
    d.setDate(d.getDate() - days)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/* ===========================
 *  加解密封装（带 failover + 重试）
 * =========================== */
async function Encrypt(serverHost, config) {
    const r = await http({...config, url: `${serverHost}/wsgw/encrypt`})
    const j = safeJsonParse(r.body, null)
    if (!j || !j.data || !j.data.url) throw new Error("Encrypt: invalid response")
    j.data.url = BASE_URL + j.data.url
    j.data.body = safeJsonStringify(j.data.data)
    delete j.data.data
    return j.data
}

async function Decrypt(serverHost, config) {
    const r = await http({...config, url: `${serverHost}/wsgw/decrypt`})
    const j = safeJsonParse(r.body, null)
    if (!j || !j.data) throw new Error("Decrypt: invalid response")
    const {code, message, data} = j.data
    if (String(code) === "1") return data

    // ✅ 统一把 GB002 这类提示标出来：不是账号密码，而是中转服务异常/被风控
    const msg = message || "Decrypt failed"
    const err = new Error(msg)
    err._wsgw_code = code
    throw err
}

async function request95598(reqCfg) {
    const maxTry = 5
    let lastErr = null

    for (let hostIndex = 0; hostIndex < SERVER_HOSTS.length; hostIndex++) {
        const SERVER_HOST = SERVER_HOSTS[hostIndex]

        for (let i = 1; i <= maxTry; i++) {
            try {
                // 1) encrypt
                const enc = await Encrypt(SERVER_HOST, {
                    method: "POST",
                    headers: {"content-type": "application/json"},
                    body: safeJsonStringify({yuheng: reqCfg})
                })

                // 2) request real 95598
                const res = await http(enc)
                let parsed = safeJsonParse(res.body, null)
                if (!parsed) parsed = res.body

                // 3) decrypt
                const payload = {config: {...reqCfg}, data: parsed}
                if (reqCfg.url === "/api" + API.getKeyCode) payload.config.headers = {encryptKey: enc.encryptKey}

                return await Decrypt(SERVER_HOST, {
                    method: "POST",
                    headers: {"content-type": "application/json"},
                    body: safeJsonStringify({yuheng: payload})
                })
            } catch (e) {
                lastErr = e
                const code = e && e._wsgw_code ? `（code=${e._wsgw_code}）` : ""
                log.warn(`request95598 failed [host ${hostIndex + 1}/${SERVER_HOSTS.length} | ${i}/${maxTry}] ${String(e)}${code}`)
                // 轻微退避
                await new Promise(r => setTimeout(r, 300 * i))
            }
        }

        log.warn(`当前中转服务不可用，切换到下一个：${SERVER_HOST}`)
    }

    throw lastErr || new Error("request95598: all hosts failed")
}

async function recognizeCaptcha(serverHost, canvasSrc) {
    const r = await http({
        url: `${serverHost}/wsgw/get_x`,
        method: "POST",
        headers: {"content-type": "application/json"},
        body: safeJsonStringify({yuheng: canvasSrc})
    })
    const j = safeJsonParse(r.body, null)
    if (!j || !j.data) throw new Error("验证码识别失败")
    return j.data
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
    requestKey = await request95598({url: `/api${API.getKeyCode}`, method: "POST", headers: {}})
}

async function getVerifyCode() {
    log.info("⏳ 获取验证码凭证 ...")
    const r = await request95598({
        url: `/api${API.loginVerifyCodeNew}`,
        method: "POST",
        headers: {...requestKey},
        data: {password: PASSWORD, account: USERNAME, canvasHeight: 200, canvasWidth: 310}
    })
    if (!r || !r.ticket || !r.canvasSrc) throw new Error("验证码凭证为空")

    // ✅ 识别码也走 failover：用第一个 host（或你可以做更复杂的选择）
    const code = await recognizeCaptcha(SERVER_HOSTS[0], r.canvasSrc)
    return {ticket: r.ticket, code}
}

async function login(ticket, code) {
    log.info("⏳ 登录中 ...")
    const r = await request95598({
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
    })
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
    const m1 = Math.max(1, Math.min(12, m0 + 1))
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
            `需要：${KEY_PHONE} / ${KEY_PASS}\n（注意：脚本会从根 Key「ComponentService」读取 Settings）`,
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
    const msg = String(e || "")
    // ✅ GB002/10004：明确提示是中转/加解密服务异常
    if (msg.includes("GB002") || msg.includes("10004")) {
        notify(
            SCRIPTNAME,
            "中转/加解密服务异常（非账号密码）",
            "错误：GB002 / 10004\n建议：\n1) 换网络/关代理重试；\n2) 等一会再试（服务不稳定）；\n3) 配置备用 SERVER_HOST（自建或可用的镜像服务）。"
        )
    }

    log.error(msg)
    const resp = {
        status: isQX ? "HTTP/1.1 200" : 200,
        headers: {"content-type": "application/json;charset=utf-8"},
        body: "[]"
    }
    done(isQX ? resp : {response: resp})
})