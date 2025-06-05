function gradient(hexColors: string[]): (text: string) => string {
  if (hexColors.length < 2) throw new Error('At least 2 colors are required')

  type RGB = [number, number, number]

  const hexToRgb = (hex: string): RGB => {
    const sanitized = hex.replace(/^#/, '')
    const parseSegment = (index: number): number =>
      Number.parseInt(
        sanitized.length === 3
          ? sanitized[index] + sanitized[index]
          : sanitized.slice(index * 2, index * 2 + 2),
        16,
      )
    return [parseSegment(0), parseSegment(1), parseSegment(2)]
  }

  const interpolateValue = (
    startValue: number,
    endValue: number,
    ratio: number,
  ): number => startValue + (endValue - startValue) * ratio

  const blendColors = (
    from: RGB,
    to: RGB,
    ratio: number,
  ): RGB => [
    Math.round(interpolateValue(from[0], to[0], ratio)),
    Math.round(interpolateValue(from[1], to[1], ratio)),
    Math.round(interpolateValue(from[2], to[2], ratio)),
  ]

  const rgbToAnsi = ([red, green, blue]: RGB): string =>
    `\x1b[38;2;${red};${green};${blue}m`

  const palette = hexColors.map(hexToRgb)
  const segmentCount = palette.length - 1

  const applyGradient = (text: string): string => {
    if (text.length === 0) return ''
    if (text.length === 1) return `${rgbToAnsi(palette[0])}${text}\x1b[0m`

    const charactersPerSegment = text.length / segmentCount
    let output = ''

    for (let index = 0; index < text.length; index++) {
      const currentSegment = Math.min(
        Math.floor(index / charactersPerSegment),
        segmentCount - 1,
      )
      const positionInSegment = (index % charactersPerSegment) /
        charactersPerSegment
      const currentColor = blendColors(
        palette[currentSegment],
        palette[currentSegment + 1],
        positionInSegment,
      )
      output += `${rgbToAnsi(currentColor)}${text[index]}`
    }

    return `${output}\x1b[0m`
  }

  return applyGradient
}

export { gradient }
