/******************************************
 * @name 网上国网（95598）组件服务 - 登录态抓取（R4）
 * @description
 * - http-request：抓 Authorization/token/acctoken/userId（headers）
 * - http-response：解析 JSON body 补齐 token/acctoken/userId
 * - 去重：按「阶段+URL」去重；但只要本次真的抓到关键字段，就强制打印日志
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
    store.set(`@ComponentService.SGCC.Settings.${key}`, v)

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
    return s.length >= 16
}

function isMapNoiseURL(url) {
    const u = String(url || "")
    if (/\/v1\/aegis\./i.test(u)) return true
    if (/\/rest\/v1\/geocode\//i.test(u)) return true
    if (/\/place\/v1\/search/i.test(u)) return true
    if (/\.(?:png|jpg|jpeg|gif|webp|svg|mp4|m3u8|ts|css|js|map|sg)(?:\?|$)/i.test(u)) return true
    return false
}

// 只对这些更“像登录态”的接口更激进解析
function isLoginLikeURL(url) {
    const u = String(url || "")
    return /\/authentication\/v\d+\/login\/sysLogin/i.test(u) ||
        /(oauth|token|acctoken|login|auth|session|user|member|account|refresh)/i.test(u)
}

// 递归扫 JSON：只收“像样”的 token 值
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

// 去重：按 phase+url
function dedupHit(phase, url) {
    const key = "@ComponentService.SGCC.Settings.__dedup"
    const lastRaw = store.get(key) || ""
    const now = Date.now()
    const prev = safeJsonParse(lastRaw, {})
    const k = `${phase}::${url}`
    const last = prev[k] || 0
    if (now - last < 2000) return false
    prev[k] = now
    store.set(key, safeJsonStringify(prev))
    return true
}

;(function main() {
    const url = ($request && $request.url) ? String($request.url) : ""
    if (!url) return done({})
    if (isMapNoiseURL(url)) return done({})

    const hasReq = typeof $request !== "undefined" && $request && $request.headers
    const hasResp = typeof $response !== "undefined" && $response

    const out = {authorization: "", token: "", acctoken: "", userId: ""}
    let wroteSomething = false

    // ---- request：抓 headers
    if (hasReq) {
        const h = $request.headers || {}
        out.authorization = pickFirst(h, ["Authorization", "authorization"])
        out.token = pickFirst(h, ["token", "Token", "x-token", "X-Token"])
        out.acctoken = pickFirst(h, ["acctoken", "accToken", "x-acctoken", "X-Acctoken"])
        out.userId = pickFirst(h, ["userId", "UserId", "x-userid", "X-UserId"])

        // 地图 Authorization 很可能是无意义的短串/固定串，直接按长度过滤
        if (out.authorization && !isLikelyAuthValue(out.authorization)) out.authorization = ""
        if (out.token && !isLikelyAuthValue(out.token)) out.token = ""
        if (out.acctoken && !isLikelyAuthValue(out.acctoken)) out.acctoken = ""
        if (out.userId && !isLikelyAuthValue(out.userId)) out.userId = ""

        if (out.authorization) {
            setSetting("authorization", out.authorization);
            wroteSomething = true
        }
        if (out.token) {
            setSetting("token", out.token);
            wroteSomething = true
        }
        if (out.acctoken) {
            setSetting("acctoken", out.acctoken);
            wroteSomething = true
        }
        if (out.userId) {
            setSetting("userId", out.userId);
            wroteSomething = true
        }

        setSetting("lastUpdate", nowISO())
        setSetting("lastHit", url)

        if (wroteSomething || dedupHit("req", url)) {
            console.log(`[网上国网] 捕获命中(req)：${url}`)
            console.log(`[网上国网] authorization=${out.authorization ? "[SET]" : "[EMPTY]"} token=${out.token ? "[SET]" : "[EMPTY]"} acctoken=${out.acctoken ? "[SET]" : "[EMPTY]"} userId=${out.userId ? "[SET]" : "[EMPTY]"}`)
        }
    }

    // ---- response：解析 JSON body
    if (hasResp) {
        const h = ($response && $response.headers) ? $response.headers : {}
        const ct = pickFirst(h, ["Content-Type", "content-type"])
        const body = ($response && $response.body) ? String($response.body) : ""

        const looksJson = /json/i.test(ct) || /^[\s\r\n]*[{\[]/.test(body)
        if (looksJson && isLoginLikeURL(url)) {
            const j = safeJsonParse(body, null)
            if (j) {
                scan(j, out)

                if (out.token) {
                    setSetting("token", out.token);
                    wroteSomething = true
                }
                if (out.acctoken) {
                    setSetting("acctoken", out.acctoken);
                    wroteSomething = true
                }
                if (out.userId) {
                    setSetting("userId", out.userId);
                    wroteSomething = true
                }

                setSetting("lastUpdate", nowISO())
                setSetting("lastHit", url)

                // 只要 response 真解析到东西，强制打印（不被去重吞）
                if (wroteSomething || dedupHit("resp", url)) {
                    console.log(`[网上国网] 捕获命中(resp)：${url}`)
                    console.log(`[网上国网] token=${out.token ? "[SET]" : "[EMPTY]"} acctoken=${out.acctoken ? "[SET]" : "[EMPTY]"} userId=${out.userId ? "[SET]" : "[EMPTY]"}`)
                }
            }
        }
    }

    done({})
})()