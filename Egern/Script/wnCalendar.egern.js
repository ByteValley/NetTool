/*
 * 今日黄历 - Egern 版
 *
 * 功能：
 * - 支持 Egern Schedule 定时通知
 * - 支持 Egern Generic Widget 小组件
 * - 显示今日黄历、干支、宜忌
 * - 最后空一行，分四行显示倒计时：传统节假日、二十四节气、民俗节日、国际节日
 *
 * 默认图标：⭕️宜 / ❌忌
 *
 * Env 参数：
 * - TITLE: 标题，默认 📅 今日黄历
 * - ICON_STYLE: circle / check / mixed
 * - ICON_SUIT: 自定义宜图标
 * - ICON_AVOID: 自定义忌图标
 * - MAX_COUNTDOWN_PER_LINE: 每行倒计时数量，默认 4
 * - COUNTDOWN_MONTHS: 向后扫描月份，默认 18
 * - ENABLE_CACHE: 是否启用当天缓存，默认 true
 * - DATE: 测试日期，例如 2026-05-11
 */

const DEFAULT_TITLE = '📅 今日黄历';

const API_BASE = 'https://raw.githubusercontent.com/zqzess/openApiData/main/calendar/';
const PROXY_BASE = 'https://mirror.ghproxy.com/';

const DEFAULT_MAX_COUNTDOWN_PER_LINE = 4;
const DEFAULT_COUNTDOWN_MONTHS = 18;
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

const ICON_PRESETS = {
  circle: {
    suit: '⭕️',
    avoid: '❌'
  },
  check: {
    suit: '✅',
    avoid: '❎'
  },
  mixed: {
    suit: '✅',
    avoid: '❌'
  }
};

const DEFAULT_ICON_STYLE = 'circle';
const MONTH_MEMORY_CACHE = new Map();

export default async function(ctx) {
  const config = getConfig(ctx);

  try {
    const targetDate = getTargetDate(ctx);
    const dateInfo = getDateInfo(targetDate);

    const currentMonthData = await fetchCalendarData(ctx, dateInfo, config);
    const today = findToday(currentMonthData, dateInfo);

    if (!today) {
      throw new Error(`未找到 ${dateInfo.dateText} 的黄历数据`);
    }

    const cached = getCachedCountdowns(ctx, dateInfo, config);
    const countdowns = cached || await buildCountdowns(ctx, targetDate, config);

    if (!cached) {
      setCachedCountdowns(ctx, dateInfo, config, countdowns);
    }

    const payload = buildPayload(today, dateInfo, countdowns, config);

    if (ctx.widgetFamily) {
      return buildWidget(ctx, payload, config);
    }

    ctx.notify({
      title: payload.title,
      subtitle: payload.subtitle,
      body: payload.content,
      sound: true
    });

    console.log(`\n${payload.subtitle}\n${payload.content}`);
  } catch (e) {
    const message = `错误：${e && e.message ? e.message : String(e)}`;

    if (ctx.widgetFamily) {
      return buildErrorWidget(message, config);
    }

    ctx.notify({
      title: config.title,
      body: message,
      sound: true
    });

    console.log(message);
  }
}

/* 配置读取 */

function getConfig(ctx) {
  const env = ctx && ctx.env ? ctx.env : {};
  const iconStyle = clean(env.ICON_STYLE || env.iconStyle || DEFAULT_ICON_STYLE);
  const iconPreset = ICON_PRESETS[iconStyle] || ICON_PRESETS[DEFAULT_ICON_STYLE];

  return {
    title: clean(env.TITLE || env.title) || DEFAULT_TITLE,
    iconStyle,
    iconSuit: clean(env.ICON_SUIT || env.suitIcon) || iconPreset.suit,
    iconAvoid: clean(env.ICON_AVOID || env.avoidIcon) || iconPreset.avoid,
    maxCountdownPerLine: readInt(env.MAX_COUNTDOWN_PER_LINE, DEFAULT_MAX_COUNTDOWN_PER_LINE, 1, 12),
    countdownMonths: readInt(env.COUNTDOWN_MONTHS, DEFAULT_COUNTDOWN_MONTHS, 3, 36),
    requestTimeoutMs: readInt(env.REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS, 3000, 60000),
    enableCache: readBool(env.ENABLE_CACHE, true),
    backgroundStart: clean(env.BACKGROUND_START) || '#5B5FEF',
    backgroundEnd: clean(env.BACKGROUND_END) || '#7C3AED'
  };
}

function readInt(value, fallback, min, max) {
  const num = Number(value);

  if (!Number.isFinite(num)) return fallback;

  return Math.min(Math.max(Math.floor(num), min), max);
}

function readBool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;

  const text = String(value).trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;

  return fallback;
}

/* 日期处理 */

function getTargetDate(ctx) {
  const env = ctx && ctx.env ? ctx.env : {};
  const input = clean(env.DATE || env.date);

  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(input)) {
    const [year, month, day] = input.split(/[-/]/).map(Number);
    return new Date(year, month - 1, day);
  }

  return new Date();
}

function getDateInfo(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  return {
    year,
    month,
    day,
    month2: pad(month),
    day2: pad(day),
    dateText: `${year}/${month}/${day}`,
    dateKey: `${year}${pad(month)}${pad(day)}`,
    filePath: `${year}/${year}${pad(month)}.json`
  };
}

function pad(num) {
  return String(num).padStart(2, '0');
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addMonths(date, offset) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function diffDays(fromDate, toDate) {
  const from = startOfDay(fromDate).getTime();
  const to = startOfDay(toDate).getTime();

  return Math.round((to - from) / 86400000);
}

/* 数据请求 */

async function fetchCalendarData(ctx, dateInfo, config) {
  const cacheKey = dateInfo.filePath;

  if (MONTH_MEMORY_CACHE.has(cacheKey)) {
    return MONTH_MEMORY_CACHE.get(cacheKey);
  }

  const filePath = dateInfo.filePath;
  const encodedPath = encodeURIComponent(filePath);

  const urls = [
    `${API_BASE}${filePath}`,
    `${API_BASE}${encodedPath}`,
    `${PROXY_BASE}${API_BASE}${filePath}`,
    `${PROXY_BASE}${API_BASE}${encodedPath}`
  ];

  let lastError = null;

  for (const url of urls) {
    try {
      const resp = await ctx.http.get(url, {
        timeout: config.requestTimeoutMs,
        headers: {
          Accept: '*/*',
          'User-Agent': 'Mozilla/5.0 Egern wnCalendar'
        }
      });

      const status = resp && (resp.status || resp.statusCode);

      if (!resp || status < 200 || status >= 300) {
        throw new Error(`HTTP ${status || '无响应'}`);
      }

      const text = await readResponseText(resp);
      const json = JSON.parse(text);

      if (json && Array.isArray(json.data)) {
        MONTH_MEMORY_CACHE.set(cacheKey, json);
        return json;
      }

      throw new Error('数据结构异常');
    } catch (e) {
      lastError = e;
    }
  }

  throw new Error(`黄历数据请求失败：${lastError && lastError.message ? lastError.message : String(lastError)}`);
}

async function readResponseText(resp) {
  if (typeof resp.text === 'function') {
    return await resp.text();
  }

  if (typeof resp.body === 'string') {
    return resp.body;
  }

  if (resp.body !== undefined && resp.body !== null) {
    return String(resp.body);
  }

  if (typeof resp.json === 'function') {
    return JSON.stringify(await resp.json());
  }

  return '';
}

function flattenAlmanac(json) {
  const list = [];

  for (const block of json.data || []) {
    if (Array.isArray(block.almanac)) {
      list.push(...block.almanac);
    }
  }

  return list;
}

function findToday(json, dateInfo) {
  return flattenAlmanac(json).find(item => {
    return sameNum(item.year, dateInfo.year)
      && sameNum(item.month, dateInfo.month)
      && sameNum(item.day, dateInfo.day);
  });
}

function sameNum(a, b) {
  return Number(a) === Number(b);
}

/* 缓存 */

function getCountdownCacheKey(dateInfo, config) {
  return [
    'wnCalendar.countdowns',
    dateInfo.dateKey,
    config.countdownMonths,
    config.maxCountdownPerLine
  ].join('.');
}

function getCachedCountdowns(ctx, dateInfo, config) {
  if (!config.enableCache || !ctx.storage || !ctx.storage.get) return null;

  try {
    const raw = ctx.storage.get(getCountdownCacheKey(dateInfo, config));
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    if (
      parsed
      && Array.isArray(parsed.traditional)
      && Array.isArray(parsed.solarTerm)
      && Array.isArray(parsed.folk)
      && Array.isArray(parsed.international)
    ) {
      return parsed;
    }
  } catch {}

  return null;
}

function setCachedCountdowns(ctx, dateInfo, config, countdowns) {
  if (!config.enableCache || !ctx.storage || !ctx.storage.set) return;

  try {
    ctx.storage.set(getCountdownCacheKey(dateInfo, config), JSON.stringify(countdowns));
  } catch {}
}

/* 内容生成 */

function buildPayload(item, dateInfo, countdowns, config) {
  const lunarDate = `${clean(item.lMonth)}月${clean(item.lDate)}`;
  const subtitle = `${dateInfo.dateText} ${lunarDate}`;

  const gzText = [
    item.gzYear ? `${item.gzYear}年` : '',
    item.gzMonth ? `${item.gzMonth}月` : '',
    item.gzDate ? `${item.gzDate}日` : ''
  ].filter(Boolean).join(' ');

  const content = [
    `干支纪法：${gzText || '无'}`,
    `${config.iconAvoid}忌：${clean(item.avoid) || '无'}`,
    `${config.iconSuit}宜：${clean(item.suit) || '无'}`,
    '',
    `传统节假日：${formatCountdownLine(countdowns.traditional)}`,
    `二十四节气：${formatCountdownLine(countdowns.solarTerm)}`,
    `民俗节日：${formatCountdownLine(countdowns.folk)}`,
    `国际节日：${formatCountdownLine(countdowns.international)}`
  ].join('\n');

  const inline = formatCountdownLine([
    ...countdowns.traditional.slice(0, 1),
    ...countdowns.solarTerm.slice(0, 1),
    ...countdowns.folk.slice(0, 1),
    ...countdowns.international.slice(0, 1)
  ]);

  return {
    title: config.title,
    subtitle,
    content,
    inline
  };
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

/* 倒计时核心 */

async function buildCountdowns(ctx, todayDate, config) {
  const allItems = [];

  for (let i = 0; i < config.countdownMonths; i++) {
    const monthDate = addMonths(todayDate, i);
    const monthInfo = getDateInfo(monthDate);

    try {
      const json = await fetchCalendarData(ctx, monthInfo, config);
      allItems.push(...flattenAlmanac(json));
    } catch (e) {
      console.log(`跳过 ${monthInfo.year}-${monthInfo.month2}：${e && e.message ? e.message : String(e)}`);
    }
  }

  const result = {
    traditional: [],
    solarTerm: [],
    folk: [],
    international: []
  };

  for (const item of allItems) {
    const itemDate = new Date(Number(item.year), Number(item.month) - 1, Number(item.day));
    const days = diffDays(todayDate, itemDate);

    if (days < 0) continue;

    const dateText = `${itemDate.getFullYear()}/${itemDate.getMonth() + 1}/${itemDate.getDate()}`;
    const classified = classifyFestivalItem(item, itemDate);

    addCountdownItems(result.traditional, classified.traditional, dateText, days);
    addCountdownItems(result.solarTerm, classified.solarTerm, dateText, days);
    addCountdownItems(result.folk, classified.folk, dateText, days);
    addCountdownItems(result.international, classified.international, dateText, days);
  }

  result.traditional = normalizeCountdowns(result.traditional, config.maxCountdownPerLine);
  result.solarTerm = normalizeCountdowns(result.solarTerm, config.maxCountdownPerLine);
  result.folk = normalizeCountdowns(result.folk, config.maxCountdownPerLine);
  result.international = normalizeCountdowns(result.international, config.maxCountdownPerLine);

  return result;
}

function addCountdownItems(target, names, dateText, days) {
  for (const name of names) {
    target.push({
      name,
      dateText,
      days
    });
  }
}

function normalizeCountdowns(list, maxCount) {
  const map = new Map();

  for (const item of list) {
    if (!item.name) continue;

    const old = map.get(item.name);

    if (!old || item.days < old.days) {
      map.set(item.name, item);
    }
  }

  return [...map.values()]
    .sort((a, b) => a.days - b.days)
    .slice(0, maxCount);
}

function formatCountdownLine(list) {
  if (!list || !list.length) return '无';

  return list.map(item => {
    if (item.days === 0) return `${item.name}今天`;
    return `${item.name}${item.days}天`;
  }).join('｜');
}

/* 节日分类 */

function classifyFestivalItem(item, dateObj) {
  const text = [
    item.desc,
    item.term,
    item.value,
    item.festival,
    item.lFestival,
    item.sFestival,
    item.holiday
  ].map(clean).filter(Boolean).join(' ');

  const traditional = [];
  const solarTerm = [];
  const folk = [];
  const international = [];

  addMatches(traditional, text, [
    '元旦',
    '春节',
    '除夕',
    '清明节',
    '劳动节',
    '端午节',
    '中秋节',
    '国庆节'
  ]);

  addMatches(folk, text, [
    '元宵节',
    '龙抬头',
    '社日节',
    '寒食节',
    '上巳节',
    '七夕节',
    '中元节',
    '重阳节',
    '下元节',
    '腊八节',
    '小年',
    '冬至'
  ]);

  addMatches(international, text, [
    '情人节',
    '妇女节',
    '愚人节',
    '世界地球日',
    '母亲节',
    '护士节',
    '儿童节',
    '父亲节',
    '教师节',
    '万圣夜',
    '万圣节',
    '感恩节',
    '平安夜',
    '圣诞节'
  ]);

  const term = clean(item.term);

  if (term) {
    solarTerm.push(term);
  }

  if (term === '清明') {
    traditional.push('清明节');
  }

  if (term === '冬至') {
    folk.push('冬至');
  }

  addGregorianFestivals(traditional, international, dateObj);
  addLunarFestivals(traditional, folk, item);

  return {
    traditional: unique(traditional),
    solarTerm: unique(solarTerm),
    folk: unique(folk),
    international: unique(international)
  };
}

function addMatches(target, text, names) {
  for (const name of names) {
    if (text.includes(name)) {
      target.push(name);
    }
  }
}

function addGregorianFestivals(traditional, international, dateObj) {
  const month = dateObj.getMonth() + 1;
  const day = dateObj.getDate();

  if (month === 1 && day === 1) traditional.push('元旦');
  if (month === 5 && day === 1) traditional.push('劳动节');
  if (month === 10 && day === 1) traditional.push('国庆节');

  if (month === 2 && day === 14) international.push('情人节');
  if (month === 3 && day === 8) international.push('妇女节');
  if (month === 4 && day === 1) international.push('愚人节');
  if (month === 4 && day === 22) international.push('世界地球日');
  if (month === 5 && isNthWeekday(dateObj, 0, 2)) international.push('母亲节');
  if (month === 5 && day === 12) international.push('护士节');
  if (month === 6 && day === 1) international.push('儿童节');
  if (month === 6 && isNthWeekday(dateObj, 0, 3)) international.push('父亲节');
  if (month === 9 && day === 10) international.push('教师节');
  if (month === 10 && day === 31) international.push('万圣夜');
  if (month === 11 && isNthWeekday(dateObj, 4, 4)) international.push('感恩节');
  if (month === 12 && day === 24) international.push('平安夜');
  if (month === 12 && day === 25) international.push('圣诞节');
}

function isNthWeekday(dateObj, weekday, nth) {
  return dateObj.getDay() === weekday && Math.ceil(dateObj.getDate() / 7) === nth;
}

function addLunarFestivals(traditional, folk, item) {
  const lunarMonth = normalizeLunarMonth(item.lMonth);
  const lunarDate = clean(item.lDate);

  if (lunarMonth === '正' && lunarDate === '初一') traditional.push('春节');
  if (lunarMonth === '正' && lunarDate === '十五') folk.push('元宵节');
  if (lunarMonth === '二' && lunarDate === '初二') folk.push('龙抬头');
  if (lunarMonth === '三' && lunarDate === '初三') folk.push('上巳节');
  if (lunarMonth === '五' && lunarDate === '初五') traditional.push('端午节');
  if (lunarMonth === '七' && lunarDate === '初七') folk.push('七夕节');
  if (lunarMonth === '七' && lunarDate === '十五') folk.push('中元节');
  if (lunarMonth === '八' && lunarDate === '十五') traditional.push('中秋节');
  if (lunarMonth === '九' && lunarDate === '初九') folk.push('重阳节');
  if ((lunarMonth === '十' || lunarMonth === '冬') && lunarDate === '十五') folk.push('下元节');
  if ((lunarMonth === '十二' || lunarMonth === '腊') && lunarDate === '初八') folk.push('腊八节');
  if ((lunarMonth === '十二' || lunarMonth === '腊') && (lunarDate === '廿三' || lunarDate === '廿四')) folk.push('小年');
  if ((lunarMonth === '十二' || lunarMonth === '腊') && lunarDate === '三十') traditional.push('除夕');
}

function normalizeLunarMonth(value) {
  return clean(value)
    .replace(/^闰/, '')
    .replace(/月$/, '');
}

/* 小组件 */

function buildWidget(ctx, payload, config) {
  const family = ctx.widgetFamily;

  if (family === 'accessoryInline') {
    return {
      type: 'widget',
      children: [
        {
          type: 'text',
          text: `${payload.title} ${payload.inline}`,
          font: { size: 'caption1', weight: 'semibold' },
          maxLines: 1,
          minScale: 0.7
        }
      ]
    };
  }

  if (family === 'accessoryCircular') {
    return {
      type: 'widget',
      padding: 4,
      children: [
        {
          type: 'text',
          text: payload.inline.split('｜')[0] || payload.title,
          font: { size: 'caption2', weight: 'bold' },
          textAlign: 'center',
          maxLines: 2,
          minScale: 0.55
        }
      ]
    };
  }

  if (family === 'accessoryRectangular') {
    return {
      type: 'widget',
      padding: 8,
      gap: 3,
      children: [
        {
          type: 'text',
          text: payload.title,
          font: { size: 'headline', weight: 'bold' },
          maxLines: 1
        },
        {
          type: 'text',
          text: payload.subtitle,
          font: { size: 'caption1', weight: 'medium' },
          maxLines: 1
        },
        {
          type: 'text',
          text: payload.inline,
          font: { size: 'caption2' },
          maxLines: 2,
          minScale: 0.7
        }
      ]
    };
  }

  const isSmall = family === 'systemSmall';
  const isMedium = family === 'systemMedium';

  let body = payload.content;

  if (isSmall) {
    body = payload.content.split('\n').filter(Boolean).slice(0, 6).join('\n');
  }

  if (isMedium) {
    body = payload.content.split('\n').filter(Boolean).slice(0, 7).join('\n');
  }

  return {
    type: 'widget',
    padding: 14,
    gap: 6,
    backgroundGradient: {
      type: 'linear',
      colors: [config.backgroundStart, config.backgroundEnd],
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 1 }
    },
    children: [
      {
        type: 'text',
        text: payload.title,
        font: { size: 'headline', weight: 'bold' },
        textColor: '#FFFFFF',
        maxLines: 1
      },
      {
        type: 'text',
        text: payload.subtitle,
        font: { size: 'caption1', weight: 'medium' },
        textColor: '#FFFFFFDD',
        maxLines: 1
      },
      {
        type: 'text',
        text: body,
        font: { size: isSmall ? 11 : 13, weight: 'regular' },
        textColor: '#FFFFFF',
        maxLines: isSmall ? 7 : 12,
        minScale: 0.62
      }
    ]
  };
}

function buildErrorWidget(message, config) {
  return {
    type: 'widget',
    padding: 14,
    gap: 6,
    backgroundColor: '#1F2937',
    children: [
      {
        type: 'text',
        text: config.title || DEFAULT_TITLE,
        font: { size: 'headline', weight: 'bold' },
        textColor: '#FFFFFF'
      },
      {
        type: 'text',
        text: message,
        font: { size: 'caption1' },
        textColor: '#FFB4B4',
        maxLines: 6,
        minScale: 0.7
      }
    ]
  };
}
