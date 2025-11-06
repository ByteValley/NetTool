/*
 * 今日黄历（合成版 / Panel+Cron 通用）
 * - 合并：wnCalendar 远程月表黄历 + 节日倒计时/提醒 + 本地农历/干支/节气/星座算法（兜底）
 * - 兼容：Surge(Panel/Cron) / Stash(Tile/Cron) / Loon / QuantumultX / Shadowrocket
 * - 图标：橙色日历（默认 icon=calendar, icon-color=#f97316，可用参数覆盖）
 * - 作者：整合 by ChatGPT（基于 zqzess & JJonline 开源脚本）
 */

const ORANGE_DEFAULT = "#f97316";
const TITLE_DEFAULT = "📅 今日黄历";

/* ========= Env（多端轻量封装） ========= */
function Env(t,s){class e{constructor(t){this.env=t}send(t,s="GET"){t="string"==typeof t?{url:t}:t;let e=this.get;return"POST"===s&&(e=this.post),new Promise((s,i)=>{e.call(this,t,(t,e,r)=>{t?i(t):s(e)})})}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,s){this.name=t,this.http=new e(this),this.data=null,this.logs=[],this.encoding="utf-8",Object.assign(this,s)}isQuanX(){return"undefined"!=typeof $task}isSurge(){return"undefined"!=typeof $environment&&$environment["surge-version"]}isLoon(){return"undefined"!=typeof $loon}isShadowrocket(){return"undefined"!=typeof $rocket}isStash(){return"undefined"!=typeof $environment&&$environment["stash-version"]}get(t,s=(()=>{})){if(this.isSurge()||this.isShadowrocket()||this.isLoon()||this.isStash())$httpClient.get(t,(t,e,i)=>{!t&&e&&(e.body=i,e.statusCode=e.status?e.status:e.statusCode,e.status=e.statusCode),s(t,e,i)});else if(this.isQuanX())$task.fetch(t).then(t=>{const{statusCode:e,headers:r,body:o}=t;s(null,{status:e,headers:r,body:o},o)},t=>s(t&&t.error||"UndefinedError"))}post(t,s=(()=>{})){const e=t.method?t.method.toLocaleLowerCase():"post";if(this.isSurge()||this.isShadowrocket()||this.isLoon()||this.isStash())$httpClient[e](t,(t,e,i)=>{!t&&e&&(e.body=i,e.statusCode=e.status?e.status:e.statusCode,e.status=e.statusCode),s(t,e,i)});else if(this.isQuanX())t.method=e,$task.fetch(t).then(t=>{const{statusCode:e,headers:r,body:o}=t;s(null,{status:e,headers:r,body:o},o)},t=>s(t&&t.error||"UndefinedError"))}msg(s="",e="",i="",r){"undefined"!=typeof $notify?$notify(s,e,i,r):console.log([s,e,i].join("\n"))}done(t={}){"undefined"!=typeof $done?$done(t):console.log("done")}}(t,s)}
const $ = new Env("今日黄历");

/* ========= 参数解析 =========
 * 支持：icon=calendar&icon-color=#f97316
 */
function parseArgs(){
  try{
    const raw = (typeof $argument!=="undefined" && $argument) ? $argument : "";
    const out = {};
    raw.split("&").forEach(kv=>{
      if(!kv) return;
      const [k,...rest] = kv.split("=");
      const key = decodeURIComponent(k||"").trim();
      const val = decodeURIComponent(rest.join("=")||"").trim();
      if(key) out[key]=val;
    });
    return out;
  }catch{ return {}; }
}
const ARGS = parseArgs();
const ICON = ARGS.icon || "calendar";
const ICON_COLOR = ARGS["icon-color"] || ORANGE_DEFAULT;

/* ========= 时间与格式 ========= */
const now = new Date();
const yyyy = now.getFullYear();
const mm = now.getMonth()+1;
const dd = now.getDate();
const pad2 = n => (n<10?"0"+n:""+n);
const todayStr = `${yyyy}-${mm}-${dd}`;

/* ========= 远程月表黄历（wnCalendar思路） ========= */
let proxy = "https://mirror.ghproxy.com/";
let base = "https://raw.githubusercontent.com/zqzess/openApiData/main/calendar/";
const ymPath = `${yyyy}/${yyyy}${pad2(mm)}.json`;
const apiUrlRaw = base + encodeURIComponent(ymPath);

function resolveCalendarUrl(cb){
  const opt = {
    url: "http://ip-api.com/json/",
    headers: {
      "Accept":"*/*",
      "User-Agent":"Mozilla/5.0",
      "Content-Type":"application/json; charset=utf-8"
    }
  };
  $.get(opt,(err,resp)=>{
    try{
      const info = JSON.parse((resp&&resp.body)||"{}");
      const url = info && info.country==="China" ? (proxy + base + encodeURIComponent(ymPath)) : apiUrlRaw;
      cb(url);
    }catch{ cb(apiUrlRaw); }
  });
}

/* ========= 节日倒计时（合并/精简） ========= */
const tlist = {
  1:["元旦","2025-01-01"],2:["小寒","2025-01-05"],3:["腊八节","2025-01-07"],4:["大寒","2025-01-20"],5:["小年","2025-01-22"],6:["除夕","2025-01-28"],7:["春节","2025-01-29"],8:["立春","2025-02-03"],9:["元宵节","2025-02-12"],10:["情人节","2025-02-14"],11:["雨水","2025-02-18"],12:["龙抬头","2025-03-01"],13:["惊蛰","2025-03-05"],14:["妇女节","2025-03-08"],15:["春分","2025-03-20"],16:["愚人节","2025-04-01"],17:["清明节","2025-04-04"],18:["谷雨","2025-04-20"],19:["劳动节","2025-05-01"],20:["立夏","2025-05-05"],21:["母亲节","2025-05-11"],22:["小满","2025-05-21"],23:["端午节","2025-05-31"],24:["儿童节","2025-06-01"],25:["芒种","2025-06-05"],26:["父亲节","2025-06-15"],27:["夏至","2025-06-21"],28:["小暑","2025-07-07"],29:["大暑","2025-07-22"],30:["立秋","2025-08-07"],31:["处暑","2025-08-23"],32:["七夕节","2025-08-29"],33:["中元节","2025-09-06"],34:["白露","2025-09-07"],35:["教师节","2025-09-10"],36:["秋分","2025-09-23"],37:["国庆节","2025-10-01"],38:["中秋节","2025-10-06"],39:["寒露","2025-10-08"],40:["霜降","2025-10-23"],41:["重阳节","2025-10-29"],42:["寒衣节","2025-11-01"],43:["立冬","2025-11-07"],44:["小雪","2025-11-22"],45:["下元节","2025-12-04"],46:["大雪","2025-12-07"],47:["冬至","2025-12-21"],48:["元旦","2026-01-01"],49:["小寒","2026-01-05"],50:["大寒","2026-01-20"],51:["腊八节","2026-01-26"],52:["小年(北)","2026-02-10"],53:["小年(南)","2026-02-11"],54:["情人节","2026-02-14"],55:["除夕","2026-02-16"],56:["春节","2026-02-17"]
};
function dateDiff(a,b){ // yyyy-m-d
  const [ay,am,ad]=a.split("-").map(Number);
  const [by,bm,bd]=b.split("-").map(Number);
  const A=new Date(ay,am-1,ad), B=new Date(by,bm-1,bd);
  return Math.floor((B-A)/86400000).toString();
}
function nearestIndex(){
  const n=Object.keys(tlist).length;
  for(let i=1;i<=n;i++){ if(Number(dateDiff(todayStr,tlist[i][1]))>=0) return i; }
  return n;
}
const idx = nearestIndex();

function todayMark(diffStr){
  if(diffStr==="0"){ noticeToday(); return "🎉"; }
  return `${diffStr}天`;
}
function noticeToday(){
  try{
    if (typeof $persistentStore!=="undefined" && $persistentStore.read("timecardpushed")!=tlist[idx][1] && now.getHours()>=6){
      $persistentStore.write(tlist[idx][1],"timecardpushed");
      if(typeof $notification!=="undefined") $notification.post("节日提醒","",`今天是 ${tlist[idx][1]}「${tlist[idx][0]}」— 值得纪念的一天！`);
    }
  }catch(_){}
}

/* ========= 本地农历/干支/星座（兜底） =========
 * 精简版，仅保留 solar2lunar 所需
 */
const calendar = {
  lunarInfo:[0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,0x06566,0x0d4a0,0x0ea50,0x16a95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0,0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0],
  Gan:["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"], Zhi:["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"],
  Animals:["鼠","牛","虎","兔","龙","蛇","马","羊","猴","鸡","狗","猪"], solarMonth:[31,28,31,30,31,30,31,31,30,31,30,31],
  nStr1:["日","一","二","三","四","五","六","七","八","九","十"], nStr2:["初","十","廿","卅"], nStr3:["正","二","三","四","五","六","七","八","九","十","冬","腊"],
  sTermInfo:['9778397bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf97c3598082c95f8c965cc920f','97bd0b06bdb0722c965ce1cfcc920f','b027097bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf97c359801ec95f8c965cc920f','97bd0b06bdb0722c965ce1cfcc920f','b027097bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf97c359801ec95f8c965cc920f','97bd0b06bdb0722c965ce1cfcc920f','b027097bd097c36b0b6fc9274c91aa','9778397bd19801ec9210c965cc920e','97b6b97bd19801ec95f8c965cc920f','97bd09801d98082c95f8e1cfcc920f','97bd097bd097c36b0b6fc9210c8dc2','9778397bd197c36c9210c9274c91aa','97b6b97bd19801ec95f8c965cc920e','97bd09801d98082c95f8e1cfcc920f','97bd097bd097c36b0b6fc9210c8dc2','9778397bd097c36c9210c9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf97c3598082c95f8e1cfcc920f'],
  toChinaMonth(m){return (m<1||m>12)?-1:this.nStr3[m-1]+"月"},
  toChinaDay(d){if(d===10)return"初十";if(d===20)return"二十";if(d===30)return"三十";return this.nStr2[Math.floor(d/10)]+this.nStr1[d%10]},
  leapMonth(y){return (this.lunarInfo[y-1900]&0xf)}, leapDays(y){return this.leapMonth(y)?((this.lunarInfo[y-1900]&0x10000)?30:29):0},
  monthDays(y,m){return (this.lunarInfo[y-1900]&(0x10000>>m))?30:29},
  lYearDays(y){let i,sum=348;for(i=0x8000;i>0x8;i>>=1)sum+=(this.lunarInfo[y-1900]&i)?1:0;return sum+this.leapDays(y)},
  toGanZhiYear(ly){let g=(ly-3)%10,z=(ly-3)%12;if(!g)g=10;if(!z)z=12;return this.Gan[g-1]+this.Zhi[z-1]},
  toGanZhi(off){return this.Gan[off%10]+this.Zhi[off%12]},
  getAnimal(y){return this.Animals[(y-4)%12]},
  getTerm(y,n){if(y<1900||y>2100||n<1||n>24)return-1;const T=this.sTermInfo[y-1900],arr=[];for(let i=0;i<T.length;i+=5){const c=parseInt('0x'+T.substr(i,5)).toString();arr.push(c[0],c.substr(1,2),c[3],c.substr(4,2))}return parseInt(arr[n-1])},
  toAstro(M,D){const s="摩羯水瓶双鱼白羊金牛双子巨蟹狮子处女天秤天蝎射手摩羯",a=[20,19,21,21,21,22,23,23,23,23,22,22];return s.substr(M*2-(D<a[M-1]?2:0),2)+"座"},
  solar2lunar(Y,M,D){
    let y=Y,m=M,d=D; if(y<1900||y>2100) return -1; const obj=new Date(y,m-1,d);
    y=obj.getFullYear(); m=obj.getMonth()+1; d=obj.getDate();
    let off=(Date.UTC(y,m-1,d)-Date.UTC(1900,0,31))/86400000,i,temp=0;
    for(i=1900;i<2101&&off>0;i++){temp=this.lYearDays(i);off-=temp} if(off<0){off+=temp;i--}
    const ly=i; let leap=this.leapMonth(ly),isLeap=false;
    for(i=1;i<13&&off>0;i++){ if(leap>0&&i==(leap+1)&&!isLeap){--i;isLeap=true;temp=this.leapDays(ly)} else {temp=this.monthDays(ly,i)} if(isLeap&&i==(leap+1)) isLeap=false; off-=temp }
    if(off===0&&leap>0&&i===leap+1){ if(isLeap){isLeap=false}else{isLeap=true;--i} } if(off<0){off+=temp;--i}
    const lm=i, ld=off+1, gzY=this.toGanZhiYear(ly);
    const first=this.getTerm(y,m*2-1), second=this.getTerm(y,m*2);
    let gzM=this.toGanZhi((y-1900)*12+m+11); if(d>=first) gzM=this.toGanZhi((y-1900)*12+m+12);
    const dayCyc = Date.UTC(y,m-1,1)/86400000 + 25567 + 10; const gzD=this.toGanZhi(dayCyc + d -1);
    const astro=this.toAstro(m,d);
    return { cYear:y,cMonth:m,cDay:d, lYear:ly,lMonth:lm,lDay:ld, IMonthCn:(isLeap?"闰":"")+this.toChinaMonth(lm), IDayCn:this.toChinaDay(ld), gzYear:gzY, gzMonth:gzM, gzDay:gzD, Animal:this.getAnimal(ly), Term:(d===first?["小寒","大寒","立春","雨水","惊蛰","春分","清明","谷雨","立夏","小满","芒种","夏至","小暑","大暑","立秋","处暑","白露","秋分","寒露","霜降","立冬","小雪","大雪","冬至"][m*2-2]:(d===second?["小寒","大寒","立春","雨水","惊蛰","春分","清明","谷雨","立夏","小满","芒种","夏至","小暑","大暑","立秋","处暑","白露","秋分","寒露","霜降","立冬","小雪","大雪","冬至"][m*2-1]:"")), astro };
  }
};
const lunar = calendar.solar2lunar(yyyy,mm,dd);
const nowsolar = `${lunar.cMonth}月${lunar.cDay}日（${lunar.astro}）`;
const nowlunar = `${lunar.IMonthCn}${lunar.IDayCn} ${lunar.gzYear}${lunar.gzMonth}${lunar.gzDay} ${lunar.Animal}年`;
function titleRandom(diff){
  const r = Math.floor(Math.random()*12)+1;
  const map = {
    1:"距离放假，还要摸鱼多少天？",2:"坚持住，就快放假啦！",3:"上班好累呀，好想放假",4:"努力，我还能加班24小时！",
    5:"今日宜：吃饭饭  忌：减肥",6:"躺平中，等放假",7:"只有摸鱼才是赚老板的钱",8: nowlunar,9: nowsolar,10:"小乌龟慢慢爬",11:"加油，明天会更好！",12:"用力生活，用力摸鱼"
  };
  return (diff==="0") ? `今天是「${tlist[idx][0]}」—节日快乐` : map[r];
}

/* ========= 主流程 ========= */
function run(){
  resolveCalendarUrl((finalUrl)=>{
    const req = { url: finalUrl, headers: {} };
    $.get(req,(err,resp)=>{
      let almanacLine = "";
      let subtitle = "";

      try{
        const jo = JSON.parse((resp&&resp.body)||"{}");
        const arr = jo && jo.data && jo.data[0] && jo.data[0].almanac ? jo.data[0].almanac : [];
        const hit = arr.find(i => String(i.year)==String(yyyy) && String(i.month)==String(mm) && String(i.day)==String(dd));
        if(hit){
          const desc = [hit.desc, hit.term, hit.value].filter(Boolean).join(" ");
          almanacLine = `干支：${hit.gzYear}年 ${hit.gzMonth}月 ${hit.gzDate}日${desc? "　"+desc:""}\n✅宜：${hit.suit}\n🈲️忌：${hit.avoid}`;
          subtitle = `${yyyy}/${mm}/${dd}  农历 ${hit.lMonth}月${hit.lDate}`;
        }
      }catch{}

      // 兜底（远程失败时用本地算法）
      if(!almanacLine){
        const term = lunar.Term ? `　节气：${lunar.Term}` : "";
        almanacLine = `干支：${lunar.gzYear}年 ${lunar.gzMonth}月 ${lunar.gzDay}日${term}\n（本地算法兜底）`;
        subtitle = `${yyyy}/${mm}/${dd}  农历 ${lunar.IMonthCn}${lunar.IDayCn}`;
      }

      // 倒数三项（与黄历之间留一空行）
      const diff0 = dateDiff(todayStr, tlist[idx][1]);
      const diff1 = dateDiff(todayStr, (tlist[idx+1]||tlist[idx])[1]);
      const diff2 = dateDiff(todayStr, (tlist[idx+2]||tlist[idx])[1]);
      const lineCountdown =
        `${tlist[idx][0]}：${todayMark(diff0)} | `+
        `${(tlist[idx+1]||tlist[idx])[0]}：${diff1}天 | `+
        `${(tlist[idx+2]||tlist[idx])[0]}：${diff2}天`;

      const finalTitle = titleRandom(diff0);

      // 通知一条（多端）
      $.msg(finalTitle, subtitle, `${almanacLine}\n\n${lineCountdown}`);

      // —— Panel/Tile 返回体（固定橙色日历图标） ——
      const panelPayload = {
        title: finalTitle,
        content: `${almanacLine}\n\n${lineCountdown}`,
        icon: ICON || "calendar",
        "icon-color": ICON_COLOR || ORANGE_DEFAULT
      };

      // 仅在面板上下文返回对象，避免 "invalid parameter `title`"
      const isSurgePanel = (typeof $script!=="undefined" && $script && $script.type==="generic");
      const isStashTile = $.isStash && $.isStash();
      const isLoonPanel = $.isLoon && $.isLoon();
      const isSRPanel = $.isShadowrocket && $.isShadowrocket();
      const isQXPanel = $.isQuanX && $.isQuanX(); // QX面板也接受对象

      const isPanelCtx = !!(isSurgePanel || isStashTile || isLoonPanel || isSRPanel || isQXPanel);

      if(isPanelCtx){
        $.done(panelPayload);
      }else{
        // 非面板（如 Cron / 手动运行）仅打印并正常结束，防止报错
        try{ console.log(panelPayload.title+"\n"+panelPayload.content); }catch(_){}
        $.done();
      }
    });
  });
}

run();
