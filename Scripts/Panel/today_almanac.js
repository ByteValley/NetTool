/**
 * 今日黄历 · 面板版
 *  - 可选在面板顶部附加「今日黄历详情」（干支纪法 / 宜忌，数据来自 wnCalendar 开放接口）
 *  - 4 行节日倒数：法定 | 二十四节气 | 传统民俗 | 国际洋节
 *  - 支持外链标题/祝词库（标题占位 {lunar} {solar} {next}）
 *  - 法定 + 民俗节日正日 06:00 后单次提醒（消息内容走祝词库）
 *
 * 参数（模块 #!arguments）：
 *  - TITLES_URL   : 标题库外链(JSON数组)
 *  - BLESS_URL    : 祝词库外链(JSON对象，键为节日名，值为文案)
 *  - SHOW_ALMANAC : 是否在面板尾部附加今日黄历详情 (true/false)
 *  - GAP_LINES    : 节日行与行之间的空行数(0=无空行,1=一行,2=两行…)
 *
 * 作者：ByteValley  |  版本：2025-11-18R2
 */

;(async () => {
    /* ========== 基础工具 ========== */
    const tnow = new Date();
    const todayStr = (d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`)(tnow);
    const y = tnow.getFullYear();
    const nextY = y + 1;

    /** 简单日期差（单位：天） */
    function dateDiff(start, end) {
        const s = start.split("-"), e = end.split("-");
        const sd = new Date(+s[0], +s[1] - 1, +s[2]);
        const ed = new Date(+e[0], +e[1] - 1, +e[2]);
        return Math.floor((ed - sd) / 86400000);
    }

    function fmtYMD(y, m, d) {
        return `${y}-${m}-${d}`;
    }

    /** 解析 $argument（兼容 Surge/Egern 的 key=value&key2=value2 形式） */
    function parseArgs(raw) {
        const obj = {};
        if (!raw) return obj;
        if (typeof raw === "object") return raw;
        const s = String(raw).trim();
        if (!s) return obj;
        const parts = s.split("&");
        for (const kv of parts) {
            if (!kv) continue;
            const idx = kv.indexOf("=");
            if (idx === -1) continue;
            const k = decodeURIComponent(kv.slice(0, idx));
            obj[k] = decodeURIComponent(kv.slice(idx + 1).replace(/\+/g, "%20"));
        }
        return obj;
    }

    /** 布尔 / 整数工具 */
    function toBool(v, defVal = false) {
        if (v === undefined || v === null || v === "") return defVal;
        if (typeof v === "boolean") return v;
        const s = String(v).trim().toLowerCase();
        if (["true", "1", "yes", "on"].includes(s)) return true;
        if (["false", "0", "no", "off"].includes(s)) return false;
        return defVal;
    }

    function toInt(v, defVal = 0) {
        if (v === undefined || v === null || v === "") return defVal;
        const n = parseInt(v, 10);
        return Number.isNaN(n) ? defVal : n;
    }

    /** HTTP / JSON 工具 */
    function httpGet(url, timeout = 8000) {
        return new Promise(resolve => {
            $httpClient.get({url, timeout}, (err, resp, data) => {
                if (err || !resp || resp.status !== 200) return resolve(null);
                resolve(data);
            });
        });
    }

    async function fetchJson(url, fallback) {
        if (!url) return fallback;
        const raw = await httpGet(url);
        if (!raw) return fallback;
        try {
            return JSON.parse(raw);
        } catch {
            return fallback;
        }
    }

    /* ========== 农历/节气算法（原版压缩） ========== */
    const calendar = {
        lunarInfo: [0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2, 0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977, 0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, 0x06566, 0x0d4a0, 0x0ea50, 0x16a95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950, 0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, 0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, 0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, 0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6, 0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570, 0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x05ac0, 0x0ab60, 0x096d5, 0x092e0, 0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, 0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930, 0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530, 0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, 0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, 0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0, 0x092e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4, 0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, 0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, 0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252, 0x0d520],
        solarMonth: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
        Gan: ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"],
        Zhi: ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"],
        Animals: ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"],
        festival: {
            '1-1': {title: '元旦节'},
            '2-14': {title: '情人节'},
            '5-1': {title: '劳动节'},
            '6-1': {title: '儿童节'},
            '9-10': {title: '教师节'},
            '10-1': {title: '国庆节'},
            '12-25': {title: '圣诞节'},
            '3-8': {title: '妇女节'},
            '3-12': {title: '植树节'},
            '4-1': {title: '愚人节'},
            '5-12': {title: '护士节'},
            '7-1': {title: '建党节'},
            '8-1': {title: '建军节'},
            '12-24': {title: '平安夜'}
        },
        lFestival: {
            '12-30': {title: '除夕'},
            '1-1': {title: '春节'},
            '1-15': {title: '元宵节'},
            '2-2': {title: '龙抬头'},
            '5-5': {title: '端午节'},
            '7-7': {title: '七夕节'},
            '7-15': {title: '中元节'},
            '8-15': {title: '中秋节'},
            '9-9': {title: '重阳节'},
            '10-1': {title: '寒衣节'},
            '10-15': {title: '下元节'},
            '12-8': {title: '腊八节'},
            '12-23': {title: '北方小年'},
            '12-24': {title: '南方小年'}
        },
        solarTerm: ["小寒", "大寒", "立春", "雨水", "惊蛰", "春分", "清明", "谷雨", "立夏", "小满", "芒种", "夏至", "小暑", "大暑", "立秋", "处暑", "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至"],
        sTermInfo: [/* 此处保留原有长数组，略 */],
        nStr1: ["日", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"],
        nStr2: ["初", "十", "廿", "卅"],
        nStr3: ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "冬", "腊"],
        /* ……中间 lunar 相关方法保持不变，此处省略以节省篇幅（请使用你当前脚本里的完整 calendar 对象） …… */
        solar2lunar: function (Y, M, D) {/* 同你现有版本 */
        },
        lunar2solar: function (y, m, d, isLeap) {/* 同你现有版本 */
        }
    };

    /* ========== 今日标题占位 ========== */
    const lunarNow = calendar.solar2lunar(tnow.getFullYear(), tnow.getMonth() + 1, tnow.getDate());
    const titleSolar = `${lunarNow.cMonth}月${lunarNow.cDay}日（${lunarNow.astro}）`;
    const titleLunar = `${lunarNow.IMonthCn}${lunarNow.IDayCn} • ${lunarNow.gzYear}年${lunarNow.gzMonth}${lunarNow.gzDay} • ${lunarNow.Animal}年`;

    /* ========== 节日集合构建（与原脚本一致） ========== */
    function nthWeekdayOfMonth(year, month, weekday, n) {
        const first = new Date(year, month - 1, 1);
        const firstW = first.getDay();
        const add = ((weekday - firstW + 7) % 7) + (n - 1) * 7;
        return fmtYMD(year, month, 1 + add);
    }

    function lunarNewYearEveSolar(year) {
        const days12 = calendar.monthDays(year, 12);
        const lday = days12 === 29 ? 29 : 30;
        return calendar.lunar2solar(year, 12, lday).date;
    }

    function solarTerms(year) {
        const names = calendar.solarTerm, out = [];
        for (let i = 1; i <= 24; i++) {
            const month = i <= 2 ? 1 : i <= 4 ? 2 : i <= 6 ? 3 : i <= 8 ? 4 : i <= 10 ? 5 : i <= 12 ? 6 : i <= 14 ? 7 : i <= 16 ? 8 : i <= 18 ? 9 : i <= 20 ? 10 : i <= 22 ? 11 : 12;
            const day = calendar.getTerm(year, i);
            out.push([names[i - 1], fmtYMD(year, month, day)]);
        }
        out.sort((a, b) => new Date(a[1]) - new Date(b[1]));
        return out;
    }

    function legalFest(year) {
        return [
            ["元旦", fmtYMD(year, 1, 1)],
            ["春节", calendar.lunar2solar(year, 1, 1).date],
            ["清明节", fmtYMD(year, 4, calendar.getTerm(year, 7))],
            ["劳动节", fmtYMD(year, 5, 1)],
            ["端午节", calendar.lunar2solar(year, 5, 5).date],
            ["中秋节", calendar.lunar2solar(year, 8, 15).date],
            ["国庆节", fmtYMD(year, 10, 1)]
        ].sort((a, b) => new Date(a[1]) - new Date(b[1]));
    }

    function folkFest(year) {
        const base = [
            ["除夕", lunarNewYearEveSolar(year)],
            ["元宵节", calendar.lunar2solar(year, 1, 15).date],
            ["龙抬头", calendar.lunar2solar(year, 2, 2).date],
            ["七夕节", calendar.lunar2solar(year, 7, 7).date],
            ["中元节", calendar.lunar2solar(year, 7, 15).date],
            ["重阳节", calendar.lunar2solar(year, 9, 9).date],
            ["寒衣节", calendar.lunar2solar(year, 10, 1).date],
            ["下元节", calendar.lunar2solar(year, 10, 15).date],
            ["腊八节", calendar.lunar2solar(year, 12, 8).date],
            ["小年(北)", calendar.lunar2solar(year, 12, 23).date],
            ["小年(南)", calendar.lunar2solar(year, 12, 24).date]
        ];
        return base.sort((a, b) => new Date(a[1]) - new Date(b[1]));
    }

    function intlFest(year) {
        return [
            ["情人节", fmtYMD(year, 2, 14)],
            ["母亲节", nthWeekdayOfMonth(year, 5, 0, 2)],
            ["父亲节", nthWeekdayOfMonth(year, 6, 0, 3)],
            ["万圣节", fmtYMD(year, 10, 31)],
            ["平安夜", fmtYMD(year, 12, 24)],
            ["圣诞节", fmtYMD(year, 12, 25)],
            ["感恩节(美)", nthWeekdayOfMonth(year, 11, 4, 4)]
        ].sort((a, b) => new Date(a[1]) - new Date(b[1]));
    }

    function nextTrip(list) {
        const arr = list.filter(([_, d]) => dateDiff(todayStr, d) >= 0);
        if (arr.length === 0) return list.slice(0, 3);
        const take = arr.slice(0, 3);
        if (take.length < 3) take.push(...list.slice(0, 3 - take.length));
        return take;
    }

    const TERMS = [...solarTerms(y), ...solarTerms(nextY)];
    const LEGAL = [...legalFest(y), ...legalFest(nextY)];
    const FOLK = [...folkFest(y), ...folkFest(nextY)];
    const INTL = [...intlFest(y), ...intlFest(nextY)];

    const T3 = nextTrip(TERMS);
    const L3 = nextTrip(LEGAL);
    const F3 = nextTrip(FOLK);
    const I3 = nextTrip(INTL);

    const dT0 = dateDiff(todayStr, T3[0][1]), dT1 = dateDiff(todayStr, T3[1][1]), dT2 = dateDiff(todayStr, T3[2][1]);
    const dL0 = dateDiff(todayStr, L3[0][1]), dL1 = dateDiff(todayStr, L3[1][1]), dL2 = dateDiff(todayStr, L3[2][1]);
    const dF0 = dateDiff(todayStr, F3[0][1]), dF1 = dateDiff(todayStr, F3[1][1]), dF2 = dateDiff(todayStr, F3[2][1]);
    const dI0 = dateDiff(todayStr, I3[0][1]), dI1 = dateDiff(todayStr, I3[1][1]), dI2 = dateDiff(todayStr, I3[2][1]);

    /* ========== 参数 & 外链标题/祝词库 ========== */
    const args = parseArgs(typeof $argument !== "undefined" ? $argument : "");
    const SHOW_ALMANAC = toBool(args.SHOW_ALMANAC, false);
    const GAP_LINES = Math.max(0, toInt(args.GAP_LINES, 1));

    const defaultTitles = [
        "距离放假，还要摸鱼多少天？🥱", "坚持住，就快放假啦！💪", "上班好累呀，好想放假😮‍💨",
        "努力，我还能加班24小时！🧐", "天呐，还要多久才放假呀？😭", "躺平中，等放假(☝ ՞ਊ ՞)☝",
        "只有摸鱼才是赚老板的钱🙎🤳", "一起摸鱼吧✌(՞ټ՞ )✌", "摸鱼中，期待下一个假日.ʕʘ‿ʘʔ.",
        "小乌龟慢慢爬🐢", "太难了！😫😩", "今日宜摸鱼，忌早起",
        "{lunar}", "{solar}", "{next}"
    ];
    const defaultBless = {
        "元旦": "新岁启封，诸事顺心。",
        "春节": "春风送暖入屠苏，万象更新福满门。",
        "清明节": "风细雨潇潇，慎终追远寄哀思。",
        "劳动节": "双手创造幸福，汗水亦有光。",
        "端午节": "粽叶飘香龙舟竞，平安康健万事顺。",
        "中秋节": "人月两团圆，心上皆明朗。",
        "国庆节": "山河锦绣，家国同庆。",
        "元宵节": "花灯人月圆，团圆共此时。",
        "龙抬头": "万象抬头，诸事向阳。",
        "中元节": "念亲祈安，心怀敬畏。",
        "重阳节": "登高望远，敬老祈安。",
        "寒衣节": "一纸寒衣，一份牵念。",
        "下元节": "三官赐福，平安顺心。",
        "腊八节": "腊八粥香，岁杪添暖。",
        "小年(北)": "尘旧一扫，迎新纳福。", "小年(南)": "净灶迎福，诸事顺遂。",
        "除夕": "爆竹一声除旧岁，欢喜团圆迎新春。"
    };
    const titlesArr = await fetchJson(args.TITLES_URL, defaultTitles);
    const blessMap = await fetchJson(args.BLESS_URL, defaultBless);

    /* ========== 标题随机 & 正日提醒 ========== */
    function pickTitle(nextName, daysToNext) {
        if (daysToNext === 0) return `今天是 ${nextName}，休息一下吧～`;
        const pool = Array.isArray(titlesArr) && titlesArr.length ? titlesArr : defaultTitles;
        const r = Math.floor(Math.random() * pool.length);
        const raw = String(pool[r] || "");
        return raw
            .replaceAll("{lunar}", titleLunar)
            .replaceAll("{solar}", titleSolar)
            .replaceAll("{next}", nextName ? `下一个：${nextName}` : "");
    }

    function notifyIfToday(name, date) {
        if (dateDiff(todayStr, date) === 0 && tnow.getHours() >= 6) {
            const key = "timecardpushed_" + date;
            if ($persistentStore.read(key) !== "1") {
                $persistentStore.write("1", key);
                const words = blessMap[name] || "节日快乐！";
                $notification.post(`🎉今天是 ${date} ${name}`, "", words);
            }
        }
    }

    notifyIfToday(L3[0][0], L3[0][1]);
    notifyIfToday(F3[0][0], F3[0][1]);

    /* ========== 四行面板输出：法定 | 节气 | 民俗 | 国际 ========== */
    function render3(a0, a1, a2, d0, d1, d2) {
        return (d0 === 0)
            ? `今天：${a0[0]} | ${a1[0]}${d1}天 | ${a2[0]}${d2}天`
            : `${a0[0]}${d0}天 | ${a1[0]}${d1}天 | ${a2[0]}${d2}天`;
    }

    const lineLegal = render3(L3[0], L3[1], L3[2], dL0, dL1, dL2);
    const lineTerm = render3(T3[0], T3[1], T3[2], dT0, dT1, dT2);
    const lineFolk = render3(F3[0], F3[1], F3[2], dF0, dF1, dF2);
    const lineIntl = render3(I3[0], I3[1], I3[2], dI0, dI1, dI2);

// 最近的节日（用于标题）
    let nearest = [L3[0], dL0];
    if (dF0 < nearest[1]) nearest = [F3[0], dF0];
    if (dI0 < nearest[1]) nearest = [I3[0], dI0];

    /* ========== 今日黄历详情（来自 zqzess/openApiData） ========== */
    async function buildAlmanacBlock() {
        // 数据源路径：2025/202511.json 这类
        const date = tnow;
        const year = date.getFullYear();
        const m = date.getMonth() + 1;
        const d = date.getDate();
        const dateStr = `${year}/${m}/${d}`;
        const mm = (m < 10 ? "0" + m : "" + m);
        const yearMonth = `${year}/${year}${mm}.json`;
        const ymCode = encodeURIComponent(yearMonth);
        let apiUrl = `https://raw.githubusercontent.com/zqzess/openApiData/main/calendar/${ymCode}`;

        const raw = await httpGet(apiUrl, 10000);
        if (!raw) return "";
        let json;
        try {
            json = JSON.parse(raw);
        } catch {
            return "";
        }
        if (!json || !json.data || !json.data[0] || !Array.isArray(json.data[0].almanac)) return "";

        const dateArr = dateStr.split("/");
        const target = json.data[0].almanac.find(i =>
            String(i.year) === dateArr[0] &&
            String(i.month) === dateArr[1] &&
            String(i.day) === dateArr[2]
        );
        if (!target) return "";

        let desc = "";
        if (target.desc) desc += target.desc;
        if (target.term) desc += (desc ? " " : "") + target.term;
        if (target.value) desc += (desc ? " " : "") + target.value;

        const head = `干支纪法：${target.gzYear}年 ${target.gzMonth}月 ${target.gzDate}日` + (desc ? " " + desc : "");
        const avoid = target.avoid || "无特别忌讳";
        const suit = target.suit || "随缘而为";

        return [
            "—— 今日黄历 ——",
            head,
            `🈲 忌：${avoid}`,
            `✅ 宜：${suit}`
        ].join("\n");
    }

    /* ========== 拼装面板内容 & 输出 ========== */
    let almanacBlock = "";
    if (SHOW_ALMANAC) {
        try {
            almanacBlock = await buildAlmanacBlock();
        } catch (_) {
            almanacBlock = "";
        }
    }

    /*
    * GAP_LINES 表示“节日行之间要插入几行空行”
    * 0 => "\n"（无空行）
    * 1 => "\n\n"（一行空行）
    * 2 => "\n\n\n"（两行空行）...
    * */
    const gapStr = "\n".repeat(GAP_LINES + 1);

    // 核心节日块（4 行：法定 | 节气 | 民俗 | 国际）
    const coreContent = [lineLegal, lineTerm, lineFolk, lineIntl].join(gapStr);

    // 最终内容：今日黄历详情（如果开启）在上面，节日块在下面
    let content;
    if (almanacBlock) {
        // 上面：今日黄历详情；下面：节日倒数块
        content = `${almanacBlock}\n\n${coreContent}`;
    } else {
        // 未开启 SHOW_ALMANAC 或获取失败时，只显示节日块
        content = coreContent;
    }

    $done({
        title: pickTitle(nearest[0][0], nearest[1]),
        icon: "calendar",
        "icon-color": "#FF9800",
        content
    });
})();