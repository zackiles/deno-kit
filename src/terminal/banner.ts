/**
 * @module terminal-banner
 * @description Animated banner functionality for terminal output with walking dinosaur, clouds, rain effects, and optional rollup animation
 *
 * @example
 * ```ts
 * import { printBanner } from './terminal-banner.ts'
 * import { colors } from '@std/fmt/colors'
 *
 * await printBanner({
 *   version: '1.0.0',
 *   colors,
 *   purple: colors.magenta,
 *   rollup: true
 * })
 * ```
 */

import terminal from './mod.ts'

const RESET = '\x1b[0m'
const STYLE_BASE = '\x1b[0m\x1b[38;2;255;255;255m'
const DARK_BLUE = '\x1b[38;2;0;0;139m'
const HIDE_CURSOR = '\x1b[?25l'
const SHOW_CURSOR = '\x1b[?25h'

/**
 * Configuration for the banner animation.
 */
const SETTINGS = {
  /**
   * The maximum distance, in characters, the dinosaur will walk.
   * The actual distance is made responsive to the terminal width to ensure
   * the dinosaur stays within the visible scene.
   */
  WALK_DISTANCE: 45,
  /** Speed of the animation in milliseconds per frame. */
  ANIMATION_SPEED_MS: 90,
  /** How many character spaces the dinosaur moves per animation frame. */
  STEPS_PER_FRAME: 1.5,
  /**
   * The maximum width of the entire animation scene in characters.
   * The banner will not exceed this width, even if the terminal is wider.
   */
  DEFAULT_SCENE_WIDTH: 90,
  /**
   * The maximum width for internally rendered content like the header text
   * and rain effects. This ensures that text remains well-formatted and readable
   * within the broader scene.
   */
  MAX_CONTENT_WIDTH: 60,
  /** The minimum width of the scene in characters. */
  MIN_SCENE_WIDTH: 40,
  /** Initial horizontal offset for the dinosaur's starting position. */
  DINO_START_OFFSET: 0,
  /** Patterns for the dust effect shown when the dinosaur walks. */
  DUST_PATTERNS: [
    ['💨', '°'],
    ['💨', '💨', '°'],
    ['°', '💨'],
    ['💨'],
  ],
  /** Characters used for the twinkling eye animation. */
  EYE_STARS: ['*', '+', '×', '·', '✦', '★'],
  /** Number of times the eye twinkling animation will cycle. */
  EYE_CYCLES: 3,
  /** Spacing between raindrops. */
  RAIN_SPACING: 1,
  /** Speed at which the rain falls. */
  RAIN_FALL_SPEED: 3,
  /** Base speed for cloud movement. */
  CLOUD_SPEED: 0.5,
  /** Speed variation factor between different cloud clusters. */
  CLOUD_SPEED_VARIATION_FACTOR: 0.1,
  /** Vertical offset (from the top of the tree area) for the dinosaur. */
  DINO_VERTICAL_OFFSET: 2,
  /** The Y position where the grass line is rendered. */
  GRASS_Y_POSITION: 8,
  /** The maximum length of the grass line. */
  MAX_GRASS_LENGTH: 30,
  /** Factor to determine grass length based on scene width. */
  GRASS_WIDTH_FACTOR: 2.3,
  /** Speed multiplier for the eye animation. */
  EYE_ANIMATION_SPEED_FACTOR: 1.2,
  /** Speed multiplier for the final rollup animation. */
  ROLLUP_SPEED_FACTOR: 0.9,
  /** The minimum height of the area containing the palm tree. */
  MIN_TREE_AREA_HEIGHT: 9,
}

const DINO_FRAMES = [
  [
    '                 __',
    '                /·_)',
    '         _.----._/·/',
    '        /.^^^^^^^·/',
    '     __/·|·|··(··/',
    `            /__.-'|_|--|_/`,
  ],
  [
    '                  _',
    '                /·_)',
    '         _.----._/·/',
    '        /.^^^^^^^·/',
    '     __/·(··|··|·|',
    `             /__.-'|_|--/_|`,
  ],
  [
    '                   _',
    '                 /·_)',
    '          _.----._/·/',
    '         /.^^^^^^^·/',
    '      __/·|·|··(··/',
    '              /__.-|_|--|_|',
  ],
  [
    '                  _',
    '                /·_)',
    '         _.----._/·/',
    '        /.^^^^^^^·/',
    '     __/·(··|··(·|',
    `             /__.-'|_|--|_|`,
  ],
]

interface ColorsInterface {
  bold: (text: string) => string
  white: (text: string) => string
  green: (text: string) => string
  brightYellow: (text: string) => string
  purple: (text: string) => string
  red: (text: string) => string
}

interface BannerOptions {
  version: string
  colors: ColorsInterface
  rollup: boolean
}

// Clean keyboard input handler
class KeyboardSkipper {
  private skipRequested = false
  private signalHandler?: (() => void) | undefined

  startListening() {
    try {
      Deno.stdin.setRaw(true)

      // Set up Ctrl-C signal handler
      this.signalHandler = () => {
        this.cleanup()
        this.skipRequested = true
      }
      Deno.addSignalListener('SIGINT', this.signalHandler)

      // Start reading keyboard input in background
      this.readInput()
    } catch {
      // Ignore if raw mode not supported
    }
  }

  private async readInput() {
    try {
      const buffer = new Uint8Array(1)
      while (!this.skipRequested) {
        const result = await Deno.stdin.read(buffer)
        if (result !== null && result > 0) {
          // Check for Ctrl-C (0x03)
          if (buffer[0] === 0x03) {
            this.cleanup()
            this.skipRequested = true
            break
          }

          // Any other key triggers skip
          this.skipRequested = true
          break
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  isSkipped(): boolean {
    return this.skipRequested
  }

  cleanup() {
    try {
      if (this.signalHandler) {
        Deno.removeSignalListener('SIGINT', this.signalHandler)
        this.signalHandler = undefined
      }
      Deno.stdin.setRaw(false)
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Module-level helper functions
function getPalmTreeLines(colors: ColorsInterface): string[] {
  return terminal.dedent`
    ${colors.green('      🌿🌿')}
    ${colors.green('     🌿🌿🌿')}
    ${colors.green('     🌿🌿🌿')}
    ${colors.green('     🌿🌿🌿')}
    ${colors.brightYellow('       ||')}
    ${colors.brightYellow('       ||')}
    ${colors.brightYellow('       ||')}
  `.trim().split('\n')
}

function renderSky(
  step: number,
  sceneWidth: number,
  cloudClusters: Array<{ top: string; bottom: string }>,
) {
  const cloudSpeed = SETTINGS.CLOUD_SPEED
  const cloudOffset = Math.floor(step * cloudSpeed)
  const skyLine = ' '.repeat(sceneWidth)
  let topSky = skyLine
  let bottomSky = skyLine

  cloudClusters.forEach((cluster, i) => {
    const speedVariation = 1 + (i * SETTINGS.CLOUD_SPEED_VARIATION_FACTOR)
    const startingOffset = (sceneWidth / cloudClusters.length) * i
    const individualCloudSpeed = cloudSpeed * speedVariation
    const pos = (cloudOffset * individualCloudSpeed + startingOffset) %
      sceneWidth

    const topVisualLen = terminal.stripAnsiCode(cluster.top).length
    const bottomVisualLen = terminal.stripAnsiCode(cluster.bottom).length
    const maxVisualLen = Math.max(topVisualLen, bottomVisualLen)

    if (pos >= 0 && pos + maxVisualLen <= sceneWidth) {
      topSky = topSky.substring(0, Math.floor(pos)) +
        cluster.top +
        topSky.substring(Math.floor(pos) + topVisualLen)

      bottomSky = bottomSky.substring(0, Math.floor(pos)) +
        cluster.bottom +
        bottomSky.substring(Math.floor(pos) + bottomVisualLen)
    }
  })

  return [topSky, bottomSky]
}

function processArt(artFrameLines: string[]): string[] {
  if (artFrameLines.length === 0) return []

  const nonEmptyContentLines = artFrameLines.filter((line) =>
    line.trim().length > 0
  )
  if (nonEmptyContentLines.length === 0) {
    return artFrameLines.map(() => '')
  }

  const minIndent = Math.min(
    ...nonEmptyContentLines.map((line) => {
      const indent = line.search(/\S/)
      return indent
    }),
  )

  return artFrameLines.map((line) => {
    if (line.trim().length === 0) return ''
    return line.substring(minIndent)
  })
}

function renderTreeWithDino(
  treeLines: string[],
  artLines: string[],
  position: number,
  dustIndex: number,
  treeAreaHeight: number,
  responsiveDinoStartOffset: number,
  colors: ColorsInterface,
  sceneWidth: number,
) {
  const scene: string[] = []
  const dinoStart = SETTINGS.DINO_VERTICAL_OFFSET

  for (let i = 0; i < treeAreaHeight; i++) {
    const treeSeg = i < treeLines.length ? treeLines[i] : ''
    const dinoIdx = i - dinoStart

    if (dinoIdx >= 0 && dinoIdx < artLines.length) {
      const dinoLine = artLines[dinoIdx] || ''
      const totalPosition = responsiveDinoStartOffset + position
      const positionedDino = ' '.repeat(totalPosition) + dinoLine

      let line = `${treeSeg}  ${colors.purple(positionedDino)}`

      const isFootLine = dinoIdx === artLines.length - 1
      if (
        isFootLine &&
        dustIndex >= 0 &&
        dustIndex < SETTINGS.DUST_PATTERNS.length
      ) {
        line += ` ${SETTINGS.DUST_PATTERNS[dustIndex].join('')}`
      }
      scene.push(line)
    } else if (i === SETTINGS.GRASS_Y_POSITION) {
      const grassLength = Math.min(
        SETTINGS.MAX_GRASS_LENGTH,
        Math.floor(sceneWidth / SETTINGS.GRASS_WIDTH_FACTOR),
      )
      scene.push(colors.green('🌱'.repeat(grassLength)))
    } else {
      scene.push(treeSeg)
    }
  }
  return scene
}

function renderRain(step: number, sceneWidth: number, sceneHeight: number) {
  const rainLines: string[] = []
  const starIndex = step % SETTINGS.EYE_STARS.length
  const rainStar = SETTINGS.EYE_STARS[starIndex] || '*'

  const rainProgress = Math.min(
    Math.floor(step / SETTINGS.RAIN_FALL_SPEED),
    sceneHeight,
  )

  for (let row = 0; row < sceneHeight; row++) {
    let rainLine = ' '.repeat(sceneWidth)
    const hasRain = row < rainProgress

    if (hasRain) {
      for (
        let baseCol = 0;
        baseCol < sceneWidth;
        baseCol += SETTINGS.RAIN_SPACING
      ) {
        const randomOffset = Math.floor(Math.random() * 3) - 1
        const actualCol = baseCol + randomOffset

        if (actualCol >= 0 && actualCol < sceneWidth) {
          rainLine = rainLine.substring(0, actualCol) + rainStar +
            rainLine.substring(actualCol + 1)
        }
      }
    }

    rainLines.push(rainLine)
  }

  return rainLines
}

function applyRainOverlay(
  sceneLines: string[],
  rainLines: string[],
  effectiveSceneWidth: number,
) {
  const combinedLines: string[] = []

  for (let i = 0; i < sceneLines.length; i++) {
    const sceneLine = sceneLines[i] || ''
    const rainLine = rainLines[i] || ''

    let result = ''
    let visiblePos = 0
    let j = 0

    while (j < sceneLine.length) {
      const char = sceneLine[j]

      if (char.charCodeAt(0) === 27) {
        result += char
        j++
        while (j < sceneLine.length && sceneLine[j] !== 'm') {
          result += sceneLine[j]
          j++
        }
        if (j < sceneLine.length) {
          result += sceneLine[j]
          j++
        }
        continue
      }

      const shouldHaveRain = visiblePos < rainLine.length &&
        rainLine[visiblePos] !== ' ' &&
        visiblePos % SETTINGS.RAIN_SPACING === 0

      if (shouldHaveRain && char === ' ') {
        result += `${DARK_BLUE}${rainLine[visiblePos]}${RESET}`
      } else {
        result += char
      }

      visiblePos++
      j++
    }

    while (
      visiblePos < rainLine.length && visiblePos < effectiveSceneWidth
    ) {
      if (
        rainLine[visiblePos] !== ' ' &&
        visiblePos % SETTINGS.RAIN_SPACING === 0
      ) {
        result += `${DARK_BLUE}${rainLine[visiblePos]}${RESET}`
      } else {
        result += ' '
      }
      visiblePos++
    }

    combinedLines.push(result)
  }

  return combinedLines
}

function buildScene(
  position: number,
  frameIdx: number,
  dustIndex: number,
  step: number,
  effectiveSceneWidth: number,
  palmTreeLines: string[],
  treeAreaHeight: number,
  responsiveDinoStartOffset: number,
  colors: ColorsInterface,
  sceneWidth: number,
  cloudClusters: Array<{ top: string; bottom: string }>,
) {
  const scene: string[] = []
  const [_topSky, bottomSky] = renderSky(step, sceneWidth, cloudClusters)
  scene.push(bottomSky)

  const artLines = processArt(DINO_FRAMES[frameIdx])
  const treeDinoLines = renderTreeWithDino(
    palmTreeLines,
    artLines,
    position,
    dustIndex,
    treeAreaHeight,
    responsiveDinoStartOffset,
    colors,
    sceneWidth,
  )
  scene.push(...treeDinoLines)

  const rainLines = renderRain(step, effectiveSceneWidth, scene.length)
  const sceneWithRain = applyRainOverlay(scene, rainLines, effectiveSceneWidth)

  const safeLinesScene = sceneWithRain.map((line) => {
    let visibleLength = 0
    let result = ''

    for (let i = 0; i < line.length; i++) {
      const char = line.charCodeAt(i)

      if (char === 27) {
        result += line[i]
        i++
        while (i < line.length && line[i] !== 'm') {
          result += line[i]
          i++
        }
        if (i < line.length) {
          result += line[i]
        }
      } else {
        if (visibleLength >= effectiveSceneWidth) break
        result += line[i]
        visibleLength++
      }
    }

    return result
  })

  return safeLinesScene.join('\n')
}

async function printBanner(options: BannerOptions) {
  const { version, colors, rollup } = options

  const skipper = new KeyboardSkipper()

  try {
    skipper.startListening()

    // Get terminal dimensions and calculate responsive scene width
    const getSceneWidth = () => {
      try {
        const terminalSize = Deno.consoleSize()
        const maxWidth = Math.max(
          Math.min(terminalSize.columns - 4, SETTINGS.DEFAULT_SCENE_WIDTH),
          SETTINGS.MIN_SCENE_WIDTH,
        )
        return maxWidth
      } catch {
        return SETTINGS.DEFAULT_SCENE_WIDTH
      }
    }

    const SCENE_WIDTH = getSceneWidth()

    const getDinosaurWidth = () => {
      const maxWidth = Math.max(
        ...DINO_FRAMES.map((frame) =>
          Math.max(...frame.map((line) => line.length))
        ),
      )
      return maxWidth
    }

    const DINO_WIDTH = getDinosaurWidth()
    const TREE_WIDTH = Math.max(
      ...getPalmTreeLines(colors).map((line) => line.length),
    )

    const RESPONSIVE_DINO_START_OFFSET = Math.max(
      1,
      Math.min(SETTINGS.DINO_START_OFFSET, Math.floor(SCENE_WIDTH * 0.1)),
    )
    const AVAILABLE_WALK_SPACE = SCENE_WIDTH - TREE_WIDTH -
      RESPONSIVE_DINO_START_OFFSET - DINO_WIDTH - 5
    const RESPONSIVE_WALK_DISTANCE = Math.max(
      3,
      Math.min(SETTINGS.WALK_DISTANCE, AVAILABLE_WALK_SPACE),
    )

    await terminal.write(RESET)
    await terminal.write(HIDE_CURSOR)

    const HEADER = (version: string) => {
      const appName = terminal.bold(terminal.greenGradient('Deno-Kit'))
      const versionText = `v${version}`
      const baseText = `🦕 ${appName}`
      const baseWidth = terminal.getCharacterWidth(baseText)
      const versionWidth = terminal.getCharacterWidth(versionText)
      const padding = Math.max(
        0,
        (Math.min(SETTINGS.MAX_CONTENT_WIDTH, SCENE_WIDTH - 10)) -
          baseWidth - versionWidth,
      )
      const titleLine = `${STYLE_BASE}${baseText}${
        ' '.repeat(padding)
      }${versionText}${RESET}\n`
      const separatorLength = Math.min(
        SETTINGS.MAX_CONTENT_WIDTH,
        SCENE_WIDTH - 10,
      )
      const separatorLine = `${STYLE_BASE}${
        '='.repeat(separatorLength)
      }${RESET}\n`
      return `${titleLine + separatorLine}${STYLE_BASE}${RESET}`
    }

    const EFFECTIVE_SCENE_WIDTH = Math.min(
      SETTINGS.MAX_CONTENT_WIDTH,
      SCENE_WIDTH - 10,
    )

    const CLOUD_CLUSTERS = [
      {
        top: colors.white('░▒▓▒░'),
        bottom: colors.white(' ░ ░ '),
      },
      {
        top: colors.white('▒▓██▓▒'),
        bottom: colors.white(' ░▒░▒ '),
      },
      {
        top: colors.white('░▒▓▒'),
        bottom: colors.white(' ░ ░'),
      },
      {
        top: colors.white(' ░▒ '),
        bottom: colors.white('▒▓██▓▒░'),
      },
      {
        top: colors.white('░░'),
        bottom: colors.white('░▒▓▓▒░'),
      },
    ]

    const PALM_TREE_LINES = getPalmTreeLines(colors)
    const TREE_AREA_HEIGHT = Math.max(
      PALM_TREE_LINES.length,
      SETTINGS.MIN_TREE_AREA_HEIGHT,
    )
    const SCENE_HEIGHT = 1 + TREE_AREA_HEIGHT

    await terminal.write(HEADER(version))
    await terminal.write(
      `${
        buildScene(
          0,
          0,
          -1,
          0,
          EFFECTIVE_SCENE_WIDTH,
          PALM_TREE_LINES,
          TREE_AREA_HEIGHT,
          RESPONSIVE_DINO_START_OFFSET,
          colors,
          SCENE_WIDTH,
          CLOUD_CLUSTERS,
        )
      }\n`,
    )

    const totalSteps = RESPONSIVE_WALK_DISTANCE / SETTINGS.STEPS_PER_FRAME

    // Main animation loop with proper async handling
    for (let step = 1; step <= totalSteps && !skipper.isSkipped(); step++) {
      const pos = Math.min(
        step * SETTINGS.STEPS_PER_FRAME,
        RESPONSIVE_WALK_DISTANCE,
      )
      const frameIdx = (step - 1) % DINO_FRAMES.length
      const dustIndex = step % 2 === 0
        ? step % SETTINGS.DUST_PATTERNS.length
        : -1

      await terminal.write(`\x1b[${SCENE_HEIGHT}A`)
      for (let i = 0; i < SCENE_HEIGHT; i++) {
        await terminal.write('\x1b[2K')
        if (i < SCENE_HEIGHT - 1) {
          await terminal.write('\x1b[1B')
        }
      }
      await terminal.write(`\x1b[${SCENE_HEIGHT - 1}A`)

      await terminal.write(
        `${
          STYLE_BASE +
          buildScene(
            pos,
            frameIdx,
            dustIndex,
            step,
            EFFECTIVE_SCENE_WIDTH,
            PALM_TREE_LINES,
            TREE_AREA_HEIGHT,
            RESPONSIVE_DINO_START_OFFSET,
            colors,
            SCENE_WIDTH,
            CLOUD_CLUSTERS,
          ) +
          RESET
        }\n`,
      )

      await new Promise((r) => setTimeout(r, SETTINGS.ANIMATION_SPEED_MS))
    }

    const finalPos = RESPONSIVE_WALK_DISTANCE

    // Eye animation loop with proper async handling
    if (!skipper.isSkipped()) {
      for (
        let cycle = 0;
        cycle < SETTINGS.EYE_CYCLES && !skipper.isSkipped();
        cycle++
      ) {
        for (const star of SETTINGS.EYE_STARS) {
          if (skipper.isSkipped()) break

          await new Promise((r) =>
            setTimeout(
              r,
              SETTINGS.ANIMATION_SPEED_MS * SETTINGS.EYE_ANIMATION_SPEED_FACTOR,
            )
          )

          await terminal.write(`\x1b[${SCENE_HEIGHT}A`)
          for (let i = 0; i < SCENE_HEIGHT; i++) {
            await terminal.write('\x1b[2K')
            if (i < SCENE_HEIGHT - 1) {
              await terminal.write('\x1b[1B')
            }
          }
          await terminal.write(`\x1b[${SCENE_HEIGHT - 1}A`)

          const eyeArtLines = [
            `                   -${colors.red(star + star)}`,
            '                 /·/-`',
            '          _.----._/·/',
            '         /.^^^^^^^·/',
            '      __/··(·|··(·|·',
            "              /__.-'|_|--|_|",
          ]
          const artLines = processArt(eyeArtLines)
          const scene: string[] = []
          const eyeStep = totalSteps +
            cycle * SETTINGS.EYE_STARS.length +
            SETTINGS.EYE_STARS.indexOf(star)
          const [_topSky, bottomSky] = renderSky(
            eyeStep,
            SCENE_WIDTH,
            CLOUD_CLUSTERS,
          )
          scene.push(bottomSky)
          scene.push(
            ...renderTreeWithDino(
              PALM_TREE_LINES,
              artLines,
              finalPos,
              -1,
              TREE_AREA_HEIGHT,
              RESPONSIVE_DINO_START_OFFSET,
              colors,
              SCENE_WIDTH,
            ),
          )

          const rainLines = renderRain(
            eyeStep,
            EFFECTIVE_SCENE_WIDTH,
            scene.length,
          )
          const sceneWithRain = applyRainOverlay(
            scene,
            rainLines,
            EFFECTIVE_SCENE_WIDTH,
          )

          const safeEyeScene = sceneWithRain.map((line) => {
            let visibleLength = 0
            let result = ''

            for (let i = 0; i < line.length; i++) {
              const char = line.charCodeAt(i)

              if (char === 27) {
                result += line[i]
                i++
                while (i < line.length && line[i] !== 'm') {
                  result += line[i]
                  i++
                }
                if (i < line.length) {
                  result += line[i]
                }
              } else {
                if (visibleLength >= EFFECTIVE_SCENE_WIDTH) break
                result += line[i]
                visibleLength++
              }
            }

            return result
          })

          await terminal.write(
            `${STYLE_BASE + safeEyeScene.join('\n') + RESET}\n`,
          )
        }
      }
    }

    // Rollup animation with proper async handling
    if (rollup) {
      const rollupSpeed = SETTINGS.ANIMATION_SPEED_MS *
        SETTINGS.ROLLUP_SPEED_FACTOR
      const totalSceneLines = SCENE_HEIGHT

      const finalStar = SETTINGS.EYE_STARS[SETTINGS.EYE_STARS.length - 1]
      const finalEyeArtLines = [
        `                   -${colors.red(finalStar + finalStar)}`,
        '                 /·/-`',
        '          _.----._/·/',
        '         /.^^^^^^^·/',
        '      __/··(·|··(·|·',
        "              /__.-'|_|--|_|",
      ]

      for (
        let linesToRemove = 1;
        linesToRemove <= totalSceneLines;
        linesToRemove++
      ) {
        await new Promise((r) => setTimeout(r, rollupSpeed))

        await terminal.write(`\x1b[${totalSceneLines}A`)

        for (let i = 0; i < totalSceneLines; i++) {
          await terminal.write('\x1b[2K')
          if (i < totalSceneLines - 1) {
            await terminal.write('\x1b[1B')
          }
        }

        await terminal.write(`\x1b[${totalSceneLines - 1}A`)

        const remainingLines = totalSceneLines - linesToRemove
        if (remainingLines > 0) {
          const finalStep = totalSteps +
            SETTINGS.EYE_CYCLES * SETTINGS.EYE_STARS.length
          const finalEyeArt = processArt(finalEyeArtLines)
          const scene: string[] = []
          const [_topSky, bottomSky] = renderSky(
            finalStep,
            SCENE_WIDTH,
            CLOUD_CLUSTERS,
          )
          scene.push(bottomSky)
          scene.push(
            ...renderTreeWithDino(
              PALM_TREE_LINES,
              finalEyeArt,
              finalPos,
              -1,
              TREE_AREA_HEIGHT,
              RESPONSIVE_DINO_START_OFFSET,
              colors,
              SCENE_WIDTH,
            ),
          )

          const rainLines = renderRain(
            finalStep,
            EFFECTIVE_SCENE_WIDTH,
            scene.length,
          )
          const sceneWithRain = applyRainOverlay(
            scene,
            rainLines,
            EFFECTIVE_SCENE_WIDTH,
          )

          const safeRollupScene = sceneWithRain.map((line) => {
            let visibleLength = 0
            let result = ''

            for (let i = 0; i < line.length; i++) {
              const char = line.charCodeAt(i)

              if (char === 27) {
                result += line[i]
                i++
                while (i < line.length && line[i] !== 'm') {
                  result += line[i]
                  i++
                }
                if (i < line.length) {
                  result += line[i]
                }
              } else {
                if (visibleLength >= EFFECTIVE_SCENE_WIDTH) break
                result += line[i]
                visibleLength++
              }
            }

            return result
          })

          const visibleScene = safeRollupScene.slice(0, remainingLines)

          await terminal.write(
            `${STYLE_BASE + visibleScene.join('\n') + RESET}`,
          )

          const emptyLines = linesToRemove
          for (let i = 0; i < emptyLines; i++) {
            await terminal.write('\n')
          }
        }
      }

      await terminal.write(`\x1b[${totalSceneLines + 1}A`)
      await terminal.write('\x1b[0J')
    }
  } finally {
    skipper.cleanup()
    await terminal.write('\n')
    await terminal.write(RESET)
    await terminal.write(SHOW_CURSOR)
  }
}

export { printBanner }
