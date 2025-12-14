import { AppIntentManager, AppIntentProtocol, Notification, Widget } from "scripting"

export const SELECT_KEY = "selected-date"

// 选择某一天：写入 storage 并刷新所有 Widget
export const SelectDayIntent = AppIntentManager.register({
  name: "calendar.select.day",                         // 唯一名称
  protocol: AppIntentProtocol.AppIntent,               // 指定协议
  perform: async (params: { year: number; month: number; day: number }) => {
    Storage.set(SELECT_KEY, JSON.stringify(params))
    Widget.reloadAll()                                 // 刷新 Widget
  }
})

// 返回今日：清除选中并刷新
export const BackToTodayIntent = AppIntentManager.register({
  name: "calendar.back.today",
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_: void) => {
    Storage.remove(SELECT_KEY)
    Widget.reloadAll()
  }
})

export const CompleteReminderIntent = AppIntentManager.register({
  name: "calendar.complete.reminder",
  protocol: AppIntentProtocol.AppIntent,
  perform: async ({
    id,
    year,
    month,
  }: {
    id: string
    year: number
    month: number
  }) => {
    try {
      const start = new Date(year, month - 1, 0)
      const end = new Date(year, month, 0, 23, 59, 59)
      const list = await Reminder.getIncompletes({
        startDate: start,
        endDate: end
      })
      const reminder = list.find(e => e.identifier === id)
      if (reminder) {
        reminder.completionDate = new Date
        await reminder.save()
        Widget.reloadAll()
      } else {
        // Notification.schedule({
        //   title: "Not found"
        // })
        console.log("not found")
      }
    } catch (e) {
      // Notification.schedule({
      //   title: "Failed to complete reminder",
      //   body: String(e)
      // })

      console.error(String(e))
    }
  }
})