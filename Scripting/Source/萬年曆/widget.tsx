import {
  Widget,
  VStack,
  Text,
} from "scripting"

import { loadCalendarData } from "./util"
import { MediumWidgetView } from "./widgets/medium"
import { LargeWidgetView } from "./widgets/large"
import { SmallWidgetView } from "./widgets/small"

async function main() {
  try {
    const { days, events, reminders, selected } = await loadCalendarData()
    if (Widget.family === 'systemSmall') {
      Widget.present(
        <SmallWidgetView
          days={days}
          events={events}
          reminders={reminders}
          selected={selected}
        />
      )
    } else if (Widget.family === 'systemMedium') {
      Widget.present(<MediumWidgetView
        days={days}
        events={events}
        reminders={reminders}
        selected={selected}
      />
      )
    } else {
      Widget.present(
        <LargeWidgetView
          days={days}
          events={events}
          reminders={reminders}
          selected={selected}
        />
      )
    }
  } catch (e) {
    Widget.present(
      <VStack alignment="center">
        <Text font="headline" foregroundStyle="red">加载失败</Text>
        <Text font="footnote">{String(e)}</Text>
      </VStack>
    )
  }
}

main()