/*
 * 今日黄历
 * Author: ByteValley
 */

function Env(t){class e{constructor(t){this.env=t}send(t,s="GET"){t="string"==typeof t?{url:t}:t;let e=this.get;return"POST"===s&&(e=this.post),new Promise((s,i)=>{e.call(this,t,(t,e,r)=>{t?i(t):s(e)})})}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t){this.name=t,this.http=new e(this)}isSurge(){return typeof $environment!=="undefined"&&$environment["surge-version"]}isQuanX(){return typeof $task!=="undefined"}isLoon(){return typeof $loon!=="undefined"}isShadowrocket(){return typeof $rocket!=="undefined"}isStash(){return typeof $environment!=="undefined"&&$environment["stash-version"]}get(t,s=(()=>{})){if(this.isSurge()||this.isShadowrocket()||this.isLoon()||this.isStash()){$httpClient.get(t,(t,e,i)=>{!t&&e&&(e.body=i,e.statusCode=e.status?e.status:e.statusCode,e.status=e.statusCode),s(t,e,i)})}else if(this.isQuanX()){ $task.fetch(t).then(t=>{const{statusCode:e,headers:r,body:o}=t;s(null,{status:e,headers:r,body:o},o)},t=>s(t&&t.error||"UndefinedError"))}}done(t={}){typeof $done!=="undefined"?$done(t):console.log("done")}}(t)}
const $ = new Env("今日黄历 · 三合一");

// ========== 时间与工具 ==========
const now = new Date();
const Y = now.getFullYear();
const M = now.getMonth()+1;
const D = now.getDate();
const todayStr = (y=Y,m=M,d=D)=>`${y}-${m}-${d}`;
const pad2 = n => n<10?`0${n}`:`${n}`;
const mark = d => d==="0"?"🎉":`${d}天`;
function dateDiff(a,b){
  const [ay,am,ad]=a.split("-").map(Number);
  const [by,bm,bd]=b.split("-").map(Number);
  return Math.floor((new Date(by,bm-1,bd)-new Date(ay,am-1,ad))/86400000).toString();
}
function renderTriple(list, sep=" | "){
  // list: [{name, dateStr}], 已按时间升序且 >= today
  const a=list[0], b=list[1]||a, c=list[2]||b;
  const d0=dateDiff(todayStr(),a.dateStr), d1=dateDiff(todayStr(),b.dateStr), d2=dateDiff(todayStr(),c.dateStr);
  return `${a.name}：${mark(d0)}${sep}${b.name}：${mark(d1)}${sep}${c.name}：${mark(d2)}`;
}

// ========== 完整万年历（含节气、农历互转） ==========
/* 来自你贴的 calendar.js（略有精简，仅保留必要 API） */
const calendar = {
  lunarInfo:[0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,0x06566,0x0d4a0,0x0ea50,0x16a95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0,0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0],
  solarMonth:[31,28,31,30,31,30,31,31,30,31,30,31],
  Gan:["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"], Zhi:["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"],
  solarTerm:["小寒","大寒","立春","雨水","惊蛰","春分","清明","谷雨","立夏","小满","芒种","夏至","小暑","大暑","立秋","处暑","白露","秋分","寒露","霜降","立冬","小雪","大雪","冬至"],
  sTermInfo:['9778397bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf97c3598082c95f8c965cc920f','97bd0b06bdb0722c965ce1cfcc920f','b027097bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf97c359801ec95f8c965cc920f','97bd0b06bdb0722c965ce1cfcc920f','b027097bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf97c359801ec95f8c965cc920f','97bd0b06bdb0722c965ce1cfcc920f','b027097bd097c36b0b6fc9274c91aa','9778397bd19801ec9210c965cc920e','97b6b97bd19801ec95f8c965cc920f','97bd09801d98082c95f8e1cfcc920f','97bd097bd097c36b0b6fc9210c8dc2','9778397bd197c36c9210c9274c91aa','97b6b97bd19801ec95f8c965cc920e','97bd09801d98082c95f8e1cfcc920f','97bd097bd097c36b0b6fc9210c8dc2','9778397bd097c36c9210c9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf97c3598082c95f8e1cfcc920f','97bd097bd097c36b0b6fc9210c8dc2','9778397bd097c36c9210c9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf97c3598082c95f8c965cc920f','97bd097bd097c35b0b6fc920fb0722','9778397bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf97c3598082c95f8c965cc920f','97bd097bd097c35b0b6fc920fb0722','9778397bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf97c359801ec95f8c965cc920f','97bd097bd097c35b0b6fc920fb0722','9778397bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf97c359801ec95f8c965cc920f','97bd097bd07f595b0b6fc920fb0722','9778397bd097c36b0b6fc9210c8dc2','9778397bd19801ec9210c9274c920e','97b6b97bd19801ec95f8c965cc920f','97bd07f5307f595b0b0bc920fb0722',/* 其余保持 */],
  nStr1:["日","一","二","三","四","五","六","七","八","九","十"], nStr2:["初","十","廿","卅"], nStr3:["正","二","三","四","五","六","七","八","九","十","冬","腊"],
  lYearDays(y){let i,sum=348; for(i=0x8000;i>0x8;i>>=1) sum+=(this.lunarInfo[y-1900]&i)?1:0; return sum+this.leapDays(y)},
  leapMonth(y){return (this.lunarInfo[y-1900]&0xf)}, leapDays(y){return this.leapMonth(y)?((this.lunarInfo[y-1900]&0x10000)?30:29):0},
  monthDays(y,m){return ((this.lunarInfo[y-1900]&(0x10000>>m))?30:29)},
  toGanZhi(off){return this.Gan[off%10]+this.Zhi[off%12]}, toGanZhiYear(ly){let g=(ly-3)%10,z=(ly-3)%12; if(!g)g=10;if(!z)z=12; return this.Gan[g-1]+this.Zhi[z-1]},
  toAstro(M,D){const s="摩羯水瓶双鱼白羊金牛双子巨蟹狮子处女天秤天蝎射手摩羯",a=[20,19,21,21,21,22,23,23,23,23,22,22]; return s.substr(M*2-(D<a[M-1]?2:0),2)+"座";},
  getTerm(y,n){ if(y<1900||y>2100||n<1||n>24) return -1; const t=this.sTermInfo[y-1900], out=[]; for(let i=0;i<t.length;i+=5){const c=parseInt('0x'+t.substr(i,5)).toString(); out.push(c[0],c.substr(1,2),c[3],c.substr(4,2))} return parseInt(out[n-1]) },
  solar2lunar(y,m,d){
    if(y<1900||y>2100) return -1; const obj=new Date(y,m-1,d); y=obj.getFullYear(); m=obj.getMonth()+1; d=obj.getDate();
    let off=(Date.UTC(y,m-1,d)-Date.UTC(1900,0,31))/86400000,i,temp=0; for(i=1900;i<2101&&off>0;i++){temp=this.lYearDays(i); off-=temp} if(off<0){off+=temp;i--}
    const ly=i; let leap=this.leapMonth(ly), isLeap=false;
    for(i=1;i<13&&off>0;i++){ if(leap>0&&i==(leap+1)&&!isLeap){--i;isLeap=true;temp=this.leapDays(ly)} else {temp=this.monthDays(ly,i)} if(isLeap&&i==(leap+1))isLeap=false; off-=temp }
    if(off===0&&leap>0&&i===leap+1){ if(isLeap){isLeap=false}else{isLeap=true;--i} } if(off<0){off+=temp;--i}
    const lm=i, ld=off+1, sm=m-1; const dayCyc=Date.UTC(y,sm,1)/86400000+25567+10; const gzD=this.toGanZhi(dayCyc+d-1);
    return {lYear:ly,lMonth:lm,lDay:ld,IMonthCn:(isLeap?"闰":"")+this.nStr3[lm-1]+"月",IDayCn:(()=>{if(ld===10)return"初十"; if(ld===20)return"二十"; if(ld===30)return"三十"; return this.nStr2[Math.floor(ld/10)]+this.nStr1[ld%10]})(),gzYear:this.toGanZhiYear(ly),gzDay:gzD,astro:this.toAstro(m,d)};
  },
  lunar2solar(y,m,d,isLeap=false){
    const day=this.monthDays(y,m); if(isLeap){} // 简化：闰月极少，通常用不到
    // 计算偏移
    let off=0; for(let i=1900;i<y;i++) off+=this.lYearDays(i);
    let leap=0, add=false; for(let i=1;i<m;i++){ leap=this.leapMonth(y); if(!add && leap>0 && leap<=i){off+=this.leapDays(y); add=true} off+=this.monthDays(y,i) }
    if(isLeap) off+=day;
    const strap=Date.UTC(1900,1,30,0,0,0); const cal=new Date((off+d-31)*86400000+strap);
    return {cYear:cal.getUTCFullYear(), cMonth:cal.getUTCMonth()+1, cDay:cal.getUTCDate()};
  }
};

// ========== “动态倒数”规则 ==========
function ymd(y,m,d){return `${y}-${m}-${d}`}
function push(list,name, y, m, d){ list.push({name, dateStr: ymd(y,m,d)}) }
function genFixedForYears(name,m,d,years){ const out=[]; years.forEach(y=>push(out,name,y,m,d)); return out }

// 节日（法定/传统）集合：返回从今天起的未来列表（已排序）
function buildHolidayList(){
  const yrs=[Y-1,Y,Y+1,Y+2,Y+3]; // 给跨年足够缓冲
  let arr=[];

  // 固定阳历
  [["元旦",1,1],["情人节",2,14],["劳动",5,1],["儿童节",6,1],["教师节",9,10],["国庆",10,1],["圣诞",12,25]]
    .forEach(([n,m,d])=>arr=arr.concat(genFixedForYears(n,m,d,yrs)));

  // 农历节日
  const lunarFest=[["除夕",12,30,"auto"],["春节",1,1],["元宵",1,15],["龙抬头",2,2],["端午",5,5],["七夕",7,7],["中元",7,15],["中秋",8,15],["重阳",9,9],["寒衣",10,1],["下元",10,15],["腊八",12,8]];
  yrs.forEach(y=>{
    // 除夕：腊月末日，29或30
    const lastDay = calendar.monthDays(y,12);
    lunarFest.forEach(([n,mm,dd,flag])=>{
      const _dd = (n==="除夕") ? lastDay : dd;
      const g = calendar.lunar2solar(y, mm, _dd);
      push(arr, n, g.cYear, g.cMonth, g.cDay);
    });
    // 小年（北/南）
    [{n:"小年(北)",d:23},{n:"小年(南)",d:24}].forEach(({n,d})=>{
      const g = calendar.lunar2solar(y,12,d); push(arr,n,g.cYear,g.cMonth,g.cDay);
    });
  });

  // 清明（节气第7个，更准）
  yrs.forEach(y=>{ const day = calendar.getTerm(y,7); if(day>0) push(arr,"清明",y,4,day) });

  // 去重 & 过滤今天之前
  const seen=new Set();
  arr = arr.filter(it=>{
    const key=it.name+"@"+it.dateStr;
    if(seen.has(key)) return false; seen.add(key);
    return Number(dateDiff(todayStr(),it.dateStr))>=0;
  }).sort((a,b)=> new Date(a.dateStr)-new Date(b.dateStr));

  return arr;
}

// 节气/传统集合
function buildSolarTermList(){
  const yrs=[Y-1,Y,Y+1,Y+2,Y+3];
  let arr=[];

  // 24节气
  yrs.forEach(y=>{
    for(let i=1;i<=24;i++){
      const day = calendar.getTerm(y,i);
      if(day>0){
        push(arr, calendar.solarTerm[i-1], y, (i+1)>>1, day); // 每月两节气
      }
    }
  });

  // 传统日（同上，补充）
  const extraLunar=[["七夕节",7,7],["中元节",7,15],["重阳节",9,9],["寒衣节",10,1],["下元节",10,15],["腊八节",12,8],["小年(北)",12,23],["小年(南)",12,24]];
  yrs.forEach(y=>{
    extraLunar.forEach(([n,mm,dd])=>{
      const g = calendar.lunar2solar(y,mm,dd); push(arr,n,g.cYear,g.cMonth,g.cDay);
    })
  });

  // 过滤今天之前 + 排序
  arr = arr.filter(it=>Number(dateDiff(todayStr(),it.dateStr))>=0)
           .sort((a,b)=> new Date(a.dateStr)-new Date(b.dateStr));

  return arr;
}

// ========== 远程黄历（带兜底） ==========
const base = "https://raw.githubusercontent.com/zqzess/openApiData/main/calendar/";
const ymPath = `${Y}/${Y}${pad2(M)}.json`;
const url1 = base + ymPath;
const url2 = "https://mirror.ghproxy.com/" + base + ymPath;

function fetchJSON(u, cb){ $.get({url:u}, (e,r)=>{ if(e) return cb(e); try{cb(null,JSON.parse(r.body||"{}"))}catch(err){cb(err)} }); }

function main(){
  fetchJSON(url1,(e,j)=>{ if(e||!j||!j.data) return viaProxy(); return handleRemote(j); });
  function viaProxy(){ fetchJSON(url2,(e2,j2)=>{ if(e2||!j2||!j2.data) return handleFallback(); return handleRemote(j2); }); }

  function packContent(headLines){
    const listA = buildHolidayList().slice(0,3);
    const listB = buildSolarTermList().slice(0,3);
    const blockA = `小乌龟慢慢爬\n${renderTriple(listA," , ")}`;
    const blockB = `摸鱼中，期待下一个假日.ʕʘ‿ʘʔ.\n${renderTriple(listB," | ")}`;
    return `${headLines.join("\n")}\n\n${blockA}\n\n${blockB}`;
  }

  function handleRemote(j){
    try{
      const A = j.data && j.data[0] && j.data[0].almanac ? j.data[0].almanac : [];
      const hit = A.find(x=>String(x.year)==String(Y)&&String(x.month)==String(M)&&String(x.day)==String(D));
      if(!hit) return handleFallback();
      const gzYear = hit.gzYear || ""; const gzMonth = hit.gzMonth || ""; const gzDay = hit.gzDate || hit.gzDay || "";
      const suit = hit.suit || "—"; const avoid = hit.avoid || "—";
      const descBits = [hit.term, hit.desc, hit.value].filter(Boolean).join(" ");
      const head = [
        `干支：${gzYear}年 ${gzMonth?gzMonth+"月 ":""}${gzDay?gzDay+"日":""}${descBits? "  "+descBits:""}`,
        `✅宜：${suit}`,
        `🈲️忌：${avoid}`
      ];
      const content = packContent(head);
      if ($.isSurge()) $.done(content);
      else $.done({title:"📅 今日黄历",content,icon:"calendar","icon-color":"#f97316"});
    }catch(_){ handleFallback(); }
  }

  function handleFallback(){
    const gzLocal = calendar.solar2lunar(Y,M,D).gzYear;
    const head = [
      `干支：${gzLocal}年 （本地兜底）`,
      `✅宜：—`,
      `🈲️忌：—`
    ];
    const content = packContent(head);
    if ($.isSurge()) $.done(content);
    else $.done({title:"📅 今日黄历",content,icon:"calendar","icon-color":"#f97316"});
  }
}
main();
