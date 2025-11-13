// 记录 + 定时报表 + 日志输出集合（通过 argument 切模式）
// 存储键：fqnovel.lastseen
// 数据结构：{ "<ip|host:xxx>": { host, ip, ts } }
(() => {
    const STORE_KEY = "fqnovel.lastseen";
    const now = Date.now();
    const args = parseArgs($argument || "");

    function parseArgs(s) {
        const out = {};
        s.split("&").forEach(kv => {
            if (!kv) return;
            const i = kv.indexOf("=");
            if (i === -1) out[kv] = "1"; else out[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
        });
        return out;
    }

    function readDB() { try { return JSON.parse($persistentStore.read(STORE_KEY) || "{}"); } catch { return {}; } }
    function writeDB(db) { $persistentStore.write(JSON.stringify(db), STORE_KEY); }
    function iso(d) { return new Date(d).toISOString().slice(0, 10); }
    function clog(msg) { try { console.log(msg); } catch (e) {} } // 兼容不同内核

    // —— 模式一：记录最近命中（http-request 触发）
    function record() {
        const host = ($request && ($request.hostname || "")) || "";
        const ip = ($network && ($network.remoteAddress || $network.remoteIP)) || "";
        if (!host || (!host.endsWith(".fqnovel.com") && !host.endsWith(".zijieapi.com"))) return $done({});
        const key = ip ? ip : `host:${host}`;
        const db = readDB();
        db[key] = { host, ip, ts: now };
        writeDB(db);
        $done({});
    }

    // —— 模式二：生成报表（cron 触发）+ 打印集合
    function report() {
        const days = Math.max(1, parseInt(args.days || "30", 10));
        const threshold = days * 24 * 3600 * 1000;
        const sortOrder = (args.sort || "oldest").toLowerCase(); // oldest/newest
        const show = (args.show || "both").toLowerCase();        // active/stale/both
        const limit = Math.max(1, parseInt(args.limit || "100", 10));
        const enableLog = String(args.log || "1") === "1";

        const db = readDB();
        const stale = [];
        const active = [];

        for (const k in db) {
            const item = db[k];
            if (!item || !item.ts) continue;
            if (now - item.ts > threshold) stale.push(item);
            else active.push(item);
        }

        const cmp = sortOrder === "newest"
            ? (a, b) => (b.ts - a.ts)
            : (a, b) => (a.ts - b.ts);
        stale.sort(cmp);
        active.sort(cmp);

        // 可选：同步删除过期项
        if (String(args.prune || "0") === "1") {
            const after = {};
            for (const k in db) {
                const it = db[k]; if (!it) continue;
                if (now - it.ts <= threshold) after[k] = it;
            }
            writeDB(after);
        }

        // 通知
        const total = Object.keys(db).length;
        const title = `fqnovel IP 过期清单（>${days}天未见）`;
        const subtitle = `过期 ${stale.length} | 活跃 ${active.length} | 总 ${total}`;
        const body = stale.length
            ? stale.slice(0, limit).map(e => `${e.ip || "-"}  ${e.host}  last-seen=${iso(e.ts)}`).join("\n")
            : "暂无过期项";
        if (String(args.notify || "1") === "1") $notification.post(title, subtitle, body);

        // 日志输出集合（按 show 控制）
        if (enableLog) {
            if (show === "active" || show === "both") {
                clog("==== Active（近期命中） ====");
                active.slice(0, limit).forEach((e, i) => clog(`${i + 1}. ${e.ip || "-"}  ${e.host}  last-seen=${iso(e.ts)} (${e.ts})`));
                if (active.length > limit) clog(`... and ${active.length - limit} more`);
            }
            if (show === "stale" || show === "both") {
                clog("==== Stale（超过阈值未见） ====");
                stale.slice(0, limit).forEach((e, i) => clog(`${i + 1}. ${e.ip || "-"}  ${e.host}  last-seen=${iso(e.ts)} (${e.ts})`));
                if (stale.length > limit) clog(`... and ${stale.length - limit} more`);
            }
        }
        $done({});
    }

    // —— 入口分发
    const mode = (args.mode || "").toLowerCase();
    if (mode === "record" && typeof $request !== "undefined") return record();
    if (mode === "report") return report();
    $done({});
})();