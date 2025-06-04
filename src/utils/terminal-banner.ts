/**
 * @module terminal-banner
 * @description Animated banner functionality for terminal output
 */

import { dedent } from '@std/text/unstable-dedent'

const encoder = new TextEncoder()
const RESET = '\x1b[0m'
const STYLE_BASE = '\x1b[0m\x1b[38;2;255;255;255m'

// Settings
const SETTINGS = {
  WALK_DISTANCE: 25,
  ANIMATION_SPEED_MS: 200,
  STEPS_PER_FRAME: 2,
  DEFAULT_SCENE_WIDTH: 90,
  MIN_SCENE_WIDTH: 50,
  DINO_START_OFFSET: 0, // Initial offset to clear the tree
  DUST_PATTERNS: [
    ['💨', '°'],
    ['💨', '💨', '°'],
    ['°', '💨'],
    ['💨'],
  ],
  EYE_STARS: ['*', '+', '×', '·', '✦', '★'],
  EYE_CYCLES: 2,
}

const DINO_FRAMES = [
  [
    '                 __',
    '                / _)',
    '         _.----._/ /',
    '        /         /',
    '     __/ | |  (  /',
    "            /__.-'|_|--|_/",
  ],
  [
    '                  _',
    '                / _)',
    '         _.----._/ /',
    '        /         /',
    '     __/ (  |  | |',
    "             /__.-'|_|--/_|",
  ],
  [
    '                   _',
    '                 / _)',
    '          _.----._/ /',
    '         /         /',
    '      __/ | |  (  /',
    '              /__.-|_|--|_|',
  ],
  [
    '                  _',
    '                / _)',
    '         _.----._/ /',
    '        /         /',
    '     __/ (  |  ( |',
    "             /__.-'|_|--|_|",
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

export async function printBanner(
  version: string,
  colors: ColorsInterface,
  purple: (text: string) => string,
) {
  // Get terminal dimensions and calculate responsive scene width
  const getSceneWidth = () => {
    try {
      const terminalSize = Deno.consoleSize()
      // Leave some margin and ensure minimum width
      const maxWidth = Math.max(
        Math.min(terminalSize.columns - 4, SETTINGS.DEFAULT_SCENE_WIDTH),
        SETTINGS.MIN_SCENE_WIDTH,
      )
      return maxWidth
    } catch {
      // Fallback if unable to get terminal size
      return SETTINGS.DEFAULT_SCENE_WIDTH
    }
  }

  const SCENE_WIDTH = getSceneWidth()

  // Calculate dinosaur dimensions and adjust walking parameters
  const getDinosaurWidth = () => {
    const maxWidth = Math.max(
      ...DINO_FRAMES.map((frame) =>
        Math.max(...frame.map((line) => line.length))
      ),
    )
    return maxWidth
  }

  const DINO_WIDTH = getDinosaurWidth()
  const TREE_WIDTH = Math.max(...getPalmTreeLines().map((line) => line.length))

  // Calculate safe walking boundaries
  const RESPONSIVE_DINO_START_OFFSET = Math.max(
    1,
    Math.min(SETTINGS.DINO_START_OFFSET, Math.floor(SCENE_WIDTH * 0.1)),
  )
  const AVAILABLE_WALK_SPACE = SCENE_WIDTH - TREE_WIDTH -
    RESPONSIVE_DINO_START_OFFSET - DINO_WIDTH - 5 // 5 char buffer
  const RESPONSIVE_WALK_DISTANCE = Math.max(
    3,
    Math.min(SETTINGS.WALK_DISTANCE, AVAILABLE_WALK_SPACE),
  )

  // Ensure a clean slate before starting banner output
  Deno.stdout.writeSync(encoder.encode(RESET))
  Deno.stdout.writeSync(encoder.encode('\x1b[?25l')) // Hide cursor during animation

  // Static components using colors - now passed as parameters
  const HEADER = (version: string) => {
    const titleLine = `${STYLE_BASE}🦕 ${
      purple(colors.bold('Deno-Kit'))
    } | v${version}${RESET}\n`
    const separatorLength = Math.min(60, SCENE_WIDTH - 10)
    const separatorLine = `${STYLE_BASE}${
      '='.repeat(separatorLength)
    }${RESET}\n`
    return `${titleLine + separatorLine}${STYLE_BASE}\n${RESET}`
  }

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
  ]

  function getPalmTreeLines(): string[] {
    return dedent`
      ${colors.green('      🌿🌿')}
      ${colors.green('     🌿🌿🌿')}
      ${colors.green('     🌿🌿🌿')}
      ${colors.green('     🌿🌿🌿')}
      ${colors.brightYellow('       ||')}
      ${colors.brightYellow('       ||')}
      ${colors.brightYellow('       ||')}
    `.trim().split('\n')
  }

  const PALM_TREE = getPalmTreeLines().join('\n')
  const PALM_TREE_LINES = PALM_TREE.trim().split('\n')
  const MIN_TREE_AREA_HEIGHT = 9 // 🤖 Minimum height to ensure dinosaur fits
  const TREE_AREA_HEIGHT = Math.max(
    PALM_TREE_LINES.length,
    MIN_TREE_AREA_HEIGHT,
  )
  const SCENE_HEIGHT = 2 + TREE_AREA_HEIGHT + 1

  // Render sky with moving clouds
  function renderSky(step: number) {
    const cloudSpeed = 0.8
    const cloudOffset = Math.floor(step * cloudSpeed)
    const positions = [
      (cloudOffset + Math.floor(SCENE_WIDTH * 0.30)) % SCENE_WIDTH,
      (cloudOffset + Math.floor(SCENE_WIDTH * 0.09)) % SCENE_WIDTH,
    ]
    const skyLine = ' '.repeat(SCENE_WIDTH)
    let topSky = skyLine
    let bottomSky = skyLine

    positions.forEach((pos, i) => {
      const cluster = CLOUD_CLUSTERS[i % CLOUD_CLUSTERS.length]
      const topLen = Math.min(cluster.top.length, 10)
      const bottomLen = Math.min(cluster.bottom.length, 10)
      const maxLen = Math.max(topLen, bottomLen)

      // Ensure cloud fits completely within scene bounds
      if (pos >= 0 && pos + maxLen <= SCENE_WIDTH) {
        topSky = topSky.substring(0, pos) +
          cluster.top.substring(0, topLen) +
          topSky.substring(pos + topLen)
        bottomSky = bottomSky.substring(0, pos) +
          cluster.bottom.substring(0, bottomLen) +
          bottomSky.substring(pos + bottomLen)
      }
    })

    return [topSky, bottomSky]
  }

  // Process dinosaur art frames - no need to normalize since arrays are pre-formatted
  function processArt(artFrameLines: string[]): string[] {
    if (artFrameLines.length === 0) return []

    const nonEmptyContentLines = artFrameLines.filter((line) =>
      line.trim().length > 0
    )
    if (nonEmptyContentLines.length === 0) {
      // If all lines are whitespace or the frame is empty, return them as empty strings
      // to maintain the line count for structure.
      return artFrameLines.map(() => '')
    }

    // Find the minimum indent from lines that actually have content.
    // IMPORTANT: Do not use `line.search(/\S/)` if line could be all whitespace,
    // as it returns -1, and Math.min(-1, N) is -1, leading to errors.
    const minIndent = Math.min(
      ...nonEmptyContentLines.map((line) => {
        const indent = line.search(/\S/)
        // This should not be -1 because we filtered for non-empty trimmed lines
        return indent
      }),
    )

    return artFrameLines.map((line) => {
      // If a line is all whitespace, return an empty string.
      if (line.trim().length === 0) return ''
      // Otherwise, remove the common minimum indent.
      // Ensure substring doesn't go out of bounds if a line is shorter than minIndent
      // (though this shouldn't happen for content lines due to how minIndent is calculated).
      return line.substring(minIndent)
    })
  }

  // Render dinosaur within tree
  function renderTreeWithDino(
    treeLines: string[],
    artLines: string[],
    position: number,
    dustIndex: number,
  ) {
    const scene: string[] = []
    const dinoStart = 2 // 🤖 Fixed position ensuring dinosaur has space to render

    for (let i = 0; i < TREE_AREA_HEIGHT; i++) {
      const treeSeg = i < treeLines.length ? treeLines[i] : ''
      const dinoIdx = i - dinoStart

      if (dinoIdx >= 0 && dinoIdx < artLines.length) {
        // 🤖 Dinosaur line - add positioning and combine with tree segment
        const dinoLine = artLines[dinoIdx] || ''
        const totalPosition = RESPONSIVE_DINO_START_OFFSET + position
        const positionedDino = ' '.repeat(totalPosition) + dinoLine
        let line = `${treeSeg}  ${colors.purple(positionedDino)}`

        // 🤖 Add dust to the last line of dinosaur (feet)
        if (
          dinoIdx === artLines.length - 1 &&
          dustIndex >= 0 &&
          dustIndex < SETTINGS.DUST_PATTERNS.length
        ) {
          line += ` ${SETTINGS.DUST_PATTERNS[dustIndex].join('')}`
        }
        scene.push(line)
      } else {
        // 🤖 Non-dinosaur line - just tree segment
        scene.push(treeSeg)
      }
    }
    return scene
  }

  // Build full scene
  function buildScene(
    position: number,
    frameIdx: number,
    dustIndex: number,
    step: number,
  ) {
    const scene: string[] = []
    const [topSky, bottomSky] = renderSky(step)
    scene.push(topSky)
    scene.push(bottomSky)

    const artLines = processArt(DINO_FRAMES[frameIdx])
    const treeDinoLines = renderTreeWithDino(
      PALM_TREE_LINES,
      artLines,
      position,
      dustIndex,
    )
    scene.push(...treeDinoLines)
    const grassLength = Math.min(30, Math.floor(SCENE_WIDTH / 2.3))
    scene.push(colors.green('🌱'.repeat(grassLength)))

    // Ensure no line exceeds scene width by truncating visible content
    const safeLinesScene = scene.map((line) => {
      let visibleLength = 0
      let result = ''

      for (let i = 0; i < line.length; i++) {
        const char = line.charCodeAt(i)

        if (char === 27) { // ESC character starts ANSI sequence
          // Copy entire ANSI sequence
          result += line[i] // Add ESC
          i++
          while (i < line.length && line[i] !== 'm') {
            result += line[i]
            i++
          }
          if (i < line.length) {
            result += line[i] // Add 'm'
          }
        } else {
          // Regular character
          if (visibleLength >= SCENE_WIDTH) break
          result += line[i]
          visibleLength++
        }
      }

      return result
    })

    return safeLinesScene.join('\n')
  }

  Deno.stdout.writeSync(
    encoder.encode(HEADER(version)),
  )
  Deno.stdout.writeSync(
    encoder.encode(`${buildScene(0, 0, -1, 0)}\n`),
  )

  const totalSteps = RESPONSIVE_WALK_DISTANCE / SETTINGS.STEPS_PER_FRAME

  for (let step = 1; step <= totalSteps; step++) {
    const pos = Math.min(
      step * SETTINGS.STEPS_PER_FRAME,
      RESPONSIVE_WALK_DISTANCE,
    )
    const frameIdx = (step - 1) % DINO_FRAMES.length
    const dustIndex = step % 2 === 0 ? step % SETTINGS.DUST_PATTERNS.length : -1

    Deno.stdout.writeSync(
      encoder.encode(`\x1b[${SCENE_HEIGHT}A`),
    )
    for (let i = 0; i < SCENE_HEIGHT; i++) {
      Deno.stdout.writeSync(encoder.encode('\x1b[2K'))
      if (i < SCENE_HEIGHT - 1) {
        Deno.stdout.writeSync(encoder.encode('\x1b[1B'))
      }
    }
    Deno.stdout.writeSync(
      encoder.encode(`\x1b[${SCENE_HEIGHT - 1}A`),
    )

    Deno.stdout.writeSync(
      encoder.encode(
        `${
          STYLE_BASE +
          buildScene(pos, frameIdx, dustIndex, step) +
          RESET
        }\n`,
      ),
    )
    await new Promise((r) => setTimeout(r, SETTINGS.ANIMATION_SPEED_MS))
  }

  const finalPos = RESPONSIVE_WALK_DISTANCE
  for (let cycle = 0; cycle < SETTINGS.EYE_CYCLES; cycle++) {
    for (const star of SETTINGS.EYE_STARS) {
      await new Promise((r) => setTimeout(r, SETTINGS.ANIMATION_SPEED_MS * 1.2))
      Deno.stdout.writeSync(
        encoder.encode(`\x1b[${SCENE_HEIGHT}A`),
      )
      for (let i = 0; i < SCENE_HEIGHT; i++) {
        Deno.stdout.writeSync(encoder.encode('\x1b[2K'))
        if (i < SCENE_HEIGHT - 1) {
          Deno.stdout.writeSync(encoder.encode('\x1b[1B'))
        }
      }
      Deno.stdout.writeSync(
        encoder.encode(`\x1b[${SCENE_HEIGHT - 1}A`),
      )

      const eyeArtLines = [
        '                   _',
        `                 / ${colors.red(colors.bold(star))})`,
        '          _.----._/ /',
        '         /         /',
        '      __/  ( |  ( |',
        "              /__.-'|_|--|_|",
      ]
      const artLines = processArt(eyeArtLines)
      const scene: string[] = []
      const [topSky, bottomSky] = renderSky(
        totalSteps +
          cycle * SETTINGS.EYE_STARS.length +
          SETTINGS.EYE_STARS.indexOf(star),
      )
      scene.push(topSky)
      scene.push(bottomSky)
      scene.push(
        ...renderTreeWithDino(
          PALM_TREE_LINES,
          artLines,
          finalPos,
          -1,
        ),
      )
      const grassLength = Math.min(30, Math.floor(SCENE_WIDTH / 2.3))
      scene.push(colors.green('🌱'.repeat(grassLength)))

      // Apply same width safety to eye animation
      const safeEyeScene = scene.map((line) => {
        let visibleLength = 0
        let result = ''

        for (let i = 0; i < line.length; i++) {
          const char = line.charCodeAt(i)

          if (char === 27) { // ESC character starts ANSI sequence
            // Copy entire ANSI sequence
            result += line[i] // Add ESC
            i++
            while (i < line.length && line[i] !== 'm') {
              result += line[i]
              i++
            }
            if (i < line.length) {
              result += line[i] // Add 'm'
            }
          } else {
            // Regular character
            if (visibleLength >= SCENE_WIDTH) break
            result += line[i]
            visibleLength++
          }
        }

        return result
      })

      Deno.stdout.writeSync(
        encoder.encode(
          `${STYLE_BASE + safeEyeScene.join('\n') + RESET}\n`,
        ),
      )
    }
  }

  // Ensure terminal is ready for user input
  Deno.stdout.writeSync(encoder.encode('\n')) // Add clean newline for cursor
  Deno.stdout.writeSync(encoder.encode(RESET)) // Reset all formatting
  Deno.stdout.writeSync(encoder.encode('\x1b[?25h')) // Show cursor
}
