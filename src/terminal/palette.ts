import { gradient } from './gradient.ts'
import * as stdColors from '@std/fmt/colors'

interface CustomPalette {
  greenGradient: (text: string) => string
  purpleGradient: (text: string) => string
  redGradient: (text: string) => string
  blueGradient: (text: string) => string
  whiteGradient: (text: string) => string
  purple: (text: string) => string
  green: (text: string) => string
  red: (text: string) => string
  blue: (text: string) => string
}
const customPalette: CustomPalette = {
  greenGradient: gradient(['#A8FF60', '#66FF66', '#33CC66', '#00B140']),
  purpleGradient: gradient(['#B14EFF', '#966FE6', '#7D63CA', '#3F3265']),
  redGradient: gradient(['#FF7A7A', '#FF4C4C', '#CC3333', '#B10000']),
  blueGradient: gradient(['#7A7AFF', '#4C4CFF', '#3333CC', '#0000B1']),
  whiteGradient: gradient(['#FFFFFF', '#FAFAFA', '#F5F5F5', '#F0F0F0']),
  purple: (text: string) => stdColors.rgb24(text, { r: 125, g: 99, b: 202 }),
  green: (text: string) => stdColors.rgb24(text, { r: 168, g: 255, b: 96 }),
  red: (text: string) => stdColors.rgb24(text, { r: 255, g: 122, b: 122 }),
  blue: (text: string) => stdColors.rgb24(text, { r: 122, g: 122, b: 255 }),
} as const

type Palette = typeof stdColors & CustomPalette & { gradient: typeof gradient }
const palette: Palette = { ...stdColors, ...customPalette, gradient }

export default palette

export type { CustomPalette, Palette }
export * from '@std/fmt/colors'
export * from './gradient.ts'
