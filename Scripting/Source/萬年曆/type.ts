export type DataResponse = {
  status: string,
  t: string,
  set_cache_time: string,
  data: Array<DataItem>,
}

export type DataItem = {
  ExtendedLocation: string,
  OriginQuery: string,
  SchemaVer: string,
  SiteId: number,
  StdStg: number,
  StdStl: number,
  _select_time: number,
  _update_time: string,
  _version: number,
  almanac: Array<AlmanacItem>,
  date: string,
  day: string,
  endDate: string,
  festival: string,
  holiday: string,
  lunarDate: string,
  lunarMonth: string,
  lunarYear: string,
  month: string,
  startDate: string,
  term: string,
  timestamp: number,
  year: string,
}

export type AlmanacItem = {
  animal: string,
  avoid: string,
  cnDay: string,
  day: string,
  festivalList?: string,
  gzDate: string,
  gzMonth: string,
  gzYear: string,
  isBigMonth: string,
  jiri: string,
  lDate: string,
  lMonth: string,
  lunarDate: string,
  lunarMonth: string,
  lunarYear: string,
  month: string,
  oDate: string,
  status: string,
  suit: string,
  term?: string,
  timestamp: number,
  year: string,
  yjJumpUrl: string,
  yj_from: string,
}

export type ParsedDayInfo = {
  day: number
  year: number
  month: number
  isToday: boolean
  isOtherMonth: boolean
  isHolidayDisplay: boolean
  showWorkDay: boolean
  showHoliday: boolean
  match?: AlmanacItem | undefined
  hasTerm: boolean
  hasEvents: boolean
  hasReminders: boolean
}