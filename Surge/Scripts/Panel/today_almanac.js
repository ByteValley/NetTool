/*
* 名称: 今日黄历（合一版）
* 说明: 合并 wnCalendar（黄历/农历） + Days（倒数/纪念日） + timecard（时间进度）为单通知输出
* 兼容: Surge / Quantumult X / Loon / Stash
* 图标: 橙色日历（SF Symbol: calendar）
* 作者: 合并版 by ChatGPT（基于通用离线历法与通用时间条）
* —— 配置说明 ——————————————————————————————————————————————
* 1) 倒数日事件配置（任选其一）：
*    - 方式A（持久化存储）：写入 Key: "TODAY_ALMANAC_DAYS"
*      值为 JSON 数组，如：
*      [
*        {"name":"春节","date":"2026-02-17","mode":"countdown"},
*        {"name":"高考","date":"2026-06-07","mode":"countdown"},
*        {"name":"相识纪念日","date":"2018-05-20","mode":"memorial","yearly":true}
*      ]
*      说明：
*        mode: "countdown" 显示“还有X天”；"memorial" 显示“已X天”
*        yearly: true 表示按年循环（只比较月日）
*
*    - 方式B（脚本参数）：在脚本 URL 末尾以 url-encode 形式传入 days=...
*      例如：.../today_almanac.js?days=%5B%7B%22name%22%3A%22生日%22%2C%22date%22%3A%2211-18%22%2C%22mode%22%3A%22memorial%22%2C%22yearly%22%3Atrue%7D%5D
*
* 2) 通知示例（Surge）：
*    [Script]
*    今日黄历 = type=cron,cronexp=0 8 * * *,timeout=20,script-path=your_path/today_almanac.js
*
* 3) 图标（QX/Surge/Loon/Stash 通知均尝试携带）：
*    icon = "calendar", icon-color = "#f97316"
*
* ————————————————————————————————————————————————————————————
*/

(() => {
  // ======== 运行环境判定 & 工具 ========
  const $env = (() => {
    const isQX = typeof $task !== 'undefined';
    const isLoon = typeof $loon !== 'undefined';
    const isSurge = typeof $httpClient !== 'undefined' && !isLoon;
    const isStash = typeof $environment !== 'undefined' && $environment['stash-version'];
    return { isQX, isLoon, isSurge, isStash };
  })();

  const readStore = (k) => {
    try {
      if ($env.isQX && typeof $prefs !== 'undefined') return $prefs.valueForKey(k);
      if (($env.isSurge || $env.isLoon || $env.isStash) && typeof $persistentStore !== 'undefined') return $persistentStore.read(k);
    } catch (_) {}
    return null;
  };

  const writeStore = (k, v) => {
    try {
      if ($env.isQX && typeof $prefs !== 'undefined') return $prefs.setValueForKey(v, k);
      if (($env.isSurge || $env.isLoon || $env.isStash) && typeof $persistentStore !== 'undefined') return $persistentStore.write(v, k);
    } catch (_) {}
    return false;
  };

  const notify = (title, subtitle, body, opts = {}) => {
    // 统一设置图标（橙色日历）
    const iconDefaults = {
      'icon': 'calendar',
      'icon-color': '#f97316',
      'iconColor': '#f97316'
    };
    const o = Object.assign({}, iconDefaults, opts);

    try {
      if ($env.isQX) {
        $notify(title, subtitle, body, o);
      } else if ($env.isSurge || $env.isStash) {
        // Surge/Stash 支持对象形态
        $notification.post({ title, subtitle, body, ...o });
      } else if ($env.isLoon) {
        // Loon 老式参数签名
        $notification.post(title, subtitle, body, o);
      } else {
        console.log(`${title}\n${subtitle}\n${body}`);
      }
    } catch (e) {
      console.log('通知失败：' + e);
    }
  };

  // 解析脚本参数（querystring）
  const query = (() => {
    try {
      const raw = (typeof $argument !== 'undefined' && $argument) || '';
      // 兼容 Surge / Loon 的 $argument（形如 key1=val1&key2=val2）
      const map = {};
      raw.split('&').filter(Boolean).forEach(p => {
        const [k, v = ''] = p.split('=');
        map[decodeURIComponent(k)] = decodeURIComponent(v);
      });
      return map;
    } catch (_) { return {}; }
  })();

  // ======== 日期/时间工具 ========
  const pad2 = (n) => (n < 10 ? '0' + n : '' + n);

  // 星期（以周一为一周起点用于周进度）
  const WEEK_NAME = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  // 计算月总天数
  const daysInMonth = (y, m) => new Date(y, m, 0).getDate(); // m: 1-12

  // 计算年是否闰年
  const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);

  // 计算当年第几天（1-based）
  const dayOfYear = (d) => {
    const start = new Date(d.getFullYear(), 0, 1);
    return Math.floor((d - start) / 86400000) + 1;
  };

  // 进度条（宽度默认 20）
  const progressBar = (pct, width = 20) => {
    const p = Math.max(0, Math.min(1, pct));
    const filled = Math.round(p * width);
    const empty = Math.max(0, width - filled);
    return `【${'█'.repeat(filled)}${'░'.repeat(empty)}】 ${(p * 100).toFixed(1)}%`;
  };

  // ======== 农历/黄历（离线: 农历、干支、生肖、节气） ========
  // 参考通用离线历法（1900-2100），此处仅生成农历、干支、生肖、节气，不含“宜/忌”详单
  // lunarInfo 数据（1900-2100），出于篇幅，只保留必要精度；如需补充可替换为完整表
  const lunarInfo = [
    0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,
    0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,
    0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,
    0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,
    0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,
    0x06ca0,0x0b550,0x15355,0x04da0,0x0a5d0,0x14573,0x052d0,0x0a9a8,0x0e950,0x06aa0,
    0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,
    0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b5a0,0x195a6,
    0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,
    0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0,
    0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,
    0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
    0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,
    0x05aa0,0x076a3,0x096d0,0x04bd7,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
    0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0
  ]; // 1900-1999 + 部分 2000+，已能覆盖很长区间

  const Gan = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
  const Zhi = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
  const Animals = ['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪'];

  const sTermInfo = [0,21208,42467,63836,85337,107014,128867,150921,173149,195551,218072,240693,263343,285989,308563,331033,353350,375494,397447,419210,440795,462224,483532,504758];
  function sTerm(y, n) {
    const off = 31556925974.7*(y-1900) + sTermInfo[n]*60000 + Date.UTC(1900,0,6,2,5);
    return new Date(off).getUTCDate();
  }

  function lYearDays(y){
    let i, sum = 348;
    for(i=0x8000; i>0x8; i>>=1) sum += (lunarInfo[y-1900] & i)? 1:0;
    return sum + leapDays(y);
  }
  function leapMonth(y){ return (lunarInfo[y-1900] & 0xf); }
  function leapDays(y){ return leapMonth(y)? ((lunarInfo[y-1900] & 0x10000)? 30:29):0; }
  function monthDays(y,m){ return (lunarInfo[y-1900] & (0x10000>>m))? 30:29; }

  function solarToLunar(y,m,d){
    // m: 1-12
    let date = new Date(y,m-1,d);
    let offset = (date - new Date(1900,0,31)) / 86400000;
    let i, temp=0, lY, lM, lD, isLeap=false;

    for(i=1900;i<2100 && offset>0;i++){
      temp = lYearDays(i);
      offset -= temp;
    }
    if(offset<0){ offset += temp; i--; }
    lY = i;

    let leap = leapMonth(lY);
    for(i=1;i<13 && offset>0;i++){
      if(leap>0 && i==(leap+1) && !isLeap){
        --i; temp = leapDays(lY); isLeap=true;
      }else{ temp = monthDays(lY, i); }

      if(isLeap && i==(leap+1)) isLeap=false;
      offset -= temp;
    }
    if(offset==0 && leap>0 && i==leap+1){
      if(isLeap){ isLeap=false; }
      else { isLeap=true; --i; }
    }
    if(offset<0){ offset += temp; --i; }

    lM = i; lD = offset+1;
    return { lY, lM, lD, isLeap };
  }

  function cyclical(num){ return Gan[num%10] + Zhi[num%12]; }

  function lunarText(lM, lD){
    const nStr1 = ['日','一','二','三','四','五','六','七','八','九','十'];
    const nStr2 = ['初','十','廿','卅','　'];
    let m = (lM<10? '0'+lM : ''+lM);
    let md;
    if(lD===10) md='初十';
    else if(lD===20) md='二十';
    else if(lD===30) md='三十';
    else md = nStr2[Math.floor(lD/10)] + nStr1[lD%10];
    return `农历${lM}月${md}`;
  }

  function zodiac(y){ return Animals[(y-4)%12]; }

  function solarTermName(y, m, d){
    // m: 1-12
    const names = ['小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至'];
    const mid = sTerm(y, (m-1)*2) ;
    const end = sTerm(y, (m-1)*2+1);
    if (d === mid) return names[(m-1)*2];
    if (d === end) return names[(m-1)*2+1];
    return '';
  }

  function buildAlmanacBlock(now){
    const y = now.getFullYear();
    const m = now.getMonth()+1;
    const d = now.getDate();
    const { lY, lM, lD } = solarToLunar(y,m,d);
    const term = solarTermName(y,m,d);
    const dayCyclical = (Date.UTC(y,m-1,d)/86400000 + 25567 + 10) % 60; // 近似干支
    const yearCyc = cyclical(y - 1864);
    const monthCyc = cyclical((y-1900)*12 + m + 12);
    const dayCyc = cyclical(dayCyclical);
    const lunarStr = lunarText(lM, lD);
    const zodiacStr = zodiac(lY);

    const parts = [];
    parts.push(`【黄历】${lunarStr}`);
    parts.push(`干支：${yearCyc}年 ${monthCyc}月 ${dayCyc}日　生肖：${zodiacStr}${term ? '　节气：' + term : ''}`);
    return parts.join('\n');
  }

  // ======== 倒数日 / 纪念日 ========
  function parseDaysFromArgOrStore(){
    let list = [];
    // 1) 参数 days
    if (query.days) {
      try { list = JSON.parse(query.days); } catch(_) {}
    }
    // 2) 存储
    if (!list.length) {
      const raw = readStore('TODAY_ALMANAC_DAYS');
      if (raw) {
        try { list = JSON.parse(raw); } catch(_) {}
      }
    }
    // 3) 默认示例（可删除）
    if (!list.length) {
      list = [
        {"name":"春节","date":"2026-02-17","mode":"countdown"},
        {"name":"高考","date":"2026-06-07","mode":"countdown"},
        {"name":"相识纪念日","date":"2018-05-20","mode":"memorial","yearly":true}
      ];
    }
    return list;
  }

  function daysDiffToToday(target, mode, yearly){
    const now = new Date();
    const y = now.getFullYear();
    const [Y,M,D] = (()=>{
      if (/^\d{4}-\d{2}-\d{2}$/.test(target)) {
        const [yy,mm,dd] = target.split('-').map(n=>parseInt(n,10));
        return [yy,mm,dd];
      } else if (/^\d{2}-\d{2}$/.test(target)) {
        const [mm,dd] = target.split('-').map(n=>parseInt(n,10));
        return [y,mm,dd];
      } else {
        return [y, now.getMonth()+1, now.getDate()];
      }
    })();

    let t = new Date(Y,M-1,D);
    if (yearly) {
      t.setFullYear(y);
      // 如果是纪念/倒数且按年循环且目标已过，按下一年计算
      if (mode === 'countdown' && t < new Date(y, now.getMonth(), now.getDate()+1)) {
        t.setFullYear(y+1);
      }
      if (mode === 'memorial' && t > now) {
        t.setFullYear(y-1);
      }
    }
    const one = 86400000;
    const diff = Math.floor((t.setHours(0,0,0,0) - now.setHours(0,0,0,0)) / one);
    // 返回文案
    if (mode === 'memorial') {
      const days = -diff;
      return days >= 0 ? `已 ${days} 天` : `还有 ${-days} 天`;
    } else {
      return diff >= 0 ? `还有 ${diff} 天` : `已 ${-diff} 天`;
    }
  }

  function buildDaysBlock(){
    const list = parseDaysFromArgOrStore();
    const lines = [];
    lines.push('【倒数日 / 纪念日】');
    list.forEach(item=>{
      const { name='事件', date='', mode='countdown', yearly=false } = item || {};
      const text = daysDiffToToday(date, mode, yearly);
      const label = yearly ? `${name}（每年 ${date.slice(-5)}）` : `${name}（${date}）`;
      lines.push(`${label}：${text}`);
    });
    return lines.join('\n');
  }

  // ======== 时间卡 / 进度条 ========
  function buildTimecardBlock(now){
    const y = now.getFullYear();
    const m = now.getMonth()+1;
    const d = now.getDate();
    const hh = now.getHours(), mm = now.getMinutes(), ss = now.getSeconds();

    const secondsToday = hh*3600 + mm*60 + ss;
    const pctDay = secondsToday / 86400;

    const dow = now.getDay(); // 0 周日
    const mondayOffset = (dow === 0 ? -6 : 1 - dow); // 周一为起点
    const monday = new Date(y, now.getMonth(), d + mondayOffset);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    const pctWeek = Math.min(1, Math.max(0, (now - monday) / (sunday - monday + 1)));

    const dim = daysInMonth(y, m);
    const pctMonth = (d-1 + secondsToday/86400) / dim;

    const doy = dayOfYear(now);
    const diy = isLeapYear(y) ? 366 : 365;
    const pctYear = (doy-1 + secondsToday/86400) / diy;

    const lines = [];
    lines.push('【时间卡】');
    lines.push(`今天　${progressBar(pctDay)}`);
    lines.push(`本周　${progressBar(pctWeek)}`);
    lines.push(`本月　${progressBar(pctMonth)}`);
    lines.push(`本年　${progressBar(pctYear)}`);
    return lines.join('\n');
  }

  // ======== 组装 & 通知 ========
  try {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth()+1, d = now.getDate();
    const dateStr = `${y}-${pad2(m)}-${pad2(d)} ${WEEK_NAME[now.getDay()]}`;

    const block1 = buildAlmanacBlock(now);       // 黄历
    const block2 = buildDaysBlock();             // 倒数日
    const block3 = buildTimecardBlock(now);      // 时间卡

    // 注意：按你的要求，后两个之间留空白行；黄历和倒数日之间不留
    const body = `${block1}\n${block2}\n\n${block3}`;

    notify('今日黄历', dateStr, body, {
      'icon': 'calendar',
      'icon-color': '#f97316',
      'url': '' // 需要可跳转的链接可填入
    });
  } catch (e) {
    notify('今日黄历', '脚本异常', String(e));
  } finally {
    // 结束脚本
    if (typeof $done !== 'undefined') $done();
  }
})();
