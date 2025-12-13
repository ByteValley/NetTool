/* =========================================================
 * 模块：订阅信息面板（多机场流量 / 到期展示）
 * 作者：ByteValley
 * 版本：2025-11-17R1
 *
 * 概述 · 功能边界
 *  · 支持最多 10 组订阅链接，按顺序展示总量 / 已用 / 剩余 / 到期时间
 *  · 自动解析 subscription-userinfo 头（upload / download / total / expire）
 *  · 支持每个订阅配置单独重置规则（按日重置或自定义文本）
 *
 * 运行环境 · 依赖接口
 *  · 兼容：Surge 面板 / Loon / Quantumult X / Egern
 *  · 依赖：$httpClient / $persistentStore | $prefs / $done
 *
 * 参数源 · BoxJS 结构
 *  · BoxJS 存储根推荐结构：key = "Panel"
 *    {
 *      "NetworkInfo":  { "Settings": {...}, "Caches": ... },
 *      "SubscribeInfo":{ "Settings": {...}, "Caches": ... }
 *    }
 *  · 本脚本优先读取 Panel.SubscribeInfo.Settings
 *  · 兼容：
 *      - 直接 key = "Panel.SubscribeInfo.Settings"
 *      - 直接 key = "@Panel.SubscribeInfo.Settings"
 *
 * 参数 · 命名 & 取值优先级
 *  · 所有参数均支持「小写 + 大写」两种键名：
 *    - defaultIcon / DefaultIcon
 *    - defaultIconColor / DefaultIconColor
 *    - url1 / URL1, url2 / URL2, ... url10 / URL10
 *    - title1 / Title1, resetDay1 / ResetDay1, ...（以此类推）
 *
 *  · 单值参数优先级（最终逻辑）：
 *      1）若 BoxJS（SubscribeInfo.Settings.*）有值
 *          ⇒ 使用 BoxJS
 *      2）否则，若模块 #!arguments 中有值
 *          ⇒ 使用模块参数
 *      3）否则 ⇒ 使用脚本默认 defVal
 *
 *  · URL 特性：
 *      - 支持原始 http(s) 链接
 *      - 支持 encodeURIComponent 后的整串值（会自动解码一次）
 *      - 以下视为占位符，等价“未配置”：订阅链接 / 机场名称 / 重置日期
 *
 * 显示规则 · 面板格式
 *  · 每个机场四行：
 *      1）「名称 | 总量 | 当前时间(HH:MM)」
 *      2）「已用：xx.xx% ➟ xx.xx GB」
 *      3）「剩余：xx.xx% ➟ xx.xx GB」
 *      4）「重置：X天 | 到期：YYYY.MM.DD」或仅「到期：YYYY.MM.DD」
 *
 *  · 无任何有效订阅（全部 urlN 无法解析为 http(s) 链接）时：
 *      · 面板内容：'未配置订阅参数'
 *
 * 日志说明
 *  · 默认输出基础日志（控制台 console.log）
 *  · 标记前缀统一为：[SubscribeInfo]
 *  · 每次 log 只打印一行完整文本，防止刷屏
 * ========================================================= */

// ===== 日志工具 =====
const TAG = "SubscribeInfo";

function log() {
    if (typeof console === "undefined" || !console.log) return;
    const parts = [];
    for (let i = 0; i < arguments.length; i++) {
        const v = arguments[i];
        if (v === null || v === undefined) {
            parts.push("");
        } else if (typeof v === "string") {
            parts.push(v);
        } else {
            try {
                parts.push(JSON.stringify(v));
            } catch (_) {
                parts.push(String(v));
            }
        }
    }
    console.log("[" + TAG + "] " + parts.join(" "));
}

// ===== 工具函数 =====
function bytesToSize(bytes) {
    if (!bytes || bytes <= 0) return "0 B";
    const k = 1024, sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const val = bytes / Math.pow(k, i);
    return `${val.toFixed(2)} ${sizes[i]}`;
}

function toPercent(used, total) {
    if (!total) return "0%";
    return `${((used / total) * 100).toFixed(2)}%`;
}

function toReversePercent(used, total) {
    if (!total) return "0%";
    return `${(((total - used) / total) * 100).toFixed(2)}%`;
}

function pad2(n: number) {
    return String(n).padStart(2, "0")
}

// 12-13 21:07:05（月-日 时:分:秒）
function nowMDHMS() {
    const d = new Date()
    const MM = pad2(d.getMonth() + 1)
    const DD = pad2(d.getDate())
    const hh = pad2(d.getHours())
    const mm = pad2(d.getMinutes())
    const ss = pad2(d.getSeconds())
    return `${MM}-${DD} ${hh}:${mm}:${ss}`
}

function formatDate(ts) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, "0");
    const day = d.getDate().toString().padStart(2, "0");
    return `${y}.${m}.${day}`;
}

function getResetDaysLeft(resetDayNum) {
    if (!resetDayNum) return null;
    const today = new Date();
    const nowDay = today.getDate();
    const nowMonth = today.getMonth();
    const nowYear = today.getFullYear();
    let resetDate;
    if (nowDay < resetDayNum) resetDate = new Date(nowYear, nowMonth, resetDayNum);
    else resetDate = new Date(nowYear, nowMonth + 1, resetDayNum);
    const diff = Math.ceil((resetDate - today) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
}

function isPureNumber(s) {
    return typeof s === "number" || (/^\d+$/.test(String(s || "").trim()));
}

function isHttpUrl(s) {
    return /^https?:\/\//i.test(String(s || ""));
}

// 占位符文本（等价为空）
const PLACEHOLDER_STRINGS = [
    "订阅链接",
    "机场名称",
    "重置日期"
];

function isPlaceholderString(s) {
    const t = String(s || "").trim();
    if (!t) return false;
    if (/^{{{[^}]+}}}$/.test(t)) return true;
    if (PLACEHOLDER_STRINGS.indexOf(t) !== -1) return true;
    const low = t.toLowerCase();
    return low === "null" || low === "undefined";

}

function cleanArg(val) {
    if (val === null || val === undefined) return null;
    const s = String(val).trim();
    if (!s) return null;
    if (isPlaceholderString(s)) return null;
    return s;
}

// 尝试处理 URL：原样 / decodeURIComponent 一次
function normalizeUrl(src, label) {
    const s = cleanArg(src);
    if (!s) {
        log("normalizeUrl", label, "=> empty/placeholder, skip");
        return null;
    }
    if (isHttpUrl(s)) {
        log("normalizeUrl", label, "use raw http(s):", s);
        return s;
    }
    try {
        const decoded = decodeURIComponent(s);
        if (isHttpUrl(decoded)) {
            log("normalizeUrl", label, "decoded to http(s):", decoded);
            return decoded;
        }
        log("normalizeUrl", label, "decoded but still not http(s):", decoded);
    } catch (e) {
        log("normalizeUrl", label, "decodeURIComponent error:", String(e), "raw:", s);
    }
    log("normalizeUrl", label, "invalid http(s):", s);
    return null;
}

// ===== 参数解析 & 清洗（$argument） =====
const args = {};
(($argument || "") + "").split("&").forEach(p => {
    if (!p) return;
    const idx = p.indexOf("=");
    if (idx === -1) return;
    const key = p.substring(0, idx);
    const value = p.substring(idx + 1);
    args[key] = decodeURIComponent(value || "");
});

log("raw $argument:", ($argument || "") + "");

function getArg(lower, upper) {
    if (Object.prototype.hasOwnProperty.call(args, lower)) return args[lower];
    if (Object.prototype.hasOwnProperty.call(args, upper)) return args[upper];
    return null;
}

// ===== BoxJS & 参数优先级 =====
const KVStore = (() => {
    if (typeof $prefs !== "undefined" && $prefs.valueForKey) {
        return {
            read: k => $prefs.valueForKey(k),
            write: (v, k) => $prefs.setValueForKey(v, k)
        };
    }
    if (typeof $persistentStore !== "undefined" && $persistentStore.read) {
        return {
            read: k => $persistentStore.read(k),
            write: (v, k) => $persistentStore.write(v, k)
        };
    }
    try {
        if (typeof localStorage !== "undefined") {
            return {
                read: k => localStorage.getItem(k),
                write: (v, k) => localStorage.setItem(k, v)
            };
        }
    } catch (e) {
    }
    return {
        read: () => null,
        write: () => {
        }
    };
})();

/**
 * 读取 BoxJS 订阅信息设置：
 *  · 优先读取 key="Panel" 且含 SubscribeInfo.Settings
 *  · 兼容：
 *      - key="Panel.SubscribeInfo.Settings"
 *      - key="@Panel.SubscribeInfo.Settings"
 */
function readBoxSettings() {
    // 1. Panel 聚合
    try {
        const rawPanel = KVStore.read("Panel");
        if (rawPanel) {
            let panel = rawPanel;
            if (typeof rawPanel === "string") {
                try {
                    panel = JSON.parse(rawPanel);
                } catch (e) {
                    log("readBoxSettings Panel JSON.parse error:", String(e));
                }
            }
            if (panel && typeof panel === "object") {
                if (panel.SubscribeInfo && panel.SubscribeInfo.Settings && typeof panel.SubscribeInfo.Settings === "object") {
                    log("readBoxSettings hit Panel.SubscribeInfo.Settings");
                    return panel.SubscribeInfo.Settings;
                }
            }
        } else {
            log("readBoxSettings key 'Panel' empty");
        }
    } catch (e) {
        log("readBoxSettings read 'Panel' error:", String(e));
    }

    // 2. 直接 SubscribeInfo.Settings
    const candidates = [
        "Panel.SubscribeInfo.Settings",
        "@Panel.SubscribeInfo.Settings"
    ];
    for (const key of candidates) {
        try {
            const raw = KVStore.read(key);
            if (!raw) {
                log("readBoxSettings", key, "empty");
                continue;
            }
            let val = raw;
            if (typeof raw === "string") {
                try {
                    val = JSON.parse(raw);
                } catch (e) {
                    log("readBoxSettings", key, "JSON.parse error:", String(e));
                    continue;
                }
            }
            if (val && typeof val === "object") {
                if (val.Settings && typeof val.Settings === "object") {
                    log("readBoxSettings hit", key, "Settings");
                    return val.Settings;
                }
                log("readBoxSettings hit", key, "direct object");
                return val;
            }
        } catch (e) {
            log("readBoxSettings read", key, "error:", String(e));
        }
    }

    log("readBoxSettings no SubscribeInfo settings found, use {}");
    return {};
}

const BOX = readBoxSettings();
try {
    log("BOX snapshot:", JSON.stringify(BOX));
} catch (e) {
    log("BOX snapshot stringify error:", String(e));
}

function readBoxMulti(keys) {
    if (!BOX || typeof BOX !== "object") return undefined;
    for (const k of keys) {
        if (!k) continue;
        if (!Object.prototype.hasOwnProperty.call(BOX, k)) continue;
        const v = BOX[k];
        if (v === "" || v === null || v === undefined) continue;
        return v;
    }
    return undefined;
}

/**
 * 字符串参数读取，优先级：
 *   1）「已修改」的 #!arguments（与默认 arguments 不同）
 *   2）BoxJS (SubscribeInfo.Settings.*)
 *   3）「未修改」的 #!arguments（与默认 arguments 相同）
 *   4）defVal（脚本默认值）
 *
 * 说明：
 *  · 对于 url/title/reset 这类参数：
 *      - 默认 arguments（如“订阅链接/机场名称/重置日期”）只用于判断“是否修改”，本身不当作有效值返回
 *  · 对于 defaultIcon/defaultIconColor：
 *      - 默认 arguments = 脚本 defVal
 *      - 若没改过且无 BoxJS，则返回 defVal
 */
function pickStr(lowerKey, upperKey, defVal, defArgRaw) {
    const canon = v => (v == null ? "" : String(v).trim());

    // 1. 原始 arguments 值（未清洗，用来和默认 arguments 比较）
    const argRaw =
        Object.prototype.hasOwnProperty.call(args, lowerKey)
            ? args[lowerKey]
            : (Object.prototype.hasOwnProperty.call(args, upperKey)
                ? args[upperKey]
                : null);

    const argClean = cleanArg(argRaw);
    const hasArg = argClean != null;

    // 2. 默认 arguments（模块里写死的例如“订阅链接/机场名称/重置日期”等）
    const defArgCanon = canon(defArgRaw);

    // 3. BoxJS
    const boxRaw = readBoxMulti([upperKey, lowerKey]);
    const boxClean = cleanArg(boxRaw);
    const hasBox = boxClean != null;

    // 4. 判断 arguments 是否“被修改过”
    //   - argRaw 不为 null/undefined，且和默认 arguments 文本不同 ⇒ 视为“修改过”
    let argChanged = false;
    if (argRaw !== null && argRaw !== undefined) {
        if (canon(argRaw) !== defArgCanon) {
            argChanged = true;
        }
    }

    let chosen;
    if (argChanged && hasArg) {
        // ① 修改后的 arguments 最高优先级
        chosen = argClean;
    } else if (hasBox) {
        // ② 没有被修改 ⇒ BoxJS 优先
        chosen = boxClean;
    } else if (hasArg) {
        // ③ 有 arguments 且与默认值相同（比较少见，但保底）
        chosen = argClean;
    } else {
        // ④ 完全没配置 ⇒ 用脚本默认 defVal
        chosen = defVal;
    }

    log(
        "pickStr",
        `${lowerKey}/${upperKey}`,
        "| defVal:", defVal,
        "| defArgRaw:", defArgRaw,
        "| argRaw:", argRaw,
        "| argClean:", argClean,
        "| box:", boxClean,
        "| argChanged:", argChanged,
        "| chosen:", chosen
    );

    return chosen;
}

// ===== HTTP 请求（带最多 3 次重试） =====
const MAX_RETRY = 3;

function httpGetWithRetry(options, attempt, cb) {
    $httpClient.get(options, (err, resp) => {
        if (err || !resp) {
            log("httpGet error attempt", attempt, "err:", err && String(err), "status:", resp && resp.status);
            if (attempt < MAX_RETRY) {
                httpGetWithRetry(options, attempt + 1, cb);
            } else {
                cb(err || new Error("request error"), resp);
            }
            return;
        }
        cb(null, resp);
    });
}

// ===== 拉取机场信息（返回文本块） =====
function fetchInfo(url, resetDayRaw, title, index) {
    return new Promise(resolve => {
        log("fetchInfo start", "slot", index, "url:", url, "title:", title, "resetDay:", resetDayRaw);

        httpGetWithRetry(
            {url, headers: {"User-Agent": "Quantumult%20X/1.5.2"}},
            1,
            (err, resp) => {
                if (err || !resp) {
                    log("fetchInfo final error", "slot", index, "err:", err && String(err), "status:", resp && resp.status);
                    resolve(`机场：${title}\n订阅请求失败，状态码：${resp ? resp.status : "请求错误"}`);
                    return;
                }

                log("fetchInfo resp", "slot", index, "status:", resp.status);

                if (resp.status !== 200) {
                    resolve(`机场：${title}\n订阅请求失败，状态码：${resp.status}`);
                    return;
                }

                const headerKey = Object.keys(resp.headers || {}).find(
                    k => k.toLowerCase() === "subscription-userinfo"
                );
                log("fetchInfo headerKey slot", index, "=>", headerKey || "none");

                const data = {};
                if (headerKey && resp.headers[headerKey]) {
                    resp.headers[headerKey].split(";").forEach(p => {
                        const kv = p.trim().split("=");
                        if (kv.length !== 2) return;
                        const k = kv[0];
                        const v = kv[1];
                        if (!k || !v) return;
                        const num = parseInt(v, 10);
                        if (!isNaN(num)) data[k] = num;
                    });
                }

                try {
                    log("fetchInfo userinfo slot", index, JSON.stringify(data));
                } catch (_) {
                }

                const upload = data.upload || 0;
                const download = data.download || 0;
                const total = data.total || 0;
                const used = upload + download;
                const remain = Math.max(total - used, 0);

                // 到期时间：无则 2099-12-31
                let expireMs;
                if (data.expire) {
                    let exp = Number(data.expire);
                    if (/^\d+$/.test(String(data.expire))) {
                        if (exp < 10000000000) exp *= 1000; // 秒→毫秒
                    }
                    expireMs = exp;
                } else {
                    expireMs = new Date("2099-12-31T00:00:00Z").getTime();
                }
                const expireStr = formatDate(expireMs);

                // 重置：数字→N天；中文/非数字→原文；未提供则不显示
                let resetLinePart = "";
                const resetClean = cleanArg(resetDayRaw);
                if (resetClean) {
                    if (isPureNumber(resetClean)) {
                        const left = getResetDaysLeft(parseInt(resetClean, 10));
                        resetLinePart = `重置：${left ?? 0}天`;
                    } else {
                        resetLinePart = `重置：${resetClean}`;
                    }
                }

                const now = new Date();
                const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now
                    .getMinutes()
                    .toString()
                    .padStart(2, "0")}`;
                const titleLine = `${title} | ${bytesToSize(total)} | ${timeStr}`;
                const usedLine = `已用：${toPercent(used, total)} ➟ ${bytesToSize(used)}`;
                const remainLine = `剩余：${toReversePercent(used, total)} ➟ ${bytesToSize(remain)}`;
                let tailLine = `到期：${expireStr}`;
                if (resetLinePart) tailLine = `${resetLinePart} | 到期：${expireStr}`;

                const block = [titleLine, usedLine, remainLine, tailLine].join("\n");
                log("fetchInfo done", "slot", index, "\n" + block);
                resolve(block);
            }
        );
    });
}

// ===== 主流程 =====
(async () => {
    log("script start");

    const defaultIcon = pickStr(
        "defaultIcon",
        "DefaultIcon",
        "antenna.radiowaves.left.and.right.circle.fill",   // 脚本默认值 = 模块默认 arguments
        "antenna.radiowaves.left.and.right.circle.fill"
    );
    const defaultColor = pickStr(
        "defaultIconColor",
        "DefaultIconColor",
        "#00E28F",   // 脚本默认值 = 模块默认 arguments
        "#00E28F"
    );

    const blocks = [];
    for (let i = 1; i <= 10; i++) {
        // URL：默认 arguments=“订阅链接”，逻辑默认值=null
        const rawUrl = pickStr(`url${i}`, `URL${i}`, null, "订阅链接");
        const url = normalizeUrl(rawUrl, "url" + i);

        // 标题：默认 arguments=“机场名称”，逻辑默认值=null，再用“机场N”兜底
        const rawTitle = pickStr(`title${i}`, `Title${i}`, null, "机场名称");
        const title = rawTitle || `机场${i}`;

        // 重置：默认 arguments=“重置日期”，逻辑默认值=null
        const reset = pickStr(`resetDay${i}`, `ResetDay${i}`, null, "重置日期");

        log(
            "slot", i,
            "| rawUrl:", rawUrl,
            "| url:", url,
            "| title:", title,
            "| reset:", reset
        );

        // 没有 URL/无效 URL：不发请求
        if (!url || !isHttpUrl(url)) {
            log("slot", i, "no valid url, skip request");
            continue;
        }

        const block = await fetchInfo(url, reset, title, i);
        blocks.push(block);
    }

    const runAtLine = `执行时间：${formatRunAt(new Date())}`;
    const contentAll = blocks.length
        ? `${runAtLine}\n\n${blocks.join("\n\n")}`
        : `${runAtLine}\n\n未配置订阅参数`;
    log("final blocks count:", blocks.length);
    log("final content:\n" + contentAll);

    $done({
        title: "订阅信息",
        content: contentAll,
        icon: defaultIcon,
        iconColor: defaultColor
    });
})();