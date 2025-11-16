/* =========================================================
 * 模块：订阅信息面板（多机场流量 / 到期展示）
 * 作者：ByteValley
 * 版本：2025-11-16R3
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
 *  · BoxJS 存储根：key = "Panel"
 *    {
 *      "NetworkInfo": { "Settings": {...}, "Caches": ... },
 *      "SubscribeInfo":   { "Settings": {...}, "Caches": ... }   // 推荐
 *      // 兼容旧结构：
 *      // "SubscribeInfo": { "Settings": {...}, "Caches": ... }
 *    }
 *  · 本脚本只在存在 SubscribeInfo 时读取
 *
 * 参数 · 命名 & 取值优先级
 *  · 所有参数均支持「小写 + 大写」两种键名：
 *    - defaultIcon / DefaultIcon
 *    - defaultIconColor / DefaultIconColor
 *    - url1 / URL1, url2 / URL2, ... url10 / URL10
 *    - title1 / Title1, resetDay1 / ResetDay1, ...（以此类推）
 *
 *  · 单值参数优先级：
 *      1）模块 #!arguments 中该参数「与脚本默认 defVal 不同」
 *          ⇒ 视为“显式修改”，最高优先级
 *      2）否则，如果 BoxJS（SubscribeInfo.Settings.*）有值
 *          ⇒ 使用 BoxJS 值（覆盖默认）
 *      3）否则，如果模块 #!arguments 中存在该参数（但与 defVal 相同）
 *          ⇒ 使用模块参数
 *      4）否则 ⇒ 使用脚本默认 defVal
 *
 *  · URL 特性：
 *      - 支持原始 http(s) 链接
 *      - 也支持整串 encodeURIComponent 之后的值（会自动解码一次）
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
 * ========================================================= */

// ===== 日志工具 =====
const TAG = "SubscribeInfo";

function log() {
    if (typeof console === "undefined" || !console.log) return;
    const args = Array.prototype.slice.call(arguments);
    args.unshift("[" + TAG + "]");
    console.log.apply(console, args);
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

// 尝试处理 URL：原样 / decodeURIComponent 一次
function normalizeUrl(src, label) {
    const s = cleanArg(src);
    if (!s) {
        log("normalizeUrl", label, "empty or placeholder, skip");
        return null;
    }
    if (isHttpUrl(s)) {
        log("normalizeUrl", label, "raw is http(s) url:", s);
        return s;
    }
    try {
        const decoded = decodeURIComponent(s);
        if (isHttpUrl(decoded)) {
            log("normalizeUrl", label, "decoded to http(s) url:", decoded);
            return decoded;
        }
        log("normalizeUrl", label, "decoded but still not http(s):", decoded);
    } catch (e) {
        log("normalizeUrl", label, "decodeURIComponent error:", String(e), "raw:", s);
    }
    log("normalizeUrl", label, "not a valid http(s) url:", s);
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
    return Object.prototype.hasOwnProperty.call(args, lower)
        ? args[lower]
        : (Object.prototype.hasOwnProperty.call(args, upper) ? args[upper] : null);
}

function isPlaceholder(val) {
    const s = String(val || "").trim();
    return /^{{{[^}]+}}}$/.test(s);
}

function cleanArg(val) {
    if (val === null || val === undefined) return null;
    const s = String(val).trim();
    if (!s) return null;
    const low = s.toLowerCase();
    if (isPlaceholder(s) || low === "null" || low === "undefined") return null;
    return s;
}

// ===== BoxJS & 参数优先级（只读 key="Panel"） =====
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
 *  · 只读 key = "Panel"
 *  · 优先 Panel.SubscribeInfo.Settings
 *  · 若 Panel 不存在 / 无 Subscribe*，则返回 {}
 */
function readBoxSettings() {
    let raw;
    try {
        raw = KVStore.read("Panel");
    } catch (e) {
        log("readBoxSettings read Panel error:", String(e));
        return {};
    }

    if (raw === null || raw === undefined || raw === "") {
        log("readBoxSettings Panel empty");
        return {};
    }

    let panel;
    if (typeof raw === "string") {
        try {
            panel = JSON.parse(raw);
        } catch (e) {
            log("readBoxSettings Panel JSON.parse error:", String(e));
            log("readBoxSettings Panel raw:", raw);
            return {};
        }
    } else {
        panel = raw;
    }

    if (!panel || typeof panel !== "object") {
        log("readBoxSettings Panel is not object:", panel);
        return {};
    }

    try {
        log("readBoxSettings Panel keys:", Object.keys(panel));
    } catch (_) {
    }

    // Panel.SubscribeInfo.Settings
    if (panel.SubscribeInfo && panel.SubscribeInfo.Settings && typeof panel.SubscribeInfo.Settings === "object") {
        log("readBoxSettings hit Panel.SubscribeInfo.Settings");
        return panel.SubscribeInfo.Settings;
    }

    log("readBoxSettings Panel has no SubscribeInfo Settings");
    return {};
}

const BOX = readBoxSettings();
try {
    log("BOX settings snapshot:", JSON.stringify(BOX));
} catch (e) {
    log("BOX settings snapshot stringify error:", String(e));
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
 * 统一字符串参数优先级：
 *   1）模块参数（与 defVal 不同） ⇒ 最高优先级
 *   2）否则若 BoxJS 有值          ⇒ 使用 BoxJS
 *   3）否则若 模块参数存在        ⇒ 使用模块参数（与 defVal 相同）
 *   4）否则 ⇒ 使用 defVal
 */
function pickStr(lowerKey, upperKey, defVal) {
    const canon = v => (v == null ? "" : String(v).trim());

    const argRaw = getArg(lowerKey, upperKey);
    const argClean = cleanArg(argRaw);
    const hasArg = argClean != null;

    const boxRaw = readBoxMulti([upperKey, lowerKey]);
    const boxClean = cleanArg(boxRaw);
    const hasBox = boxClean != null;

    const defCanon = canon(defVal);
    const argChanged = hasArg && canon(argClean) !== defCanon;

    const chosen = argChanged
        ? argClean
        : (hasBox ? boxClean : (hasArg ? argClean : defVal));

    log(
        "pickStr",
        lowerKey + "/" + upperKey,
        "| defVal:", defVal,
        "| arg:", argClean,
        "| box:", boxClean,
        "| chosen:", chosen
    );
    return chosen;
}

// ===== 拉取机场信息（返回文本块） =====
function fetchInfo(url, resetDayRaw, title, index) {
    return new Promise(resolve => {
        log("fetchInfo start", index, "url:", url, "title:", title, "resetDay:", resetDayRaw);

        $httpClient.get(
            {url, headers: {"User-Agent": "Quantumult%20X/1.5.2"}},
            (err, resp) => {
                if (err || !resp) {
                    log("fetchInfo error", index, "err:", err, "resp:", resp && resp.status);
                    resolve(`机场：${title}\n订阅请求失败，状态码：${resp ? resp.status : "请求错误"}`);
                    return;
                }
                log("fetchInfo resp", index, "status:", resp.status);

                if (resp.status !== 200) {
                    resolve(`机场：${title}\n订阅请求失败，状态码：${resp.status}`);
                    return;
                }

                const headerKey = Object.keys(resp.headers || {}).find(
                    k => k.toLowerCase() === "subscription-userinfo"
                );
                log("fetchInfo headerKey", index, "=>", headerKey);

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
                    log("fetchInfo parsed userinfo", index, JSON.stringify(data));
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
                log("fetchInfo done", index, "block:\n" + block);
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
        "antenna.radiowaves.left.and.right.circle.fill"
    );
    const defaultColor = pickStr(
        "defaultIconColor",
        "DefaultIconColor",
        "#00E28F"
    );

    const blocks = [];
    for (let i = 1; i <= 10; i++) {
        const rawUrl = pickStr(`url${i}`, `URL${i}`, null);
        const url = normalizeUrl(rawUrl, "url" + i);

        const title = pickStr(`title${i}`, `Title${i}`, null) || `机场${i}`;
        const reset = pickStr(`resetDay${i}`, `ResetDay${i}`, null);

        log(`slot ${i}:`, "rawUrl=", rawUrl, "normalized url=", url, "title=", title, "reset=", reset);

        if (!url || !isHttpUrl(url)) {
            log(`slot ${i}: invalid or empty url, skip`);
            continue;
        }

        const block = await fetchInfo(url, reset, title, i);
        blocks.push(block);
    }

    const contentAll = blocks.length ? blocks.join("\n\n") : "未配置订阅参数";
    log("final blocks count:", blocks.length);
    log("final content:\n" + contentAll);

    $done({
        title: "订阅信息",
        content: contentAll,
        icon: defaultIcon,
        iconColor: defaultColor
    });
})();