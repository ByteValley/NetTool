/******************************************
 * @name 网上国网（95598）组件服务 - 登录态抓取（精准版）
 * @description
 * 1) http-request：优先抓 Authorization / token / acctoken / userId（通常在 headers）
 * 2) http-response：仅当响应是 JSON 且疑似登录态/业务接口时，递归解析 token 字段补齐
 * 3) 自动去重：同一 URL 短时间只打印一次日志
 *
 * 写入 Keys（全带 @｜Settings 风格）:
 * - @ComponentService.SGCC.Settings.authorization
 * - @ComponentService.SGCC.Settings.token
 * - @ComponentService.SGCC.Settings.acctoken
 * - @ComponentService.SGCC.Settings.userId
 * - @ComponentService.SGCC.Settings.lastUpdate
 * - @ComponentService.SGCC.Settings.lastHit
 ******************************************/

const ENV = (() => {
    if (typeof $environment !== "undefined" && $environment["surge-version"]) return "Surge"
    if (typeof $environment !== "undefined" && $environment["stash-version"]) return "Stash"
    if (typeof $loon !== "undefined") return "Loon"
    if (typeof $task !== "undefined") return "QuantumultX"
    if (typeof $rocket !== "undefined") return "Shadowrocket"
    return "Unknown"
})()

class Store {
    get(key) {
        switch (ENV) {
            case "Surge":
            case "Loon":
            case "Stash":
            case "Shadowrocket":
                return $persistentStore.read(key)
            case "QuantumultX":
                return $prefs.valueForKey(key)
            default:
                return null
        }
    }

    set(key, val) {
        const v = val == null ? "" : String(val)
        switch (ENV) {
            case "Surge":
            case "Loon":
            case "Stash":
            case "Shadowrocket":
                return $persistentStore.write(v, key)
            case "QuantumultX":
                return $prefs.setValueForKey(v, key)
            default:
                return false
        }
    }
}

const store = new Store()

function done(x = {}) {
    $done(x)
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

function nowISO() {
    const d = new Date()
    const pad = (n) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function readRootJSON() {
    const raw = store.get("ComponentService")
    const j = safeJsonParse(raw, null)
    return j && typeof j === "object" ? j : {}
}

function writeRootJSON(j) {
    store.set("ComponentService", safeJsonStringify(j))
}

function setSetting(key, value) {
    const v = value == null ? "" : String(value)

    // 直读 Key（脚本读取）
    store.set(`@ComponentService.SGCC.Settings.${key}`, v)

    // root JSON（BoxJs UI 展示）
    const root = readRootJSON()
    root.SGCC = root.SGCC || {}
    root.SGCC.Settings = root.SGCC.Settings || {}
    root.SGCC.Settings[key] = v
    writeRootJSON(root)
}

function pickFirst(obj, keys) {
    for (const k of keys) {
        if (!obj) continue
        const v = obj[k]
        if (v != null && String(v).trim() !== "") return String(v)
    }
    return ""
}

function isLikelyAuthValue(v) {
    const s = String(v || "").trim()
    if (!s) return false
    // 太短的 token 基本没意义（避免 map 的“token=1”这类噪声）
    return s.length >= 16
}

function shouldIgnoreURL(url) {
    const u = String(url || "")
    // 典型瓦片/静态：你现在命中的 aegis.SGAnchor/*.sg 就属于这种
    if (/\/v1\/aegis\./i.test(u)) return true
    if (/\.(?:png|jpg|jpeg|gif|webp|svg|mp4|m3u8|ts|css|js|map|sg)(?:\?|$)/i.test(u)) return true
    return false
}

// 只对“像业务/登录态”的路径更积极（否则宁可不抓，也不要误抓）
function isLikelySessionAPI(url) {
    const u = String(url || "")
    return /(oauth|token|acctoken|login|auth|session|user|member|account|refresh)/i.test(u)
}

// 递归扫 JSON：只在“像 token 的值”时才采纳
function scan(obj, out) {
    if (!obj || typeof obj !== "object") return

    const cand = [
        ["token", ["token", "Token", "x-token", "X-Token"]],
        ["acctoken", ["acctoken", "accToken", "access_token", "accessToken", "AccessToken"]],
        ["userId", ["userId", "userid", "UserId", "user_id", "uid", "memberId", "acctId"]]
    ]

    for (const [name, keys] of cand) {
        if (!out[name]) {
            const v = pickFirst(obj, keys)
            if (isLikelyAuthValue(v)) out[name] = String(v)
        }
    }

    for (const k of Object.keys(obj)) {
        const v = obj[k]
        if (v && typeof v === "object") scan(v, out)
    }
}

// --- 去重：同一 URL 2 秒内只打印一次 ---
function dedupHit(url) {
    const key = "@ComponentService.SGCC.Settings.__dedup"
    const lastRaw = store.get(key) || ""
    const now = Date.now()
    const prev = safeJsonParse(lastRaw, {})
    const last = prev[url] || 0
    if (now - last < 2000) return false
    prev[url] = now
    store.set(key, safeJsonStringify(prev))
    return true
}

;(function main() {
    const url = ($request && $request.url) ? String($request.url) : ""
    const isReq = typeof $request !== "undefined" && $request && $request.headers
    const isResp = typeof $response !== "undefined" && $response

    if (!url) return done({})
    if (shouldIgnoreURL(url)) return done({})

    const out = {authorization: "", token: "", acctoken: "", userId: ""}

    // 1) request headers 优先
    if (isReq) {
        const h = $request.headers || {}
        out.authorization = pickFirst(h, ["Authorization", "authorization"])
        out.token = pickFirst(h, ["token", "Token", "x-token", "X-Token"])
        out.acctoken = pickFirst(h, ["acctoken", "accToken", "x-acctoken", "X-Acctoken"])
        out.userId = pickFirst(h, ["userId", "UserId", "x-userid", "X-UserId"])

        if (out.authorization && !isLikelyAuthValue(out.authorization)) out.authorization = ""
        if (out.token && !isLikelyAuthValue(out.token)) out.token = ""
        if (out.acctoken && !isLikelyAuthValue(out.acctoken)) out.acctoken = ""
        if (out.userId && !isLikelyAuthValue(out.userId)) out.userId = ""
    }

    // 2) response body 仅在 JSON 且疑似接口时补充
    if (isResp) {
        const h = ($response && $response.headers) ? $response.headers : {}
        const ct = pickFirst(h, ["Content-Type", "content-type"])
        const body = ($response && $response.body) ? String($response.body) : ""

        const looksJson = /json/i.test(ct) || /^[\s\r\n]*[{\[]/.test(body)
        if (looksJson && (isLikelySessionAPI(url) || out.authorization || out.token)) {
            const j = safeJsonParse(body, null)
            if (j) {
                scan(j, out)
            }
        }
    }

    // 3) 写入（只写“像样”的）
    if (out.authorization) setSetting("authorization", out.authorization)
    if (out.token) setSetting("token", out.token)
    if (out.acctoken) setSetting("acctoken", out.acctoken)
    if (out.userId) setSetting("userId", out.userId)

    setSetting("lastUpdate", nowISO())
    setSetting("lastHit", url)

    // 4) 关键日志（去重后才打印）
    if (dedupHit(url)) {
        console.log(`[网上国网] 捕获命中：${url}`)
        console.log(`[网上国网] authorization=${out.authorization ? "[SET]" : "[EMPTY]"} token=${out.token ? "[SET]" : "[EMPTY]"} acctoken=${out.acctoken ? "[SET]" : "[EMPTY]"} userId=${out.userId ? "[SET]" : "[EMPTY]"}`)
    }

    done({})
})()