/*
 * 今日黄历
 * - Surge 环境：始终 $done("纯字符串内容")，不返回 {title:...} 对象，避免报错
 * - 远程：优先直连 GitHub 月表，失败自动切换 ghproxy
 * - 兜底：本地农历/干支，仅当远程失败时启用（不再计算节气，防止未知年份表导致崩溃）
 * - 展示：黄历干支/宜忌  + 空行  + 最近三项倒数
 * - 图标/颜色：在 [Panel] 行里指定（如 icon=calendar, icon-color=#f97316）
 * Author: ByteEden（整合）
 */

function Env(t){class e{constructor(t){this.env=t}send(t,s="GET"){t="string"==typeof t?{url:t}:t;let e=this.get;return"POST"===s&&(e=this.post),new Promise((s,i)=>{e.call(this,t,(t,e,r)=>{t?i(t):s(e)})})}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t){this.name=t,this.http=new e(this)}isSurge(){return"undefined"!=typeof $environment&&$environment["surge-version"]}isQuanX(){return"undefined"!=typeof $task}isLoon(){return"undefined"!=typeof $loon}isShadowrocket(){return"undefined"!=typeof $rocket}isStash(){return"undefined"!=typeof $environment&&$environment["stash-version"]}get(t,s=(()=>{})){if(this.isSurge()||this.isShadowrocket()||this.isLoon()||this.isStash())$httpClient.get(t,(t,e,i)=>{!t&&e&&(e.body=i,e.statusCode=e.status?e.status:e.statusCode,e.status=e.statusCode),s(t,e,i)});else if(this.isQuanX())$task.fetch(t).then(t=>{const{statusCode:e,headers:r,body:o}=t;s(null,{status:e,headers:r,body:o},o)},t=>s(t&&t.error||"UndefinedError"))}done(t={}){"undefined"!=typeof $done?$done(t):console.log("done")}}(t)}
const $ = new Env("今日黄历");

/* ========= 时间工具 ========= */
const now = new Date();
const Y = now.getFullYear();
const M = now.getMonth() + 1;
const D = now.getDate();
const pad2 = n => (n < 10 ? "0" + n : "" + n);
const todayStr = `${Y}-${M}-${D}`;

function dateDiff(a, b){ // yyyy-m-d
  const [ay,am,ad]=a.split("-").map(Number);
  const [by,bm,bd]=b.split("-").map(Number);
  return Math.floor((new Date(by,bm-1,bd) - new Date(ay,am-1,ad))/86400000).toString();
}

/* ========= 最近三项倒数（与你提供的列表保持一致） ========= */
const tlist = {
  1:["元旦","2025-01-01"],2:["小寒","2025-01-05"],3:["腊八节","2025-01-07"],4:["大寒","2025-01-20"],5:["小年","2025-01-22"],
  6:["除夕","2025-01-28"],7:["春节","2025-01-29"],8:["立春","2025-02-03"],9:["元宵节","2025-02-12"],10:["情人节","2025-02-14"],
  11:["雨水","2025-02-18"],12:["龙抬头","2025-03-01"],13:["惊蛰","2025-03-05"],14:["妇女节","2025-03-08"],15:["春分","2025-03-20"],
  16:["愚人节","2025-04-01"],17:["清明节","2025-04-04"],18:["谷雨","2025-04-20"],19:["劳动节","2025-05-01"],20:["立夏","2025-05-05"],
  21:["母亲节","2025-05-11"],22:["小满","2025-05-21"],23:["端午节","2025-05-31"],24:["儿童节","2025-06-01"],25:["芒种","2025-06-05"],
  26:["父亲节","2025-06-15"],27:["夏至","2025-06-21"],28:["小暑","2025-07-07"],29:["大暑","2025-07-22"],30:["立秋","2025-08-07"],
  31:["处暑","2025-08-23"],32:["七夕节","2025-08-29"],33:["中元节","2025-09-06"],34:["白露","2025-09-07"],35:["教师节","2025-09-10"],
  36:["秋分","2025-09-23"],37:["国庆节","2025-10-01"],38:["中秋节","2025-10-06"],39:["寒露","2025-10-08"],40:["霜降","2025-10-23"],
  41:["重阳节","2025-10-29"],42:["寒衣节","2025-11-01"],43:["立冬","2025-11-07"],44:["小雪","2025-11-22"],45:["下元节","2025-12-04"],
  46:["大雪","2025-12-07"],47:["冬至","2025-12-21"],48:["元旦","2026-01-01"],49:["小寒","2026-01-05"],50:["大寒","2026-01-20"],
  51:["腊八节","2026-01-26"],52:["小年(北)","2026-02-10"],53:["小年(南)","2026-02-11"],54:["情人节","2026-02-14"],55:["除夕","2026-02-16"],
  56:["春节","2026-02-17"]
};
function nearestIndex(){
  const n = Object.keys(tlist).length;
  for (let i=1; i<=n; i++){
    if (Number(dateDiff(todayStr, tlist[i][1])) >= 0) return i;
  }
  return n;
}
const idx = nearestIndex();
function todayMark(d){ return d === "0" ? "🎉" : `${d}天`; }

/* ========= 本地农历（简化兜底，仅给干支/日期称呼，不算节气，避免未知年份数组越界） ========= */
const calendar = {
  lunarInfo:[0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,0x06566,0x0d4a0,0x0ea50,0x16a95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0,0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0],
  Gan:["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"], Zhi:["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"],
  Animals:["鼠","牛","虎","兔","龙","蛇","马","羊","猴","鸡","狗","猪"],
  nStr1:["日","一","二","三","四","五","六","七","八","九","十"],
  nStr2:["初","十","廿","卅"],
  nStr3:["正","二","三","四","五","六","七","八","九","十","冬","腊"],
  toChinaMonth(m){return this.nStr3[m-1]+"月"},
  toChinaDay(d){ if(d===10)return"初十"; if(d===20)return"二十"; if(d===30)return"三十"; return this.nStr2[Math.floor(d/10)] + this.nStr1[d%10]; },
  leapMonth(y){return (this.lunarInfo[y-1900] & 0xf)},
  leapDays(y){return this.leapMonth(y)?((this.lunarInfo[y-1900]&0x10000)?30:29):0},
  monthDays(y,m){return (this.lunarInfo[y-1900] & (0x10000>>m)) ? 30 : 29},
  lYearDays(y){let i,sum=348; for(i=0x8000;i>0x8;i>>=1) sum += (this.lunarInfo[y-1900]&i)?1:0; return sum + this.leapDays(y)},
  toGanZhiYear(ly){let g=(ly-3)%10,z=(ly-3)%12; if(!g)g=10; if(!z)z=12; return this.Gan[g-1]+this.Zhi[z-1]},
  toGanZhi(off){return this.Gan[off%10] + this.Zhi[off%12]},
  toAstro(M,D){const s="摩羯水瓶双鱼白羊金牛双子巨蟹狮子处女天秤天蝎射手摩羯", a=[20,19,21,21,21,22,23,23,23,23,22,22]; return s.substr(M*2-(D<a[M-1]?2:0),2)+"座"; },
  solar2lunar(Y,M,D){
    let y=Y,m=M,d=D; const obj=new Date(y,m-1,d); y=obj.getFullYear(); m=obj.getMonth()+1; d=obj.getDate();
    let off=(Date.UTC(y,m-1,d)-Date.UTC(1900,0,31))/86400000, i, temp=0;
    for(i=1900;i<2101&&off>0;i++){temp=this.lYearDays(i); off-=temp} if(off<0){off+=temp;i--}
    const ly=i; let leap=this.leapMonth(ly), isLeap=false;
    for(i=1;i<13&&off>0;i++){ if(leap>0&&i==(leap+1)&&!isLeap){--i;isLeap=true;temp=this.leapDays(ly)} else {temp=this.monthDays(ly,i)} if(isLeap&&i==(leap+1))isLeap=false; off-=temp }
    if(off===0&&leap>0&&i===leap+1){ if(isLeap){isLeap=false}else{isLeap=true;--i} } if(off<0){off+=temp;--i}
    const lm=i, ld=off+1;
    const dayCyc = Date.UTC(y,m-1,1)/86400000 + 25567 + 10;
    const gzD = this.toGanZhi(dayCyc + d - 1);
    return {
      cYear:y,cMonth:m,cDay:d,
      lYear:ly,lMonth:lm,lDay:ld,
      IMonthCn:(isLeap?"闰":"")+this.toChinaMonth(lm),
      IDayCn:this.toChinaDay(ld),
      gzYear:this.toGanZhiYear(ly),
      gzMonth:"", // 兜底不算节气，gzMonth留空
      gzDay:gzD,
      Animal:this.getAnimal?this.getAnimal(ly):["鼠","牛","虎","兔","龙","蛇","马","羊","猴","鸡","狗","猪"][(ly-4)%12],
      astro:this.toAstro(m,d)
    };
  }
};
const lunar = calendar.solar2lunar(Y,M,D);

/* ========= 远程月表：直连优先，失败再 ghproxy ========= */
const base = "https://raw.githubusercontent.com/zqzess/openApiData/main/calendar/";
const ym = `${Y}/${Y}${pad2(M)}.json`;
const urlPrimary = base + encodeURIComponent(ym);
const urlProxy   = "https://mirror.ghproxy.com/" + base + encodeURIComponent(ym);

function fetchJSON(u, cb){
  $.get({url:u,headers:{}}, (e,r)=>{
    if(e) return cb(e);
    try{ const jo = JSON.parse((r&&r.body)||"{}"); cb(null, jo); }catch(err){ cb(err); }
  });
}

/* ========= 主流程 ========= */
(function run(){
  fetchJSON(urlPrimary, (err, jo)=>{
    if(err || !jo || !jo.data) return tryProxy();
    return handleRemote(jo, /*fromProxy=*/false);
  });

  function tryProxy(){
    fetchJSON(urlProxy, (err2, jo2)=>{
      if(err2 || !jo2 || !jo2.data) return handleFallback();
      return handleRemote(jo2, /*fromProxy=*/true);
    });
  }

  function handleRemote(jo){
    try{
      const arr = jo.data && jo.data[0] && jo.data[0].almanac ? jo.data[0].almanac : [];
      const hit = arr.find(i => String(i.year)==String(Y) && String(i.month)==String(M) && String(i.day)==String(D));
      let line = "", subtitle="";
      if(hit){
        const desc = [hit.desc, hit.term, hit.value].filter(Boolean).join(" ");
        line = `干支：${hit.gzYear}年 ${hit.gzMonth}月 ${hit.gzDate}日${desc? "　"+desc:""}\n✅宜：${hit.suit}\n🈲️忌：${hit.avoid}`;
        subtitle = `${Y}/${M}/${D}  农历 ${hit.lMonth}月${hit.lDate}`;
      }else{
        // 找不到当天 => 兜底
        return handleFallback();
      }

      // 倒数三项
      const d0 = dateDiff(todayStr, tlist[idx][1]);
      const d1 = dateDiff(todayStr, (tlist[idx+1]||tlist[idx])[1]);
      const d2 = dateDiff(todayStr, (tlist[idx+2]||tlist[idx])[1]);
      const countdown = `${tlist[idx][0]}：${todayMark(d0)} | ${(tlist[idx+1]||tlist[idx])[0]}：${d1}天 | ${(tlist[idx+2]||tlist[idx])[0]}：${d2}天`;

      const content = `${line}\n\n${countdown}`;

      if ($.isSurge()) {
        // —— 仅返回字符串，交由 [Panel] 控制标题/图标/颜色 ——
        $.done(content);
      } else {
        // 其他客户端可返回对象
        $.done({ title:"📅 今日黄历", content, icon:"calendar", "icon-color":"#f97316" });
      }
    }catch(_){
      handleFallback();
    }
  }

  function handleFallback(){
    // 本地农历兜底（不计算节气，避免未知年份崩溃）
    const line = `干支：${lunar.gzYear}年 ${lunar.gzDay}日（本地兜底）\n✅宜：—\n🈲️忌：—`;
    const d0 = dateDiff(todayStr, tlist[idx][1]);
    const d1 = dateDiff(todayStr, (tlist[idx+1]||tlist[idx])[1]);
    const d2 = dateDiff(todayStr, (tlist[idx+2]||tlist[idx])[1]);
    const countdown = `${tlist[idx][0]}：${todayMark(d0)} | ${(tlist[idx+1]||tlist[idx])[0]}：${d1}天 | ${(tlist[idx+2]||tlist[idx])[0]}：${d2}天`;
    const content = `${line}\n\n${countdown}`;

    if ($.isSurge()) $.done(content);
    else $.done({ title:"📅 今日黄历", content, icon:"calendar", "icon-color":"#f97316" });
  }
})();
