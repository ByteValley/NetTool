/******************************************
 * @name 网上国网（95598）组件服务 - 登录态抓取（Request Header 优先版）
 * @description 优先从 http-request 的 headers 捕获 Authorization/token/acctoken/userId；兼容 http-response JSON 扫描
 *
 * 写入 Keys（全带 @｜Settings 风格）:
 * - @ComponentService.SGCC.Settings.token
 * - @ComponentService.SGCC.Settings.acctoken
 * - @ComponentService.SGCC.Settings.userId
 * - @ComponentService.SGCC.Settings.lastUpdate
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
    store.set(`@ComponentService.SGCC.Settings.${key}`, value)

    const root = readRootJSON()
    root.SGCC = root.SGCC || {}
    root.SGCC.Settings = root.SGCC.Settings || {}
    root.SGCC.Settings[key] = String(value)
    writeRootJSON(root)
}

function pickHeader(headers, names) {
    if (!headers) return ""
    const lowerMap = {}
    for (const k of Object.keys(headers)) lowerMap[k.toLowerCase()] = headers[k]
    for (const n of names) {
        const v = lowerMap[n.toLowerCase()]
        if (v != null && String(v).trim() !== "") return String(v)
    }
    return ""
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

// 递归扫 JSON（兼容 response body 里带 token 的情况）
function scanJson(obj, out) {
    if (!obj || typeof obj !== "object") return
    const cand = [
        ["token", ["token", "Token", "authorization", "Authorization", "x-token", "X-Token"]],
        ["acctoken", ["acctoken", "accToken", "access_token", "accessToken", "AccessToken"]],
        ["userId", ["userId", "userid", "UserId", "user_id", "uid", "memberId", "acctId"]]
    ]
    for (const [name, keys] of cand) {
        if (!out[name]) {
            for (const k of keys) {
                if (obj[k] != null && String(obj[k]).trim() !== "") {
                    out[name] = String(obj[k])
                    break
                }
            }
        }
    }
    for (const k of Object.keys(obj)) {
        const v = obj[k]
        if (v && typeof v === "object") scanJson(v, out)
    }
}

;(function main() {
    const url = ($request && $request.url) ? String($request.url) : (($response && $response.url) ? String($response.url) : "")
    const out = {token: "", acctoken: "", userId: ""}

    const hasReq = (typeof $request !== "undefined") && $request && $request.headers
    const hasResp = (typeof $response !== "undefined") && $response && $response.headers

    // ========== 1) http-request：只读 $request ==========
    if (hasReq) {
        const h = $request.headers || {}
        const authorization = pickHeader(h, ["Authorization", "authorization"])
        const token = pickHeader(h, ["token", "Token", "x-token", "X-Token"])
        const acctoken = pickHeader(h, ["acctoken", "accToken", "access_token", "accessToken"])
        const userId = pickHeader(h, ["userId", "userid", "x-userid", "X-UserId", "uid"])

        const authToken = stripBearer(authorization)
        out.token = stripBearer(token) || authToken
        out.acctoken = stripBearer(acctoken) || ""
        out.userId = String(userId || "").trim()

        if (!out.userId && authToken) {
            const uid = tryDecodeJwtUserId(authToken)
            if (uid) out.userId = uid
        }
    }

    // ========== 2) http-response：只在存在 $response 时处理 ==========
    if (hasResp) {
        const h = $response.headers || {}
        const authorization = pickHeader(h, ["Authorization", "authorization"])
        const token = pickHeader(h, ["token", "Token", "x-token", "X-Token"])
        const acctoken = pickHeader(h, ["acctoken", "accToken", "access_token", "accessToken"])
        const userId = pickHeader(h, ["userId", "userid", "x-userid", "X-UserId", "uid"])

        const authToken = stripBearer(authorization)
        out.token = out.token || stripBearer(token) || authToken
        out.acctoken = out.acctoken || stripBearer(acctoken)
        out.userId = out.userId || String(userId || "").trim()

        const body = ($response && $response.body) ? String($response.body) : ""
        const j = safeJsonParse(body, null)
        if (j) scanJson(j, out)

        if (!out.userId && authToken) {
            const uid = tryDecodeJwtUserId(authToken)
            if (uid) out.userId = uid
        }
    }

    // ========== 3) 兜底 ==========
    if (!out.acctoken && out.token) out.acctoken = out.token

    // ========== 4) 写入 ==========
    if (out.token) setSetting("token", out.token)
    if (out.acctoken) setSetting("acctoken", out.acctoken)
    if (out.userId) setSetting("userId", out.userId)
    setSetting("lastUpdate", nowISO())

    console.log(`[网上国网] 捕获命中：${url}`)
    console.log(`[网上国网] token=${out.token ? "[SET]" : "[EMPTY]"} acctoken=${out.acctoken ? "[SET]" : "[EMPTY]"} userId=${out.userId ? "[SET]" : "[EMPTY]"}`)

    done({})
})()