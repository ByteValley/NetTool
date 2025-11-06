/**
 * 节日倒数（两行：节气 | 节日）· 可外链标题/祝词库
 * 第1行：最近3个【二十四节气】；第2行：最近3个【节日（阳历/农历）】
 * 正日 06:00 后单次祝词通知（仅节日）
 *
 * 参数（Surge 模块 arguments 或脚本 argument 传入）：
 *  - TITLES_URL: 标题库外链（JSON 数组），支持占位符 {lunar} {solar} {next}
 *  - BLESS_URL : 祝词库外链（JSON 对象：键=节日名，值=祝词文案）
 *
 * 外链 JSON 示例：
 *  ── TITLES_URL（数组）:
 *  [
 *    "摸鱼使我快乐～",
 *    "{lunar}",
 *    "{solar}",
 *    "下一站：{next}"
 *  ]
 *
 *  ── BLESS_URL（对象）:
 *  {
 *    "春节": "愿新岁顺遂无虞，家人皆安！",
 *    "中秋节": "人月两团圆，心上皆明朗。"
 *  }
 *
 * 传参示例：
 *  argument=TITLES_URL=https://example.com/titles.json&BLESS_URL=https://example.com/bless.json
 *
 * 说明：
 *  - 如未提供外链或拉取失败，自动回退到脚本内置默认标题/祝词；
 *  - 标题库占位符会在渲染前替换：
 *      {lunar} -> “农历Title（含干支/生肖）”
 *      {solar} -> “阳历Title（含星座）”
 *      {next}  -> “下一个：<最近节日名>”
 *
 * 作者：ByteValley  |  版本：2025-11-06
 */

(async () => {
/* ========== 工具 ==========\ */
const tnow = new Date();
const todayStr = (d => `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`)(tnow);
const y = tnow.getFullYear();
const nextY = y + 1;
function dateDiff(start, end) {
  const s = start.split("-"), e = end.split("-");
  const sd = new Date(+s[0], +s[1]-1, +s[2]);
  const ed = new Date(+e[0], +e[1]-1, +e[2]);
  return Math.floor((ed - sd) / 86400000);
}
function fmtYMD(y, m, d) { return `${y}-${m}-${d}`; }
function parseArgs() {
  try {
    if (!$argument) return {};
    const sp = new URLSearchParams($argument);
    return Object.fromEntries(sp.entries());
  } catch { return {}; }
}
function httpGet(url) {
  return new Promise((resolve) => {
    $httpClient.get({url, timeout: 8000}, (err, resp, data) => {
      if (err || !resp || resp.status !== 200) return resolve(null);
      resolve(data);
    });
  });
}
async function fetchJson(url, fallback) {
  if (!url) return fallback;
  const raw = await httpGet(url);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

/* ========== 农历/节气算法（压缩版） ========== */
const calendar={lunarInfo:[0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,0x06566,0x0d4a0,0x0ea50,0x16a95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0,0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,0x092e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a2d0,0x0d150,0x0f252,0x0d520],solarMonth:[31,28,31,30,31,30,31,31,30,31,30,31],Gan:["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"],Zhi:["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"],Animals:["鼠","牛","虎","兔","龙","蛇","马","羊","猴","鸡","狗","猪"],festival:{'1-1':{title:'元旦节'},'2-14':{title:'情人节'},'5-1':{title:'劳动节'},'6-1':{title:'儿童节'},'9-10':{title:'教师节'},'10-1':{title:'国庆节'},'12-25':{title:'圣诞节'},'3-8':{title:'妇女节'},'3-12':{title:'植树节'},'4-1':{title:'愚人节'},'5-12':{title:'护士节'},'7-1':{title:'建党节'},'8-1':{title:'建军节'},'12-24':{title:'平安夜'}},lFestival:{'12-30':{title:'除夕'},'1-1':{title:'春节'},'1-15':{title:'元宵节'},'2-2':{title:'龙抬头'},'5-5':{title:'端午节'},'7-7':{title:'七夕节'},'7-15':{title:'中元节'},'8-15':{title:'中秋节'},'9-9':{title:'重阳节'},'10-1':{title:'寒衣节'},'10-15':{title:'下元节'},'12-8':{title:'腊八节'},'12-23':{title:'北方小年'},'12-24':{title:'南方小年'}},solarTerm:["小寒","大寒","立春","雨水","惊蛰","春分","清明","谷雨","立夏","小满","芒种","夏至","小暑","大暑","立秋","处暑","白露","秋分","寒露","霜降","立冬","小雪","大雪","冬至"],sTermInfo:['9778397bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf97c3598082c95f8c965cc920f','97bd0b06bdb0722c965ce1cfcc920f','b027097bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf97c359801ec95f8c965cc920f','97bd0b06bdb0722c965ce1cfcc920f','b027097bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf97c359801ec95f8c965cc920f','97bd0b06bdb0722c965ce1cfcc920f','b027097bd097c36b0b6fc9274c91aa','9778397bd19801ec9210c965cc920e','97b6b97bd19801ec95f8c965cc920f','97bd09801d98082c95f8e1cfcc920f','97bd097bd097c36b0b6fc9210c8dc2','9778397bd197c36c9210c9274c91aa','97b6b97bd19801ec95f8c965cc920e','97bd09801d98082c95f8e1cfcc920f','97bd097bd097c36b0b6fc9210c8dc2','9778397bd097c36c9210c9274c91aa','97b6b97bd19801ec95f8c965cc920e','97bcf97c3598082c95f8e1cfcc920f','97bd097bd097c36b0b6fc9210c8dc2','9778397bd097c36c9210c9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf97c3598082c95f8c965cc920f','97bd097bd097c35b0b6fc920fb0722','9778397bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf97c3598082c95f8c965cc920f','97bd097bd097c35b0b6fc920fb0722','9778397bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf97c359801ec95f8c965cc920f','97bd097bd097c35b0b6fc920fb0722','9778397bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf97c359801ec95f8c965cc920f','97bd097bd07f595b0b6fc920fb0722','9778397bd097c36b0b6fc9210c8dc2','9778397bd19801ec9210c9274c920e','97b6b97bd19801ec95f8c965cc920f','97bd07f5307f595b0b0bc920fb0722','7f0e397bd097c36b0b6fc9210c8dc2','9778397bd097c36c9210c9274c920e','97b6b97bd19801ec95f8c965cc920f','97bd07f5307f595b0b0bc920fb0722','7f0e397bd097c36b0b6fc9210c8dc2','9778397bd097c36c9210c9274c91aa','97b6b97bd19801ec9210c965cc920e','97bd07f1487f595b0b0bc920fb0722','7f0e397bd097c36b0b6fc9210c8dc2','9778397bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf7f1487f595b0b0bb0b6fb0722','7f0e397bd097c35b0b6fc920fb0722','9778397bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf7f1487f595b0b0bb0b6fb0722','7f0e397bd097c35b0b6fc920fb0722','9778397bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf7f1487f531b0b0bb0b6fb0722','7f0e397bd097c35b0b6fc920fb0722','9778397bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf7f1487f531b0b0bb0b6fb0722','7f0e397bd07f595b0b6fc920fb0722','9778397bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c9274c920e','97bcf7f0e47f531b0b0bb0b6fb0722','7f0e397bd07f595b0b0bc920fb0722','9778397bd097c36b0b6fc9210c91aa','97b6b97bd197c36c9210c9274c920e','97bcf7f0e47f531b0b0bb0b6fb0722','7f0e397bd07f595b0b0bc920fb0722','9778397bd097c36b0b6fc9210c8dc2','9778397bd097c36c9210c9274c920e','97b6b7f0e47f531b0723b0b6fb0722','7f0e37f5307f595b0b0bc920fb0722','7f0e397bd097c36b0b6fc9210c8dc2','9778397bd097c36b0b70c9274c91aa','97b6b7f0e47f531b0723b0b6fb0721','7f0e37f1487f595b0b0bb0b6fb0722','7f0e397bd097c35b0b6fc9210c8dc2','9778397bd097c36b0b6fc9274c91aa','97b6b7f0e47f531b0723b0b6fb0721','7f0e27f1487f595b0b0bb0b6fb0722','7f0e397bd097c35b0b6fc920fb0722','9778397bd097c36b0b6fc9274c91aa','97b6b7f0e47f531b0723b0b6fb0721','7f0e27f1487f531b0b0bb0b6fb0722','7f0e397bd097c35b0b6fc920fb0722','9778397bd097c36b0b6fc9274c91aa','97b6b7f0e47f531b0723b0b6fb0721','7f0e27f1487f531b0b0bb0b6fb0722','7f0e397bd07f595b0b0bc920fb0722','9778397bd097c36b0b6fc9274c91aa','97b6b7f0e47f531b0723b0787b0721','7f0e27f0e47f531b0b0bb0b6fb0722','7f0e397bd07f595b0b0bc920fb0722','9778397bd097c36b0b6fc9210c91aa','97b6b7f0e47f149b0723b0787b0721','7f0e27f0e47f531b0723b0b6fb0722','7f0e397bd07f595b0b0bc920fb0722','9778397bd097c36b0b6fc9210c8dc2','977837f0e37f149b0723b0787b0721','7f07e7f0e47f531b0723b0b6fb0722','7f0e37f5307f595b0b0bc920fb0722','7f0e397bd097c35b0b6fc9210c8dc2','977837f0e37f14998082b0787b0721','7f07e7f0e47f531b0723b0b6fb0721','7f0e37f1487f595b0b0bb0b6fb0722','7f0e397bd097c35b0b6fc9210c8dc2','977837f0e37f14998082b0787b06bd','7f07e7f0e47f531b0723b0b6fb0721','7f0e27f1487f531b0b0bb0b6fb0722','7f0e397bd097c35b0b6fc920fb0722','977837f0e37f14998082b0787b06bd','7f07e7f0e47f531b0723b0b6fb0721','7f0e27f1487f531b0b0bb0b6fb0722','7f0e397bd07f595b0b0bc920fb0722','977837f0e37f14998082b0787b06bd','7f07e7f0e47f149b0723b0787b0721','7f0e27f0e47f531b0b0bb0b6fb0722','7f0e397bd07f595b0b0bc920fb0722','977837f0e37f14998082b0723b06bd','7f07e7f0e37f149b0723b0787b0721','7f0e27f0e47f531b0b0bb0b6fb0722','7f0e397bd07f595b0b0bc920fb0722','977837f0e37f14898082b0723b02d5','7ec967f0e37f14998082b0787b0721','7f07e7f0e47f531b0723b0b6fb0722','7f0e37f1487f595b0b0bb0b6fb0722','7f0e37f0e37f14898082b0723b02d5','7ec967f0e37f14998082b0787b0721','7f07e7f0e47f531b0723b0b6fb0722','7f0e37f1487f531b0b0bb0b6fb0722','7f0e37f0e37f14898082b0723b02d5','7ec967f0e37f14998082b0787b06bd','7f07e7f0e47f531b0723b0b6fb0721','7f0e37f1487f531b0b0bb0b6fb0722','7f0e37f0e37f14898082b072297c35','7ec967f0e37f14998082b0787b06bd','7f07e7f0e47f531b0723b0b6fb0721','7f0e27f1487f531b0b0bb0b6fb0722','7f0e37f0e37f14898082b072297c35','7ec967f0e37f14998082b0787b06bd','7f07e7f0e47f531b0723b0b6fb0721','7f0e27f1487f531b0b0bb0b6fb0722','7f0e37f0e366aa89801eb072297c35','7ec967f0e37f14998082b0723b06bd','7f07e7f0e37f14998083b0787b0721','7f0e27f0e47f531b0723b0b6fb0722','7f0e37f0e366aa89801eb072297c35','7ec967f0e37f14898082b0723b02d5','7f07e7f0e37f14998082b0787b0721','7f07e7f0e47f531b0723b0b6fb0722','7f0e36665b66aa89801e9808297c35','665f67f0e37f14898082b0723b02d5','7ec967f0e37f14998082b0787b0721','7f07e7f0e47f531b0723b0b6fb0722','7f0e36665b66a449801e9808297c35','665f67f0e37f14898082b0723b02d5','7ec967f0e37f14998082b0787b06bd','7f07e7f0e47f531b0723b0b6fb0721','7f0e36665b66a449801e9808297c35','665f67f0e37f14898082b072297c35','7ec967f0e37f14998082b0787b06bd','7f07e7f0e47f531b0723b0b6fb0721','7f0e26665b66a449801e9808297c35','665f67f0e37f1489801eb072297c35','7ec967f0e37f14998082b0787b06bd','7f07e7f0e47f531b0723b0b6fb0721','7f0e27f1487f531b0b0bb0b6fb0722'],nStr1:["日","一","二","三","四","五","六","七","八","九","十"],nStr2:["初","十","廿","卅"],nStr3:["正","二","三","四","五","六","七","八","九","十","冬","腊"],lYearDays:function(y){let i,sum=348;for(i=0x8000;i>0x8;i>>=1){sum+=((this.lunarInfo[y-1900]&i)?1:0)}return(sum+this.leapDays(y))},leapMonth:function(y){return(this.lunarInfo[y-1900]&0xf)},leapDays:function(y){if(this.leapMonth(y)){return((this.lunarInfo[y-1900]&0x10000)?30:29)}return 0},monthDays:function(y,m){if(m>12||m<1){return -1}return((this.lunarInfo[y-1900]&(0x10000>>m))?30:29)},solarDays:function(y,m){if(m>12||m<1){return -1}const ms=m-1;if(ms===1){return(((y%4===0)&&(y%100!==0)||(y%400===0))?29:28)}else{return(this.solarMonth[ms])}},GanZhi:function(o){return this.Gan[o%10]+this.Zhi[o%12]},toGanZhiYear:function(y){let g=(y-3)%10,z=(y-3)%12;if(g===0)g=10;if(z===0)z=12;return this.Gan[g-1]+this.Zhi[z-1]},getTerm:function(y,n){if(y<1900||y>2100||n<1||n>24){return -1}const t=this.sTermInfo[y-1900];const d=[];for(let i=0;i<t.length;i+=5){const chunk=parseInt('0x'+t.substr(i,5)).toString();d.push(chunk[0],chunk.substr(1,2),chunk[3],chunk.substr(4,2))}return parseInt(d[n-1])},toChinaMonth:function(m){if(m>12||m<1){return -1}return this.nStr3[m-1]+"月"},toChinaDay:function(d){let s;switch(d){case 10:s="初十";break;case 20:s="二十";break;case 30:s="三十";break;default:s=this.nStr2[Math.floor(d/10)]+this.nStr1[d%10]}return s},getAnimal:function(y){return this.Animals[(y-4)%12]},toAstro:function(m,d){const s="摩羯水瓶双鱼白羊金牛双子巨蟹狮子处女天秤天蝎射手摩羯";const arr=[20,19,21,21,21,22,23,23,23,23,22,22];return s.substr(m*2-(d<arr[m-1]?2:0),2)+"座"},solar2lunar:function(Y,M,D){let y=parseInt(Y),m=parseInt(M),d=parseInt(D);if(y<1900||y>2100)return -1;if(y===1900&&m===1&&d<31)return -1;let obj=(Y?new Date(y,m-1,d):new Date());y=obj.getFullYear();m=obj.getMonth()+1;d=obj.getDate();let offset=(Date.UTC(y,m-1,d)-Date.UTC(1900,0,31))/86400000;let i,temp;for(i=1900;i<2101&&offset>0;i++){temp=this.lYearDays(i);offset-=temp}if(offset<0){offset+=temp;i--}let isTodayObj=new Date(),isToday=(isTodayObj.getFullYear()===y&&isTodayObj.getMonth()+1===m&&isTodayObj.getDate()===d);let nWeek=obj.getDay(),cWeek=this.nStr1[nWeek];if(nWeek===0)nWeek=7;const year=i;let leap=this.leapMonth(i),isLeap=false;for(i=1;i<13&&offset>0;i++){if(leap>0&&i===(leap+1)&&isLeap===false){--i;isLeap=true;temp=this.leapDays(year)}else{temp=this.monthDays(year,i)}if(isLeap===true&&i===(leap+1))isLeap=false;offset-=temp}if(offset===0&&leap>0&&i===leap+1){if(isLeap){isLeap=false}else{isLeap=true;--i}}if(offset<0){offset+=temp;--i}const month=i;const day=offset+1;const sm=m-1;const gzY=this.toGanZhiYear(year);const firstNode=this.getTerm(y,(m*2-1));const secondNode=this.getTerm(y,(m*2));let gzM=this.GanZhi((y-1900)*12+m+11);if(d>=firstNode)gzM=this.GanZhi((y-1900)*12+m+12);let isTerm=false,Term=null;if(firstNode===d){isTerm=true;Term=this.solarTerm[m*2-2]}if(secondNode===d){isTerm=true;Term=this.solarTerm[m*2-1]}const dayCyc=Date.UTC(y,sm,1)/86400000+25567+10;const gzD=this.GanZhi(dayCyc+d-1);const astro=this.toAstro(m,d);const solarDate=y+'-'+m+'-'+d;const lunarDate=year+'-'+month+'-'+day;const fest=this.festival;const lfest=this.lFestival;const festKey=m+'-'+d;let lfestKey=month+'-'+day;if(month===12&&day===29&&this.monthDays(year,month)===29){lfestKey='12-30'}return{date:solarDate,lunarDate:lunarDate,festival:fest[festKey]?fest[festKey].title:null,lunarFestival:lfest[lfestKey]?lfest[lfestKey].title:null,lYear:year,lMonth:month,lDay:day,Animal:this.getAnimal(year),IMonthCn:(isLeap?"闰":'')+this.toChinaMonth(month),IDayCn:this.toChinaDay(day),cYear:y,cMonth:m,cDay:d,gzYear:gzY,gzMonth:gzM,gzDay:gzD,isToday:isToday,isLeap:isLeap,nWeek:nWeek,ncWeek:"星期"+cWeek,isTerm:isTerm,Term:Term,astro:astro}},lunar2solar:function(y,m,d,isLeap){y=parseInt(y);m=parseInt(m);d=parseInt(d);isLeap=!!isLeap;const leapMonth=this.leapMonth(y);if(isLeap && leapMonth!==m) return -1;const day=this.monthDays(y,m);let _day=isLeap?this.leapDays(y,m):day;if(y===2100&&m===12&&d>1||y===1900&&m===1&&d<31)return -1;if(y<1900||y>2100||d>_day)return -1;let offset=0;for(let i=1900;i<y;i++){offset+=this.lYearDays(i)}let leap=0,isAdd=false;for(let i=1;i<m;i++){leap=this.leapMonth(y);if(!isAdd){if(leap<=i&&leap>0){offset+=this.leapDays(y);isAdd=true}}offset+=this.monthDays(y,i)}if(isLeap){offset+=day}const strap=Date.UTC(1900,1,30,0,0,0);const cal=new Date((offset+d-31)*86400000+strap);const cY=cal.getUTCFullYear(),cM=cal.getUTCMonth()+1,cD=cal.getUTCDate();return this.solar2lunar(cY,cM,cD)}};

/* ========== 标题（农/阳、星座） ========== */
const lunarNow = calendar.solar2lunar(tnow.getFullYear(), tnow.getMonth()+1, tnow.getDate());
const titleSolar = `${lunarNow.cMonth}月${lunarNow.cDay}日（${lunarNow.astro}）`;
const titleLunar = `${lunarNow.IMonthCn}${lunarNow.IDayCn} • ${lunarNow.gzYear}年${lunarNow.gzMonth}${lunarNow.gzDay} • ${lunarNow.Animal}年`;

/* ========== 生成集合：节气与节日分离 ========== */
function nthWeekdayOfMonth(year, month, weekday, n) {
  const first = new Date(year, month-1, 1);
  const firstW = first.getDay();
  const add = ((weekday - firstW + 7) % 7) + (n-1)*7;
  return fmtYMD(year, month, 1 + add);
}
function lunarNewYearEveSolar(year) {
  const days12 = calendar.monthDays(year, 12);
  const lday = days12 === 29 ? 29 : 30;
  const obj = calendar.lunar2solar(year, 12, lday);
  return obj.date;
}
function solarTerms(year) {
  const names = calendar.solarTerm, out = [];
  for (let i=1;i<=24;i++){
    const month = i<=2 ? 1 : i<=4 ? 2 : i<=6 ? 3 : i<=8 ? 4 : i<=10 ? 5 : i<=12 ? 6 : i<=14 ? 7 : i<=16 ? 8 : i<=18 ? 9 : i<=20 ? 10 : i<=22 ? 11 : 12;
    const day = calendar.getTerm(year, i);
    out.push([names[i-1], fmtYMD(y, month, day)]);
  }
  return out;
}
function gregorianFest(year) {
  return [
    ["元旦", fmtYMD(year,1,1)],
    ["情人节", fmtYMD(year,2,14)],
    ["妇女节", fmtYMD(year,3,8)],
    ["愚人节", fmtYMD(year,4,1)],
    ["劳动节", fmtYMD(year,5,1)],
    ["母亲节", nthWeekdayOfMonth(year,5,0,2)],
    ["儿童节", fmtYMD(year,6,1)],
    ["父亲节", nthWeekdayOfMonth(year,6,0,3)],
    ["教师节", fmtYMD(year,9,10)],
    ["国庆节", fmtYMD(year,10,1)],
    ["圣诞节", fmtYMD(year,12,25)]
  ];
}
function lunarFest(year) {
  const base = [
    ["春节", [1,1]],["元宵节", [1,15]],["龙抬头", [2,2]],
    ["端午节", [5,5]],["七夕节", [7,7]],["中元节", [7,15]],
    ["中秋节", [8,15]],["重阳节", [9,9]],["寒衣节", [10,1]],
    ["下元节", [10,15]],["腊八节", [12,8]],["小年(北)", [12,23]],["小年(南)", [12,24]]
  ];
  const out = base.map(([n,[lm,ld]]) => [n, calendar.lunar2solar(year, lm, ld).date]);
  out.push(["除夕", lunarNewYearEveSolar(year)]);
  return out;
}
function buildTerms(year) {
  const set = solarTerms(year);
  set.sort((a,b)=> new Date(a[1]) - new Date(b[1]));
  return set;
}
function buildFest(year) {
  const set = [...gregorianFest(year), ...lunarFest(year)];
  const seen = new Set(), out = [];
  for (const it of set) {
    const key = it[0] + "@" + it[1];
    if (!seen.has(key)) { seen.add(key); out.push(it); }
  }
  out.sort((a,b)=> new Date(a[1]) - new Date(b[1]));
  return out;
}

/* ========== 最近三项 ========== */
function nextTrip(list) {
  const arr = list.filter(([_, d]) => dateDiff(todayStr, d) >= 0);
  if (arr.length === 0) return list.slice(0,3);
  const take = arr.slice(0,3);
  if (take.length < 3) take.push(...list.slice(0, 3 - take.length));
  return take;
}
const termsAll = [...buildTerms(y), ...buildTerms(nextY)];
const festAll  = [...buildFest(y),  ...buildFest(nextY)];
const T3 = nextTrip(termsAll);
const F3 = nextTrip(festAll);
const dT0 = dateDiff(todayStr, T3[0][1]), dT1 = dateDiff(todayStr, T3[1][1]), dT2 = dateDiff(todayStr, T3[2][1]);
const dF0 = dateDiff(todayStr, F3[0][1]), dF1 = dateDiff(todayStr, F3[1][1]), dF2 = dateDiff(todayStr, F3[2][1]);

/* ========== 载入外部：标题库 / 祝词库 ========== */
const args = parseArgs();
const defaultTitles = [
  "距离放假，还要摸鱼多少天？🥱","坚持住，就快放假啦！💪","上班好累呀，好想放假😮‍💨",
  "努力，我还能加班24小时！🧐","天呐，还要多久才放假呀？😭","躺平中，等放假(☝ ՞ਊ ՞)☝",
  "只有摸鱼才是赚老板的钱🙎🤳","一起摸鱼吧✌(՞ټ՞ )✌","摸鱼中，期待下一个假日.ʕʘ‿ʘʔ.",
  "小乌龟慢慢爬🐢","太难了！😫😩","今日宜摸鱼，忌早起",
  "{lunar}","{solar}","{next}"
];
const defaultBless = {
  "春节":"春风送暖入屠苏，万象更新福满门。阖家欢乐迎新岁！",
  "元宵节":"花灯高照月正圆，团团圆圆共此时。",
  "劳动节":"双手创造幸福路，愿你劳有所获、心有所安。",
  "端午节":"粽叶飘香龙舟竞，平安康健万事顺。",
  "中秋节":"海上生明月，天涯共此时。愿人月两团圆。",
  "国庆节":"山河锦绣盛世华章，祝国泰民安！",
  "元旦":"辞旧迎新，万象更新；新年胜旧年！",
  "七夕节":"鹊桥相会意绵绵，愿得一心人，白首不相离。",
  "重阳节":"草木含秋意，登高望远念亲朋。",
  "除夕":"爆竹声中一岁除，愿新岁顺遂无虞。",
  "寒衣节":"添衣一纸，温暖一念。","下元节":"三官赐福，下元祈愿，平安顺心。","腊八节":"腊八粥香入人心，温暖到岁尽。","龙抬头":"龙抬头，万事有抬头。"
};
const titlesArr = await fetchJson(args.TITLES_URL, defaultTitles);
const blessMap  = await fetchJson(args.BLESS_URL , defaultBless);

/* ========== 标题随机（支持占位符） ========== */
function pickTitle(daysToNext, nextName) {
  if (daysToNext === 0) return `今天是${nextName}，休息一下吧 ~`;
  const pool = Array.isArray(titlesArr) && titlesArr.length ? titlesArr : defaultTitles;
  const r = Math.floor(Math.random() * pool.length);
  const raw = String(pool[r] || "");
  return raw
    .replaceAll("{lunar}", titleLunar)
    .replaceAll("{solar}", titleSolar)
    .replaceAll("{next}", nextName ? `下一个：${nextName}` : "");
}

/* ========== 正日提醒（仅节日，06:00 后每日一次） ========== */
if (dF0 === 0 && tnow.getHours() >= 6) {
  const key = "timecardpushed_f";
  if ($persistentStore.read(key) !== F3[0][1]) {
    $persistentStore.write(F3[0][1], key);
    const words = blessMap[F3[0][0]] || "节日快乐！";
    $notification.post(`🎉今天是 ${F3[0][1]} ${F3[0][0]}`, "", words);
  }
}

/* ========== 面板两行输出（第1行节气 / 第2行节日） ========== */
const lineTerm = (dT0 === 0)
  ? `今天：${T3[0][0]} | ${T3[1][0]}${dT1}天 | ${T3[2][0]}${dT2}天`
  : `${T3[0][0]}${dT0}天 | ${T3[1][0]}${dT1}天 | ${T3[2][0]}${dT2}天`;

const lineFest = (dF0 === 0)
  ? `今天：${F3[0][0]} | ${F3[1][0]}${dF1}天 | ${F3[2][0]}${dF2}天`
  : `${F3[0][0]}${dF0}天 | ${F3[1][0]}${dF1}天 | ${F3[2][0]}${dF2}天`;

/* ========== 固定橙色日历图标 ========== */
$done({
  title: pickTitle(dF0, F3[0][0]),
  icon: "calendar",          // 橙色日历
  "icon-color": "#FF9800",   // 亮橙
  content: `${lineTerm}\n\n${lineFest}`
});
})();
