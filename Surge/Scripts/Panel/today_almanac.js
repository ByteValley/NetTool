#!name=节日倒数·合并
#!desc=将“节日倒数(固定节点)”与“节日倒数(含祝词+农历标题)”合并为一个面板；两行展示；正日 6 点后单次提醒
#!author=ByteEden & ChatGPT
#!version=2025.11.06

[Panel]
节日倒数·合并 = script-name=节日倒数·合并, update-interval=1800

[Script]
# 模块分类：面板脚本
# 细项描述：合并两份倒数逻辑；两行显示；正日推送祝词；标题含农历信息；图标与配色同原脚本
节日倒数·合并 = type=generic,timeout=10,script-content=
(() => {
/* =========================
 * 基础：日期/工具函数
 * ========================= */
const pad = (n) => (n < 10 ? "0" + n : "" + n);
const tnow = new Date();
const tnowf = `${tnow.getFullYear()}-${tnow.getMonth() + 1}-${tnow.getDate()}`;

// 计算两个“YYYY-M-D”日期差（end - start），向下取整的天数字符串
function dateDiff(startDateString, endDateString) {
  const sep = "-";
  const s = startDateString.split(sep);
  const e = endDateString.split(sep);
  const sd = new Date(s[0], s[1] - 1, s[2]);
  const ed = new Date(e[0], e[1] - 1, e[2]);
  return parseInt((ed - sd) / 86400000).toString();
}

/* =========================
 * 数据源 A：固定节点（来自你的第一份脚本）
 * 结构：[名称, YYYY-MM-DD]
 * ========================= */
const listA = {
  1:  ["元旦", "2025-01-01"],
  2:  ["小寒", "2025-01-05"],
  3:  ["腊八节", "2025-01-07"],
  4:  ["大寒", "2025-01-20"],
  5:  ["小年", "2025-01-22"],
  6:  ["除夕", "2025-01-28"],
  7:  ["春节", "2025-01-29"],
  8:  ["立春", "2025-02-03"],
  9:  ["元宵节", "2025-02-12"],
  10: ["情人节", "2025-02-14"],
  11: ["雨水", "2025-02-18"],
  12: ["龙抬头", "2025-03-01"],
  13: ["惊蛰", "2025-03-05"],
  14: ["妇女节", "2025-03-08"],
  15: ["春分", "2025-03-20"],
  16: ["愚人节", "2025-04-01"],
  17: ["清明节", "2025-04-04"],
  18: ["谷雨", "2025-04-20"],
  19: ["劳动节", "2025-05-01"],
  20: ["立夏", "2025-05-05"],
  21: ["母亲节", "2025-05-11"],
  22: ["小满", "2025-05-21"],
  23: ["端午节", "2025-05-31"],
  24: ["儿童节", "2025-06-01"],
  25: ["芒种", "2025-06-05"],
  26: ["父亲节", "2025-06-15"],
  27: ["夏至", "2025-06-21"],
  28: ["小暑", "2025-07-07"],
  29: ["大暑", "2025-07-22"],
  30: ["立秋", "2025-08-07"],
  31: ["处暑", "2025-08-23"],
  32: ["七夕节", "2025-08-29"],
  33: ["中元节", "2025-09-06"],
  34: ["白露", "2025-09-07"],
  35: ["教师节", "2025-09-10"],
  36: ["秋分", "2025-09-23"],
  37: ["国庆节", "2025-10-01"],
  38: ["中秋节", "2025-10-06"],
  39: ["寒露", "2025-10-08"],
  40: ["霜降", "2025-10-23"],
  41: ["重阳节", "2025-10-29"],
  42: ["寒衣节", "2025-11-01"],
  43: ["立冬", "2025-11-07"],
  44: ["小雪", "2025-11-22"],
  45: ["下元节", "2025-12-04"],
  46: ["大雪", "2025-12-07"],
  47: ["冬至", "2025-12-21"],
  48: ["元旦", "2026-01-01"],
  49: ["小寒", "2026-01-05"],
  50: ["大寒", "2026-01-20"],
  51: ["腊八节", "2026-01-26"],
  52: ["小年(北)", "2026-02-10"],
  53: ["小年(南)", "2026-02-11"],
  54: ["情人节", "2026-02-14"],
  55: ["除夕", "2026-02-16"],
  56: ["春节", "2026-02-17"]
};

// 简化工具：返回 listA 中“今天起最近的索引”
function nearestIndexA() {
  for (let i = 1; i <= Object.getOwnPropertyNames(listA).length; i++) {
    if (Number(dateDiff(tnowf, listA[i][1])) >= 0) return i;
  }
  return 1;
}
const idxA = nearestIndexA();
const diffA = (n) => Number(dateDiff(tnowf, listA[n][1]));

/* =========================
 * 数据源 B：带祝词（来自你的第二份脚本）
 * 结构：[名称, YYYY-MM-DD, 祝词]
 * ========================= */
const listB = {
  1:  ["元旦", "2025-01-01", "辞旧迎新庆新春，四季轮回展宏图。愿君岁岁平安康，福星高照人如意。"],
  2:  ["春节", "2025-01-29", "春风送暖入屠苏，万象更新福满门。阖家欢乐迎新岁，欢天喜地庆团圆。"],
  3:  ["元宵", "2025-02-12", "花灯高照夜如水，月圆人圆情意浓。团团圆圆心相系，喜庆佳节共此时。"],
  4:  ["清明", "2025-04-04", "清明时节雨纷纷，思念故人泪满巾。扫墓祭祖凭哀思，感恩不忘报亲恩。"],
  5:  ["劳动", "2025-05-01", "春风得意花开好，勤劳奋斗梦远行。双手创造幸福路，汗水凝聚富贵情。"],
  6:  ["端午", "2025-05-31", "粽香四溢龙舟行，五月五日节传情。祭屈原人心志，平安康健乐满盈。"],
  7:  ["国庆", "2025-10-01", "祖国河山美如画，亿万人民庆华诞。山河壮丽同共祝，国泰民安岁月长。"],
  8:  ["中秋", "2025-10-06", "银盘高悬夜如银，千里共婵娟。望月思亲心常在，团圆欢乐又一年。"],
  9:  ["元旦", "2026-01-01", "新年到来万象新，愿君福寿常在心。事业腾飞皆如意，家和万事喜盈门。"],
  10: ["春节", "2026-02-17", "春风送暖福临门，家家户户庆团圆。欢声笑语声声响，迎来新岁乐开颜。"],
  11: ["元宵", "2026-02-25", "花灯辉映夜空明，元宵节庆乐盈门。愿你事事如愿意，家圆人圆梦圆心。"],
  12: ["清明", "2026-04-04", "清明时节思故人，缅怀先祖泪满巾。祭扫先人铭恩德，怀念永驻心中深。"],
  13: ["劳动", "2026-05-01", "春光明媚劳动节，辛勤耕耘得实惠。愿君幸福常相伴，事业兴旺展宏图。"],
  14: ["端午", "2026-06-14", "龙舟竞渡水花飞，粽香四溢飘千里。端午佳节共团圆，平安喜乐到人间。"],
  15: ["国庆", "2026-10-01", "祖国大地山河壮，欢庆盛世庆华诞。愿国强民富安康，万民同庆乐无疆。"],
  16: ["中秋", "2026-10-05", "明月高悬照大地，心随月圆思亲情。愿你此时共团圆，幸福安康如意行。"],
  17: ["元旦", "2027-01-01", "新春新岁喜盈门，愿君福运常如意。事业顺利步步高，家和万事安康地。"],
  18: ["春节", "2027-02-09", "红灯高挂喜气浓，辞旧迎新万象新。愿君春风得意行，岁岁年年皆安宁。"],
  19: ["元宵", "2027-02-17", "花灯璀璨照夜空，元宵团圆庆丰收。愿你事事如意顺，家人团聚乐悠悠。"],
  20: ["清明", "2027-04-04", "清明时节思亲人，远在他乡泪满巾。祭祖扫墓怀敬意，感恩先人永铭心。"]
};

// 返回 listB 中“今天起最近的索引”
function nearestIndexB() {
  for (let i = 1; i <= Object.getOwnPropertyNames(listB).length; i++) {
    if (Number(dateDiff(tnowf, listB[i][1])) >= 0) return i;
  }
  return 1;
}
const idxB = nearestIndexB();
const diffB = (n) => Number(dateDiff(tnowf, listB[n][1]));

// B 的“今天显示”：为 0 天时推送祝词并显示 🎉；否则显示 “X天”
function todayB(dayNum) {
  if (dayNum === 0) {
    if ($persistentStore.read("timecardpushed_b") !== listB[idxB][1] && tnow.getHours() >= 6) {
      $persistentStore.write(listB[idxB][1], "timecardpushed_b");
      $notification.post(`🎉今天是 ${listB[idxB][1]} ${listB[idxB][0]}`, "", listB[idxB][2] || "节日快乐！");
    }
    return "🎉";
  }
  return dayNum + "天";
}

/* =========================
 * 图标/配色（沿用第一份脚本）
 * ========================= */
function iconNow(num) {
  if (num <= 7 && num > 3) return "hare.fill";
  if (num <= 3 && num > 0) return "hourglass";
  if (num === 0) return "gift.fill";
  return "tortoise.fill";
}
function iconColor(num) {
  if (num <= 7 && num > 3) return "#ff9800";
  if (num <= 3 && num > 0) return "#9978FF";
  if (num === 0) return "#FF0000";
  return "#35C759";
}

/* =========================
 * 农历算法（来自你的第二份脚本，略作封装）
 * 仅用于标题动态展示
 * ========================= */
// ——为节省篇幅：完全保留原始 calendar 对象实现——
/* 下面整段为你的 calendar 实现，未改动逻辑，仅函数名与调用保持一致 */
const calendar = { /* ——此处开始—— */ 
    lunarInfo:[0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,0x06566,0x0d4a0,0x0ea50,0x16a95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0,0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,0x092e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a2d0,0x0d150,0x0f252,0x0d520],
    solarMonth:[31,28,31,30,31,30,31,31,30,31,30,31],
    Gan:["\u7532","\u4e59","\u4e19","\u4e01","\u620a","\u5df1","\u5e9a","\u8f9b","\u58ec","\u7678"],
    Zhi:["\u5b50","\u4e11","\u5bc5","\u536f","\u8fb0","\u5df3","\u5348","\u672a","\u7533","\u9149","\u620c","\u4ea5"],
    Animals:["\u9f20","\u725b","\u864e","\u5154","\u9f99","\u86c7","\u9a6c","\u7f8a","\u7334","\u9e21","\u72d7","\u732a"],
    festival:{'1-1':{title:'元旦节'},'2-14':{title:'情人节'},'5-1':{title:'劳动节'},'5-4':{title:'青年节'},'6-1':{title:'儿童节'},'9-10':{title:'教师节'},'10-1':{title:'国庆节'},'12-25':{title:'圣诞节'},'3-8':{title:'妇女节'},'3-12':{title:'植树节'},'4-1':{title:'愚人节'},'5-12':{title:'护士节'},'7-1':{title:'建党节'},'8-1':{title:'建军节'},'12-24':{title:'平安夜'}},
    lFestival:{'12-30':{title:'除夕'},'1-1':{title:'春节'},'1-15':{title:'元宵节'},'2-2':{title:'龙抬头'},'5-5':{title:'端午节'},'7-7':{title:'七夕节'},'7-15':{title:'中元节'},'8-15':{title:'中秋节'},'9-9':{title:'重阳节'},'10-1':{title:'寒衣节'},'10-15':{title:'下元节'},'12-8':{title:'腊八节'},'12-23':{title:'北方小年'},'12-24':{title:'南方小年'}},
    getFestival(){return this.festival},getLunarFestival(){return this.lFestival},
    setFestival(p={}){this.festival=p},setLunarFestival(p={}){this.lFestival=p},
    solarTerm:["\u5c0f\u5bd2","\u5927\u5bd2","\u7acb\u6625","\u96e8\u6c34","\u60ca\u86f0","\u6625\u5206","\u6e05\u660e","\u8c37\u96e8","\u7acb\u590f","\u5c0f\u6ee1","\u8292\u79cd","\u590f\u81f3","\u5c0f\u6691","\u5927\u6691","\u7acb\u79cb","\u5904\u6691","\u767d\u9732","\u79cb\u5206","\u5bd2\u9732","\u971c\u964d","\u7acb\u51ac","\u5c0f\u96ea","\u5927\u96ea","\u51ac\u81f3"],
    sTermInfo:['9778397bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf97c3598082c95f8c965cc920f','97bd0b06bdb0722c965ce1cfcc920f','b027097bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf97c359801ec95f8c965cc920f','97bd0b06bdb0722c965ce1cfcc920f','b027097bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf97c359801ec95f8c965cc920f','97bd0b06bdb0722c965ce1cfcc920f','b027097bd097c36b0b6fc9274c91aa','9778397bd19801ec9210c965cc920e','97b6b97bd19801ec95f8c965cc920f','97bd09801d98082c95f8e1cfcc920f','97bd097bd097c36b0b6fc9210c8dc2','9778397bd197c36c9210c9274c91aa','97b6b97bd19801ec95f8c965cc920e','97bd09801d98082c95f8e1cfcc920f','97bd097bd097c36b0b6fc9210c8dc2','9778397bd097c36c9210c9274c91aa','97b6b97bd19801ec95f8c965cc920e','97bcf97c3598082c95f8e1cfcc920f','97bd097bd097c36b0b6fc9210c8dc2','9778397bd097c36c9210c9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf97c3598082c95f8c965cc920f','97bd097bd097c35b0b6fc920fb0722','9778397bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf97c3598082c95f8c965cc920f','97bd097bd097c35b0b6fc920fb0722','9778397bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf97c359801ec95f8c965cc920f','97bd097bd097c35b0b6fc920fb0722','9778397bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf97c359801ec95f8c965cc920f','97bd097bd07f595b0b6fc920fb0722','9778397bd097c36b0b6fc9210c8dc2','9778397bd19801ec9210c9274c920e','97b6b97bd19801ec95f8c965cc920f','97bd07f5307f595b0b0bc920fb0722','7f0e397bd097c36b0b6fc9210c8dc2','9778397bd097c36c9210c9274c920e','97b6b97bd19801ec95f8c965cc920f','97bd07f5307f595b0b0bc920fb0722','7f0e397bd097c36b0b6fc9210c8dc2','9778397bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bd07f1487f595b0b0bc920fb0722','7f0e397bd097c36b0b6fc9210c8dc2','9778397bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf7f1487f595b0b0bb0b6fb0722','7f0e397bd097c35b0b6fc920fb0722','9778397bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf7f1487f595b0b0bb0b6fb0722','7f0e397bd097c35b0b6fc920fb0722','9778397bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf7f1487f531b0b0bb0b6fb0722','7f0e397bd097c35b0b6fc920fb0722','9778397bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c965cc920e','97bcf7f1487f531b0b0bb0b6fb0722','7f0e397bd07f595b0b6fc920fb0722','9778397bd097c36b0b6fc9274c91aa','97b6b97bd19801ec9210c9274c920e','97bcf7f0e47f531b0b0bb0b6fb0722','7f0e397bd07f595b0b0bc920fb0722','9778397bd097c36b0b6fc9210c91aa','97b6b97bd197c36c9210c9274c920e','97bcf7f0e47f531b0b0bb0b6fb0722','7f0e397bd07f595b0b0bc920fb0722','9778397bd097c36b0b6fc9210c8dc2','9778397bd097c36c9210c9274c920e','97b6b7f0e47f531b0723b0b6fb0722','7f0e37f5307f595b0b0bc920fb0722','7f0e397bd097c36b0b6fc9210c8dc2','9778397bd097c36b0b70c9274c91aa','97b6b7f0e47f531b0723b0b6fb0721','7f0e37f1487f595b0b0bb0b6fb0722','7f0e397bd097c35b0b6fc9210c8dc2','9778397bd097c36b0b6fc9274c91aa','97b6b7f0e47f531b0723b0b6fb0721','7f0e27f1487f595b0b0bb0b6fb0722','7f0e397bd097c35b0b6fc920fb0722','9778397bd097c36b0b6fc9274c91aa','97b6b7f0e47f531b0723b0b6fb0721','7f0e27f1487f531b0b0bb0b6fb0722','7f0e397bd097c35b0b6fc920fb0722','9778397bd097c36b0b6fc9274c91aa','97b6b7f0e47f531b0723b0b6fb0721','7f0e27f1487f531b0b0bb0b6fb0722','7f0e397bd07f595b0b0bc920fb0722','9778397bd097c36b0b6fc9274c91aa','97b6b7f0e47f531b0723b0787b0721','7f0e27f0e47f531b0b0bb0b6fb0722','7f0e397bd07f595b0b0bc920fb0722','9778397bd097c36b0b6fc9210c91aa','97b6b7f0e47f149b0723b0787b0721','7f0e27f0e47f531b0723b0b6fb0722','7f0e397bd07f595b0b0bc920fb0722','9778397bd097c36b0b6fc9210c8dc2','977837f0e37f149b0723b0787b0721','7f07e7f0e47f531b0723b0b6fb0722','7f0e37f5307f595b0b0bc920fb0722','7f0e397bd097c35b0b6fc9210c8dc2','977837f0e37f14998082b0787b0721','7f07e7f0e47f531b0723b0b6fb0721','7f0e37f1487f595b0b0bb0b6fb0722','7f0e397bd097c35b0b6fc9210c8dc2','977837f0e37f14998082b0787b06bd','7f07e7f0e47f531b0723b0b6fb0721','7f0e27f1487f531b0b0bb0b6fb0722','7f0e397bd097c35b0b6fc920fb0722','977837f0e37f14998082b0787b06bd','7f07e7f0e47f531b0723b0b6fb0721','7f0e27f1487f531b0b0bb0b6fb0722','7f0e397bd07f595b0b0bc920fb0722','977837f0e37f14998082b0787b06bd','7f07e7f0e47f149b0723b0787b0721','7f0e27f0e47f531b0b0bb0b6fb0722','7f0e397bd07f595b0b0bc920fb0722','977837f0e37f14998082b0723b06bd','7f07e7f0e37f149b0723b0787b0721','7f0e27f0e47f531b0b0bb0b6fb0722','7f0e397bd07f595b0b0bc920fb0722','977837f0e37f14898082b0723b02d5','7ec967f0e37f14998082b0787b0721','7f07e7f0e47f531b0723b0b6fb0722','7f0e37f1487f595b0b0bb0b6fb0722','7f0e37f0e37f14898082b0723b02d5','7ec967f0e37f14998082b0787b0721','7f07e7f0e47f531b0723b0b6fb0722','7f0e37f1487f531b0b0bb0b6fb0722','7f0e37f0e37f14898082b0723b02d5','7ec967f0e37f14998082b0787b06bd','7f07e7f0e47f531b0723b0b6fb0721','7f0e37f1487f531b0b0bb0b6fb0722','7f0e37f0e37f14898082b072297c35','7ec967f0e37f14998082b0787b06bd','7f07e7f0e47f531b0723b0b6fb0721','7f0e27f1487f531b0b0bb0b6fb0722','7f0e37f0e37f14898082b072297c35','7ec967f0e37f14998082b0787b06bd','7f07e7f0e47f531b0723b0b6fb0721','7f0e27f1487f531b0b0bb0b6fb0722','7f0e37f0e366aa89801eb072297c35','7ec967f0e37f14998082b0723b06bd','7f07e7f0e47f149b0723b0787b0721','7f0e27f1487f531b0b0bb0b6fb0722','7f0e37f0e366aa89801eb072297c35','7ec967f0e37f14998082b0723b06bd','7f07e7f0e37f14998083b0787b0721','7f0e27f0e47f531b0723b0b6fb0722','7f0e37f0e366aa89801eb072297c35','7ec967f0e37f14898082b0723b02d5','7f07e7f0e37f14998082b0787b0721','7f07e7f0e47f531b0723b0b6fb0722','7f0e36665b66aa89801e9808297c35','665f67f0e37f14898082b0723b02d5','7ec967f0e37f14998082b0787b0721','7f07e7f0e47f531b0723b0b6fb0722','7f0e36665b66a449801e9808297c35','665f67f0e37f14898082b0723b02d5','7ec967f0e37f14998082b0787b06bd','7f07e7f0e47f531b0723b0b6fb0721','7f0e36665b66a449801e9808297c35','665f67f0e37f14898082b072297c35','7ec967f0e37f14998082b0787b06bd','7f07e7f0e47f531b0723b0b6fb0721','7f0e26665b66a449801e9808297c35','665f67f0e37f1489801eb072297c35','7ec967f0e37f14998082b0787b06bd','7f07e7f0e47f531b0723b0b6fb0721','7f0e27f1487f531b0b0bb0b6fb0722'],
    nStr1:["\u65e5","\u4e00","\u4e8c","\u4e09","\u56db","\u4e94","\u516d","\u4e03","\u516b","\u4e5d","\u5341"],
    nStr2:["\u521d","\u5341","\u5eff","\u5345"],
    nStr3:["\u6b63","\u4e8c","\u4e09","\u56db","\u4e94","\u516d","\u4e03","\u516b","\u4e5d","\u5341","\u51ac","\u814a"],
    lYearDays:function(y){let i,sum=348;for(i=0x8000;i>0x8;i>>=1){sum+=((this.lunarInfo[y-1900]&i)?1:0)}return(sum+this.leapDays(y))},
    leapMonth:function(y){return(this.lunarInfo[y-1900]&0xf)},
    leapDays:function(y){if(this.leapMonth(y)){return((this.lunarInfo[y-1900]&0x10000)?30:29)}return 0},
    monthDays:function(y,m){if(m>12||m<1){return -1}return((this.lunarInfo[y-1900]&(0x10000>>m))?30:29)},
    solarDays:function(y,m){if(m>12||m<1){return -1}const ms=m-1;if(ms===1){return(((y%4===0)&&(y%100!==0)||(y%400===0))?29:28)}else{return(this.solarMonth[ms])}},
    GanZhi:function(o){return this.Gan[o%10]+this.Zhi[o%12]},
    toGanZhiYear:function(y){let g=(y-3)%10,z=(y-3)%12;if(g===0)g=10;if(z===0)z=12;return this.Gan[g-1]+this.Zhi[z-1]},
    getTerm:function(y,n){if(y<1900||y>2100||n<1||n>24){return -1}const t=this.sTermInfo[y-1900];const d=[];for(let i=0;i<t.length;i+=5){const chunk=parseInt('0x'+t.substr(i,5)).toString();d.push(chunk[0],chunk.substr(1,2),chunk[3],chunk.substr(4,2))}return parseInt(d[n-1])},
    toChinaMonth:function(m){if(m>12||m<1){return -1}return this.nStr3[m-1]+"\u6708"},
    toChinaDay:function(d){let s;switch(d){case 10:s="\u521d\u5341";break;case 20:s="\u4e8c\u5341";break;case 30:s="\u4e09\u5341";break;default:s=this.nStr2[Math.floor(d/10)]+this.nStr1[d%10]}return s},
    getAnimal:function(y){return this.Animals[(y-4)%12]},
    toAstro:function(m,d){const s="\u6469\u7faf\u6c34\u74f6\u53cc\u9c7c\u767d\u7f8a\u91d1\u725b\u53cc\u5b50\u5de8\u87f9\u72ee\u5b50\u5904\u5973\u5929\u79e4\u5929\u874e\u5c04\u624b\u6469\u7faf";const arr=[20,19,21,21,21,22,23,23,23,23,22,22];return s.substr(m*2-(d<arr[m-1]?2:0),2)+"\u5ea7"},
    solar2lunar:function(y,m,d){let Y=parseInt(y),M=parseInt(m),D=parseInt(d);if(Y<1900||Y>2100)return -1;if(Y===1900&&M===1&&D<31)return -1;let obj;obj=(y?new Date(Y,M-1,D):new Date());Y=obj.getFullYear();M=obj.getMonth()+1;D=obj.getDate();let offset=(Date.UTC(Y,M-1,D)-Date.UTC(1900,0,31))/86400000;let i,temp;for(i=1900;i<2101&&offset>0;i++){temp=this.lYearDays(i);offset-=temp}if(offset<0){offset+=temp;i--}let isTodayObj=new Date(),isToday=false;if(isTodayObj.getFullYear()===Y&&isTodayObj.getMonth()+1===M&&isTodayObj.getDate()===D){isToday=true}let nWeek=obj.getDay(),cWeek=this.nStr1[nWeek];if(nWeek===0)nWeek=7;const year=i;let leap=this.leapMonth(i),isLeap=false;for(i=1;i<13&&offset>0;i++){if(leap>0&&i===(leap+1)&&isLeap===false){--i;isLeap=true;temp=this.leapDays(year)}else{temp=this.monthDays(year,i)}if(isLeap===true&&i===(leap+1))isLeap=false;offset-=temp}if(offset===0&&leap>0&&i===leap+1){if(isLeap){isLeap=false}else{isLeap=true;--i}}if(offset<0){offset+=temp;--i}const month=i;const day=offset+1;const sm=M-1;const gzY=this.toGanZhiYear(year);const firstNode=this.getTerm(Y,(M*2-1));const secondNode=this.getTerm(Y,(M*2));let gzM=this.GanZhi((Y-1900)*12+M+11);if(D>=firstNode)gzM=this.GanZhi((Y-1900)*12+M+12);let isTerm=false,Term=null;if(firstNode===D){isTerm=true;Term=this.solarTerm[M*2-2]}if(secondNode===D){isTerm=true;Term=this.solarTerm[M*2-1]}const dayCyc=Date.UTC(Y,sm,1)/86400000+25567+10;const gzD=this.GanZhi(dayCyc+D-1);const astro=this.toAstro(M,D);const solarDate=Y+'-'+M+'-'+D;const lunarDate=year+'-'+month+'-'+day;const fest=this.festival;const lfest=this.lFestival;const festKey=M+'-'+D;let lfestKey=month+'-'+day;if(month===12&&day===29&&this.monthDays(year,month)===29){lfestKey='12-30'}return{date:solarDate,lunarDate:lunarDate,festival:fest[festKey]?fest[festKey].title:null,lunarFestival:lfest[lfestKey]?lfest[lfestKey].title:null,lYear:year,lMonth:month,lDay:day,Animal:this.getAnimal(year),IMonthCn:(isLeap?"\u95f0":'')+this.toChinaMonth(month),IDayCn:this.toChinaDay(day),cYear:Y,cMonth:M,cDay:D,gzYear:gzY,gzMonth:gzM,gzDay:gzD,isToday:isToday,isLeap:isLeap,nWeek:nWeek,ncWeek:"\u661f\u671f"+cWeek,isTerm:isTerm,Term:Term,astro:astro}}
};
const lunar = calendar.solar2lunar();
const nowsolar = `${lunar.cMonth}月${lunar.cDay}日（${lunar.astro}）`;
const nowlunar = `${lunar.IMonthCn}${lunar.IDayCn} ${lunar.gzYear}${lunar.gzMonth}${lunar.gzDay} ${lunar.Animal}年`;

/* =========================
 * 标题池（融合两份）
 * ========================= */
function titleRandom(daysToNext) {
  const dic = {
    1: "距离放假，还要摸鱼多少天？🥱",
    2: "坚持住，就快放假啦！💪",
    3: "上班好累呀，好想放假😮‍💨",
    4: "努力，我还能加班24小时！🧐",
    5: "天呐，还要多久才放假呀？😭",
    6: "躺平中，等放假(☝ ՞ਊ ՞)☝",
    7: "只有摸鱼才是赚老板的钱🙎🤳",
    8: "一起摸鱼吧✌(՞ټ՞ )✌",
    9: "摸鱼中，期待下一个假日.ʕʘ‿ʘʔ.",
    10: "小乌龟慢慢爬🐢",
    11: "加油，明天会更好！",
    12: "生活本该如此轻松",
    13: "好累，但还能坚持一会儿",
    14: "最近好像又胖了，唉",
    15: "快放假啦，期待放松的时光",
    16: "今天的目标是先活下去",
    17: "给自己加个鸡腿！",
    18: "只要努力工作，老板的午餐就是我的",
    19: nowsolar,
    20: nowlunar
  };
  if (daysToNext === 0) return `今天是${listA[idxA][0]}，休息一下吧 ~`;
  const r = Math.floor(Math.random() * 20) + 1;
  return dic[r];
}

/* =========================
 * 面板两行内容拼装
 * ========================= */
// 行1（A源）：如果今天正日，改为展示“今天：xxx”，下一、下两项为 +1、+2
const a0 = listA[idxA];
const a1 = listA[idxA + 1] || a0;
const a2 = listA[idxA + 2] || a1;
const d0 = diffA(idxA);
const d1 = diffA(idxA + 1);
const d2 = diffA(idxA + 2);
const lineA =
  (d0 === 0
    ? `今天：${a0[0]} | ${a1[0]}${d1}天 | ${a2[0]}${d2}天`
    : `${a0[0]}${d0}天 | ${a1[0]}${d1}天 | ${a2[0]}${d2}天`);

// 行2（B源）：带祝词；正日显示🎉
const b0 = listB[idxB];
const b1 = listB[idxB + 1] || b0;
const b2 = listB[idxB + 2] || b1;
const db0 = diffB(idxB);
const db1 = diffB(idxB + 1);
const db2 = diffB(idxB + 2);
const lineB = `${b0[0]}:${todayB(db0)}, ${b1[0]}:${db1}天, ${b2[0]}:${db2}天`;

// 图标/配色以“离最近节点的天数（A源）”为准
const icon = iconNow(d0);
const color = iconColor(d0);

// 输出（两行中间留一个空行）
$done({
  title: titleRandom(d0),
  icon,
  "icon-color": color,
  content: `${lineA}\n\n${lineB}`
});
})();
