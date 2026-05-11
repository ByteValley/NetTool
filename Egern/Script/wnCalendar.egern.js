/*
 * 今日黄历 - Egern 版
 *
 * 功能：
 * - 支持 Egern Schedule 定时通知
 * - 支持 Egern Generic Widget 小组件
 * - 小组件顶部支持每日一句，默认接口为一言 Hitokoto
 * - 显示今日黄历、干支、宜忌
 * - 最后空一行，分四行显示倒计时：传统节假日、二十四节气、民俗节日、国际节日
 *
 * 默认图标：⭕️宜 / ❌忌
 * 默认卡片：浅色模式白底，深色模式蓝灰底
 */

const DEFAULT_TITLE = '📅 今日黄历';
const HITOKOTO_API = 'https://v1.hitokoto.cn/';
const API_BASE = 'https://raw.githubusercontent.com/zqzess/openApiData/main/calendar/';
const PROXY_BASE = 'https://mirror.ghproxy.com/';
const DEFAULT_MAX_COUNTDOWN_PER_LINE = 4;
const DEFAULT_COUNTDOWN_MONTHS = 18;
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_QUOTE_TIMEOUT_MS = 5000;
const BLANK_LINE = '　';
const DAY_MS = 86400000;

const ICON_PRESETS = {
  circle: { suit: '⭕️', avoid: '❌' },
  check: { suit: '✅', avoid: '❎' },
  mixed: { suit: '✅', avoid: '❌' }
};

const MONTH_MEMORY_CACHE = new Map();

export default async function(ctx) {
  const config = getConfig(ctx);

  try {
    const todayDate = getTargetDate(ctx);
    const todayInfo = getDateInfo(todayDate);
    const monthData = await fetchCalendarData(ctx, todayInfo, config);
    const todayAlmanac = findDateItem(monthData, todayInfo);

    if (!todayAlmanac) throw new Error(`未找到 ${todayInfo.dateText} 的黄历数据`);

    const cached = getCachedCountdowns(ctx, todayInfo, config);
    const countdowns = cached || await buildCountdowns(ctx, todayDate, config);
    if (!cached) setCachedCountdowns(ctx, todayInfo, config, countdowns);

    const quoteTitle = ctx.widgetFamily ? await getDailyQuoteTitle(ctx, todayInfo, config) : config.title;
    const payload = buildPayload(todayAlmanac, todayInfo, countdowns, config, quoteTitle);

    if (ctx.widgetFamily) return buildWidget(ctx, payload, config);

    ctx.notify({ title: payload.title, subtitle: payload.subtitle, body: payload.content, sound: true });
    console.log(`\n${payload.subtitle}\n${payload.content}`);
  } catch (e) {
    const message = `错误：${e && e.message ? e.message : String(e)}`;
    if (ctx.widgetFamily) return buildErrorWidget(ctx, message, config);
    ctx.notify({ title: config.title, body: message, sound: true });
    console.log(message);
  }
}

function getConfig(ctx) {
  const env = ctx && ctx.env ? ctx.env : {};
  const iconStyle = clean(env.ICON_STYLE || env.iconStyle || 'circle');
  const preset = ICON_PRESETS[iconStyle] || ICON_PRESETS.circle;

  return {
    title: clean(env.TITLE || env.title) || DEFAULT_TITLE,
    iconSuit: clean(env.ICON_SUIT || env.suitIcon) || preset.suit,
    iconAvoid: clean(env.ICON_AVOID || env.avoidIcon) || preset.avoid,
    maxCountdownPerLine: readInt(env.MAX_COUNTDOWN_PER_LINE, DEFAULT_MAX_COUNTDOWN_PER_LINE, 1, 12),
    countdownMonths: readInt(env.COUNTDOWN_MONTHS, DEFAULT_COUNTDOWN_MONTHS, 3, 36),
    requestTimeoutMs: readInt(env.REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS, 3000, 60000),
    enableCache: readBool(env.ENABLE_CACHE, true),
    quoteEnable: readBool(env.QUOTE_ENABLE, true),
    quoteShowSource: readBool(env.QUOTE_SHOW_SOURCE, false),
    quoteCategories: clean(env.QUOTE_CATEGORIES) || 'd,i,k',
    quoteMaxLength: readInt(env.QUOTE_MAX_LENGTH, 18, 6, 60),
    quoteTimeoutMs: readInt(env.QUOTE_TIMEOUT_MS, DEFAULT_QUOTE_TIMEOUT_MS, 2000, 30000),
    quoteFallback: clean(env.QUOTE_FALLBACK) || clean(env.TITLE || env.title) || DEFAULT_TITLE,
    lightBackground: clean(env.LIGHT_BACKGROUND) || '#FFFFFF',
    darkBackground: clean(env.DARK_BACKGROUND) || '#475569',
    lightTitleColor: clean(env.LIGHT_TITLE_COLOR) || '#111827',
    darkTitleColor: clean(env.DARK_TITLE_COLOR) || '#FFFFFF',
    lightSubtitleColor: clean(env.LIGHT_SUBTITLE_COLOR) || '#6B7280',
    darkSubtitleColor: clean(env.DARK_SUBTITLE_COLOR) || '#E5E7EB',
    lightBodyColor: clean(env.LIGHT_BODY_COLOR) || '#111827',
    darkBodyColor: clean(env.DARK_BODY_COLOR) || '#F8FAFC',
    lightErrorColor: clean(env.LIGHT_ERROR_COLOR) || '#DC2626',
    darkErrorColor: clean(env.DARK_ERROR_COLOR) || '#FCA5A5'
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

function getTargetDate(ctx) {
  const env = ctx && ctx.env ? ctx.env : {};
  const input = clean(env.DATE || env.date).replaceAll('-', '/');
  const parts = input.split('/').map(Number);
  if (parts.length === 3 && parts.every(Number.isFinite) && parts[0] > 1900) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
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
  return Math.round((startOfDay(toDate).getTime() - startOfDay(fromDate).getTime()) / DAY_MS);
}

async function fetchCalendarData(ctx, dateInfo, config) {
  const cacheKey = dateInfo.filePath;
  if (MONTH_MEMORY_CACHE.has(cacheKey)) return MONTH_MEMORY_CACHE.get(cacheKey);

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
        headers: { Accept: '*/*', 'User-Agent': 'Mozilla/5.0 Egern wnCalendar' }
      });
      const status = resp && (resp.status || resp.statusCode);
      if (!resp || status < 200 || status >= 300) throw new Error(`HTTP ${status || '无响应'}`);

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
  if (typeof resp.text === 'function') return await resp.text();
  if (typeof resp.body === 'string') return resp.body;
  if (resp.body !== undefined && resp.body !== null) return String(resp.body);
  if (typeof resp.json === 'function') return JSON.stringify(await resp.json());
  return '';
}

function flattenAlmanac(json) {
  const list = [];
  for (const block of json.data || []) {
    if (Array.isArray(block.almanac)) list.push(...block.almanac);
  }
  return list;
}

function findDateItem(json, dateInfo) {
  return flattenAlmanac(json).find(item => sameNum(item.year, dateInfo.year) && sameNum(item.month, dateInfo.month) && sameNum(item.day, dateInfo.day));
}

function sameNum(a, b) {
  return Number(a) === Number(b);
}

function storageGet(ctx, key) {
  if (!ctx.storage || !ctx.storage.get) return null;
  try { return ctx.storage.get(key); } catch { return null; }
}

function storageSet(ctx, key, value) {
  if (!ctx.storage || !ctx.storage.set) return;
  try { ctx.storage.set(key, value); } catch {}
}

function getCountdownCacheKey(dateInfo, config) {
  return ['wnCalendar.countdowns', dateInfo.dateKey, config.countdownMonths, config.maxCountdownPerLine].join('.');
}

function getCachedCountdowns(ctx, dateInfo, config) {
  if (!config.enableCache) return null;
  try {
    const raw = storageGet(ctx, getCountdownCacheKey(dateInfo, config));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.traditional) && Array.isArray(parsed.solarTerm) && Array.isArray(parsed.folk) && Array.isArray(parsed.international)) return parsed;
  } catch {}
  return null;
}

function setCachedCountdowns(ctx, dateInfo, config, countdowns) {
  if (!config.enableCache) return;
  storageSet(ctx, getCountdownCacheKey(dateInfo, config), JSON.stringify(countdowns));
}

async function getDailyQuoteTitle(ctx, dateInfo, config) {
  if (!config.quoteEnable) return config.title;

  const cacheKey = ['wnCalendar.quote', dateInfo.dateKey, config.quoteCategories, config.quoteMaxLength, config.quoteShowSource ? 'source' : 'plain'].join('.');
  const cached = storageGet(ctx, cacheKey);
  if (cached) return cached;

  try {
    const quote = await fetchHitokotoQuote(ctx, config);
    if (quote) {
      storageSet(ctx, cacheKey, quote);
      return quote;
    }
  } catch (e) {
    console.log(`每日一句获取失败：${e && e.message ? e.message : String(e)}`);
  }

  return config.quoteFallback || config.title;
}

async function fetchHitokotoQuote(ctx, config) {
  const categories = clean(config.quoteCategories).split(',').map(item => clean(item)).filter(Boolean);
  const categoryQuery = (categories.length ? categories : ['d', 'i', 'k']).map(item => `c=${encodeURIComponent(item)}`).join('&');
  const url = `${HITOKOTO_API}?${categoryQuery}&max_length=${config.quoteMaxLength}&encode=json`;
  const resp = await ctx.http.get(url, {
    timeout: config.quoteTimeoutMs,
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 Egern wnCalendar' }
  });
  const status = resp && (resp.status || resp.statusCode);
  if (!resp || status < 200 || status >= 300) throw new Error(`HTTP ${status || '无响应'}`);

  const text = await readResponseText(resp);
  const json = JSON.parse(text);
  let quote = clean(json.hitokoto);
  if (!quote) return '';

  if (config.quoteShowSource) {
    const source = clean(json.from_who) || clean(json.from);
    if (source) quote = `${quote}｜${source}`;
  }

  return quote;
}

function buildPayload(item, dateInfo, countdowns, config, quoteTitle) {
  const lunarDate = `${clean(item.lMonth)}月${clean(item.lDate)}`;
  const subtitle = `${dateInfo.dateText} ${lunarDate}`;
  const gzText = [item.gzYear ? `${item.gzYear}年` : '', item.gzMonth ? `${item.gzMonth}月` : '', item.gzDate ? `${item.gzDate}日` : ''].filter(Boolean).join(' ');

  const content = [
    `干支纪法：${gzText || '无'}`,
    `${config.iconAvoid}忌：${clean(item.avoid) || '无'}`,
    `${config.iconSuit}宜：${clean(item.suit) || '无'}`,
    BLANK_LINE,
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

  return { title: config.title, widgetTitle: quoteTitle || config.title, subtitle, content, inline };
}

function clean(value) {
  return String(value || '').replaceAll('\n', ' ').replaceAll('\r', ' ').replaceAll('\t', ' ').trim();
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

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

  const result = { traditional: [], solarTerm: [], folk: [], international: [] };

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

  for (const key of Object.keys(result)) {
    result[key] = normalizeCountdowns(result[key], config.maxCountdownPerLine);
  }

  return result;
}

function addCountdownItems(target, names, dateText, days) {
  for (const name of names) target.push({ name, dateText, days });
}

function normalizeCountdowns(list, maxCount) {
  const map = new Map();
  for (const item of list) {
    if (!item.name) continue;
    const old = map.get(item.name);
    if (!old || item.days < old.days) map.set(item.name, item);
  }
  return [...map.values()].sort((a, b) => a.days - b.days).slice(0, maxCount);
}

function formatCountdownLine(list) {
  if (!list || !list.length) return '无';
  return list.map(item => item.days === 0 ? `${item.name}今天` : `${item.name}${item.days}天`).join('｜');
}

function classifyFestivalItem(item, dateObj) {
  const text = [item.desc, item.term, item.value, item.festival, item.lFestival, item.sFestival, item.holiday].map(clean).filter(Boolean).join(' ');
  const traditional = [];
  const solarTerm = [];
  const folk = [];
  const international = [];

  addMatches(traditional, text, ['元旦', '春节', '除夕', '清明节', '劳动节', '端午节', '中秋节', '国庆节']);
  addMatches(folk, text, ['元宵节', '龙抬头', '社日节', '寒食节', '上巳节', '七夕节', '中元节', '重阳节', '下元节', '腊八节', '小年', '冬至']);
  addMatches(international, text, ['情人节', '妇女节', '愚人节', '世界地球日', '母亲节', '护士节', '儿童节', '父亲节', '教师节', '万圣夜', '万圣节', '感恩节', '平安夜', '圣诞节']);

  const term = clean(item.term);
  if (term) solarTerm.push(term);
  if (term === '清明') traditional.push('清明节');
  if (term === '冬至') folk.push('冬至');

  addGregorianFestivals(traditional, international, dateObj);
  addLunarFestivals(traditional, folk, item);

  return { traditional: unique(traditional), solarTerm: unique(solarTerm), folk: unique(folk), international: unique(international) };
}

function addMatches(target, text, names) {
  for (const name of names) {
    if (text.includes(name)) target.push(name);
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
  let month = clean(value);
  if (month.startsWith('闰')) month = month.slice(1);
  if (month.endsWith('月')) month = month.slice(0, -1);
  return month;
}

function isDarkMode(ctx) {
  if (!ctx) return false;
  if (typeof ctx.isDarkMode === 'boolean') return ctx.isDarkMode;
  if (typeof ctx.darkMode === 'boolean') return ctx.darkMode;

  const candidates = [ctx.colorScheme, ctx.appearance, ctx.theme, ctx.userInterfaceStyle, ctx.displayMode];
  for (const item of candidates) {
    if (typeof item === 'string' && item.toLowerCase().includes('dark')) return true;
  }
  return false;
}

function getPalette(ctx, config) {
  const dark = isDarkMode(ctx);
  return {
    background: dark ? config.darkBackground : config.lightBackground,
    titleColor: dark ? config.darkTitleColor : config.lightTitleColor,
    subtitleColor: dark ? config.darkSubtitleColor : config.lightSubtitleColor,
    bodyColor: dark ? config.darkBodyColor : config.lightBodyColor,
    errorColor: dark ? config.darkErrorColor : config.lightErrorColor
  };
}

function buildWidget(ctx, payload, config) {
  const family = ctx.widgetFamily;
  const palette = getPalette(ctx, config);

  if (family === 'accessoryInline') {
    return { type: 'widget', children: [{ type: 'text', text: `${payload.widgetTitle} ${payload.inline}`, font: { size: 'caption1', weight: 'semibold' }, textColor: palette.titleColor, maxLines: 1, minScale: 0.7 }] };
  }

  if (family === 'accessoryCircular') {
    return { type: 'widget', padding: 4, children: [{ type: 'text', text: payload.inline.split('｜')[0] || payload.widgetTitle, font: { size: 'caption2', weight: 'bold' }, textColor: palette.titleColor, textAlign: 'center', maxLines: 2, minScale: 0.55 }] };
  }

  if (family === 'accessoryRectangular') {
    return {
      type: 'widget',
      padding: 8,
      gap: 3,
      children: [
        { type: 'text', text: payload.widgetTitle, font: { size: 'headline', weight: 'bold' }, textColor: palette.titleColor, maxLines: 1, minScale: 0.72 },
        { type: 'text', text: payload.subtitle, font: { size: 'caption1', weight: 'medium' }, textColor: palette.subtitleColor, maxLines: 1 },
        { type: 'text', text: payload.inline, font: { size: 'caption2' }, textColor: palette.bodyColor, maxLines: 2, minScale: 0.7 }
      ]
    };
  }

  const isSmall = family === 'systemSmall';
  const isMedium = family === 'systemMedium';
  const lines = payload.content.split('\n');
  let body = payload.content;

  if (isSmall) body = lines.slice(0, 6).join('\n');
  if (isMedium) body = lines.slice(0, 8).join('\n');

  return {
    type: 'widget',
    padding: 14,
    gap: 6,
    backgroundColor: palette.background,
    children: [
      { type: 'text', text: payload.widgetTitle, font: { size: 'headline', weight: 'bold' }, textColor: palette.titleColor, maxLines: 1, minScale: 0.72 },
      { type: 'text', text: payload.subtitle, font: { size: 'caption1', weight: 'medium' }, textColor: palette.subtitleColor, maxLines: 1 },
      { type: 'text', text: body, font: { size: isSmall ? 11 : 13, weight: 'regular' }, textColor: palette.bodyColor, maxLines: isSmall ? 7 : 12, minScale: 0.62 }
    ]
  };
}

function buildErrorWidget(ctx, message, config) {
  const palette = getPalette(ctx, config);
  return {
    type: 'widget',
    padding: 14,
    gap: 6,
    backgroundColor: palette.background,
    children: [
      { type: 'text', text: config.title || DEFAULT_TITLE, font: { size: 'headline', weight: 'bold' }, textColor: palette.titleColor },
      { type: 'text', text: message, font: { size: 'caption1' }, textColor: palette.errorColor, maxLines: 6, minScale: 0.7 }
    ]
  };
}
