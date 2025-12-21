// shared/carrier/cards/components/feeCard.tsx
import { VStack, HStack, Text, Image, Spacer } from "scripting"
import { timeStyle, RingCardTheme } from "../../theme"
import { type WidgetSurfacePalette, wrapWithBorderLayer, buildWidgetBackground } from "../../surfaces"

export function FeeCard(props: {
  title: string
  valueText: string
  theme: RingCardTheme
  logoPath?: string | null
  updateTime: string
  surfaces?: WidgetSurfacePalette
}) {
  const { title, valueText, theme, logoPath, updateTime, surfaces } = props
  const isUrlLogo =
    !!logoPath && (logoPath.startsWith("http://") || logoPath.startsWith("https://"))

  const background = surfaces?.content ?? theme.bg

  const LogoImage = ({ size }: { size: number }) =>
    logoPath ? (
      isUrlLogo ? (
        <Image imageUrl={logoPath} resizable frame={{ width: size, height: size }} />
      ) : (
        <Image filePath={logoPath} resizable frame={{ width: size, height: size }} />
      )
    ) : (
      <Image
        systemName={theme.icon}
        font={size}
        fontWeight="semibold"
        foregroundStyle={theme.tint}
      />
    )

  const card = (
    <VStack
      alignment="center"
      padding={{ top: 10, leading: 10, bottom: 10, trailing: 10 }}
      frame={{ minWidth: 0, maxWidth: Infinity }}
      widgetBackground={buildWidgetBackground({ style: background, cornerRadius: 18 })}
    >
      <Spacer minLength={2} />
      <HStack alignment="center">
        <Spacer />
        <LogoImage size={40} />
        <Spacer />
      </HStack>

      <Spacer minLength={4} />
      <HStack
        alignment="center"
        spacing={3}
        frame={{ minWidth: 0, maxWidth: Infinity }}
      >
        <Image
          systemName="arrow.triangle.2.circlepath"
          font={5}
          foregroundStyle={timeStyle}
        />
        <Text
          font={11}
          foregroundStyle={timeStyle}
          lineLimit={1}
          minScaleFactor={0.5}
          frame={{ minWidth: 0, maxWidth: Infinity, alignment: "center" }}
        >
          {updateTime}
        </Text>
      </HStack>

      <Spacer minLength={6} />
      <Text
        font={15}
        fontWeight="semibold"
        foregroundStyle={theme.tint}
        lineLimit={1}
        minScaleFactor={0.7}
      >
        {valueText}
      </Text>
      <Spacer minLength={2} />
      <Text
        font={10}
        fontWeight="semibold"
        foregroundStyle={theme.tint}
        lineLimit={1}
        minScaleFactor={0.7}
      >
        {title}
      </Text>
      <Spacer minLength={4} />
    </VStack>
  )

  return wrapWithBorderLayer({ child: card, surfaces, cornerRadius: 18, padding: 2 })
}