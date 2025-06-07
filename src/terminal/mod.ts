/**
 * @module terminal
 * @description Logging, formatting, and colors for terminals.
 */

//import * as stdColors from '@std/fmt/colors'
import * as stdText from '@std/text/unstable-dedent'
import { unicodeWidth } from '@std/cli'
import { printBanner as printBannerImpl } from './banner.ts'
import palette from './palette.ts'
import { ANSI_CODES, RESET_SEQUENCE } from './constants.ts'
const colors = palette

const encoder = new TextEncoder()
const RESET = RESET_SEQUENCE
const STYLE_BASE = ANSI_CODES.STYLE_BASE
const CLEAR_SCREEN = ANSI_CODES.CLEAR_SCREEN_FULL

enum LogLevelEnum {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

type LogLevel =
  | LogLevelEnum
  | keyof typeof LogLevelEnum
  | Lowercase<keyof typeof LogLevelEnum>

interface InspectOptions {
  /** Traversal depth for nested objects */
  depth?: number
  /** Show an object's non-enumerable properties */
  showHidden?: boolean
  /** Stylize output with ANSI colors */
  colors?: boolean
  /** Show a Proxy's target and handler */
  showProxy?: boolean
  /** The maximum number of iterable entries to print */
  iterableLimit?: number
  /** The maximum length of a string before it is truncated with an ellipsis */
  strAbbreviateSize?: number
  /** The maximum length for an inspection to take up a single line */
  breakLength?: number
  /** Try to fit more than one entry of a collection on the same line */
  compact?: boolean
  /** Sort Object, Set and Map entries by key */
  sorted?: boolean
  /** Evaluate the result of calling getters */
  getters?: boolean
  /** Whether or not to escape sequences */
  escapeSequences?: boolean
  /** Add a trailing comma for multiline collections */
  trailingComma?: boolean
}

interface TerminalConfig {
  level: LogLevelEnum
  colors: boolean
  timestamp: boolean
  name: string
  inspect: InspectOptions
  global?: boolean
  environment:
    | 'development'
    | 'production'
    | 'test'
    | 'staging'
    | 'local'
    | 'ci'
    | undefined
}

const DEFAULT_LOGGER_CONFIG: TerminalConfig = {
  level: LogLevelEnum.INFO,
  colors: !Deno.noColor,
  timestamp: false,
  name: 'deno-kit',
  global: false,
  inspect: {
    depth: 4,
    showHidden: false,
    colors: !Deno.noColor,
    showProxy: false,
    iterableLimit: 100,
    strAbbreviateSize: 10000,
    breakLength: 80,
    compact: true,
    sorted: false,
    getters: false,
    escapeSequences: true,
    trailingComma: false,
  },
  environment: undefined,
}

/**
 * Parses a log level input to the corresponding LogLevel enum value
 *
 * @param level The log level as LogLevelInput (string, number, or LogLevel)
 * @returns The corresponding LogLevel enum value, defaults to INFO if invalid
 */
export function parseLogLevel(level: LogLevel | undefined): LogLevelEnum {
  if (level === undefined) return LogLevelEnum.INFO
  if (typeof level === 'number') return level

  const upperLevel = level.toString().toUpperCase() as keyof typeof LogLevelEnum
  return LogLevelEnum[upperLevel] ?? LogLevelEnum.INFO
}

class Terminal {
  #config: TerminalConfig
  #originalConsole: Console | undefined
  started = false

  isRaw = true

  constructor(config: Partial<TerminalConfig> = {}) {
    this.#config = {
      ...DEFAULT_LOGGER_CONFIG,
      ...config,
      // Ensure inspect options are merged deeply if provided in config
      inspect: {
        ...DEFAULT_LOGGER_CONFIG.inspect,
        ...(config.inspect || {}),
      },
    }
    // IMPORTANT: To be used one time on CLI startup to clear the screen and reset the style
    this.start()
  }

  start(): void {
    if (this.started) return
    const clearCode = this.#config.colors ? CLEAR_SCREEN : ''
    const styleCode = this.#config.colors ? STYLE_BASE : ''
    colors.setColorEnabled(this.#config.colors)
    Deno.stdout.writeSync(encoder.encode(`${clearCode}${styleCode}`))
    if (this.#config.level === LogLevelEnum.DEBUG) {
      const envText = this.#config.environment || 'unknown'
      const onText = this.#config.colors ? colors.green('ON') : 'ON'
      const envDisplay = this.#config.colors ? colors.green(envText) : envText
      this.print(
        `DEBUG: ${onText}. [ENV: ${envDisplay}]`,
      )
    }

    // Override global console methods if global flag is true
    if (this.#config.global) {
      this.#originalConsole = globalThis.console
      // deno-lint-ignore no-this-alias
      const terminal = this
      globalThis.console = new Proxy(globalThis.console, {
        get(target, prop) {
          if (prop === 'log') terminal.log.bind(terminal)
          if (prop === 'info') return terminal.info.bind(terminal)
          if (prop === 'error') return terminal.error.bind(terminal)
          if (prop === 'debug') return terminal.debug.bind(terminal)
          if (prop === 'warn') return terminal.warn.bind(terminal)
          if (prop === 'trace') return terminal.warn.bind(terminal)
          if (prop === 'clear') return terminal.clear.bind(terminal)
          return target[prop as keyof typeof target]
        },
      })
    }
    this.started = true
  }

  stop(): void {
    this.started = false
    // Restore original console if we overrode it
    if (this.#config.global && this.#originalConsole) {
      globalThis.console = this.#originalConsole
      this.#originalConsole = undefined
    }
    // Use simple style reset for shutdown instead of aggressive screen clear
    Deno.stdout.writeSync(encoder.encode(ANSI_CODES.STYLE_RESET))
  }

  setConfig(config: Partial<TerminalConfig>): void {
    if (config.environment) {
      // IMPORTANT: Must set environment before setting the log level
      this.#config.environment = config.environment
    }
    if (config.level) {
      this.setLevel(config.level)
    }
    if (typeof config.colors === 'boolean') {
      this.#config.colors = config.colors
      colors.setColorEnabled(true)
      // Update inspect colors to match unless explicitly provided
      if (config.inspect === undefined || config.inspect.colors === undefined) {
        this.#config.inspect.colors = config.colors
      }
    }
    if (config.inspect) {
      this.setInspectOptions(config.inspect)
    }
    if (typeof config.timestamp === 'boolean') {
      this.#config.timestamp = config.timestamp
    }
    if (config.name) {
      this.#config.name = config.name
    }
  }

  setInspectOptions(options: Partial<InspectOptions>): void {
    this.#config.inspect = { ...this.#config.inspect, ...options }
  }

  getInspectOptions(): InspectOptions {
    return this.#config.inspect
  }

  getLevel(): LogLevelEnum {
    return this.#config.level
  }

  setLevel(level: LogLevelEnum | LogLevel): void {
    this.#config.level = parseLogLevel(level)
    if (this.#config.level === LogLevelEnum.DEBUG) {
      this.#config.timestamp = true
      const envText = this.#config.environment || 'unknown'
      const onText = this.#config.colors ? colors.green('ON') : 'ON'
      const envDisplay = this.#config.colors ? colors.green(envText) : envText
      this.print(
        `DEBUG: ${onText}. [ENV: ${envDisplay}]`,
      )
    }
  }

  formatTimestamp(): string {
    return this.#config.timestamp ? `${Temporal.Now.instant().toString()}` : ''
  }

  formatName(colorFn?: (s: string) => string, suffix = ''): string {
    const name = `[${this.#config.name}]${suffix}`
    return this.#config.colors && colorFn ? colors.bold(colorFn(name)) : name
  }
  getSize(): { width: number; height: number } {
    return {
      width: Deno.consoleSize().columns,
      height: Deno.consoleSize().rows,
    }
  }

  getCharacterWidth(text: string): number {
    return unicodeWidth(colors.stripAnsiCode(text))
  }

  clear(): void {
    const clearCode = this.#config.colors ? CLEAR_SCREEN : ''
    const styleCode = this.#config.colors ? STYLE_BASE : ''
    this.print(`${clearCode}${styleCode}`)
  }

  info(msg: string, ...args: unknown[]): void {
    if (this.#config.level <= LogLevelEnum.INFO) {
      const formattedName = this.formatName(
        this.#config.colors ? colors.blue : undefined,
      )
      const prefix = this.#config.colors
        ? colors.cyan(colors.bold('INFO'))
        : 'INFO'
      console.log(
        `${prefix}${this.formatTimestamp()}${formattedName} ${msg}`,
        ...args,
      )
    }
  }

  error(msg: string, ...args: unknown[]): void {
    if (this.#config.level <= LogLevelEnum.ERROR) {
      const formattedName = this.formatName(
        this.#config.colors ? colors.red : undefined,
      )
      console.error(`${this.formatTimestamp()}${formattedName} ${msg}`, ...args)
    }
  }

  debug(msg: string, ...args: unknown[]): void {
    if (this.#config.level <= LogLevelEnum.DEBUG) {
      const formattedName = this.formatName(
        this.#config.colors ? colors.dim : undefined,
      )
      const dimmedArgs = args.map((arg) => {
        if (typeof arg === 'string') {
          return this.#config.colors ? colors.dim(arg) : arg
        } else {
          const inspected = Deno.inspect(arg, {
            ...this.#config.inspect,
            colors: this.#config.colors,
          })
          return this.#config.colors ? colors.dim(inspected) : inspected
        }
      })

      const finalMsg = this.#config.colors ? colors.dim(msg) : msg
      const finalTs = this.#config.colors
        ? colors.dim(this.formatTimestamp())
        : this.formatTimestamp()

      const stylePrefix = this.#config.colors ? STYLE_BASE : ''
      const output = [
        `${stylePrefix}${finalTs} : ${formattedName} ${finalMsg}`,
        ...dimmedArgs,
      ].join('\n')

      Deno.stdout.writeSync(encoder.encode(`${output}${RESET}\n`))
    }
  }

  // TODO: Implement Otel trace logging
  trace(msg: string, ...args: unknown[]): void {
    this.debug(msg, ...args)
  }

  warn(msg: string, ...args: unknown[]): void {
    if (this.#config.level <= LogLevelEnum.WARN) {
      const formattedName = this.formatName(
        this.#config.colors ? colors.yellow : undefined,
      )
      const prefix = this.#config.colors
        ? colors.yellow(colors.bold('WARN'))
        : 'WARN'
      console.warn(
        `${prefix}${this.formatTimestamp()}${formattedName} ${msg}`,
        ...args,
      )
    }
  }

  log(msg: string, ...args: unknown[]): void {
    if (this.#config.level <= LogLevelEnum.INFO) {
      const formattedName = this.formatName(
        this.#config.colors ? colors.green : undefined,
      )
      console.log(`${this.formatTimestamp()}${formattedName} ${msg}`, ...args)
    }
  }

  print(msg: string, ...args: unknown[]): void {
    const output = args.length > 0
      ? [msg, ...args].map(String).join(' ')
      : String(msg)
    const stylePrefix = this.#config.colors ? STYLE_BASE : ''
    const simpleReset = '\x1b[0m'
    Deno.stdout.writeSync(
      encoder.encode(`${stylePrefix}${output}${simpleReset}\n`),
    )
  }

  async write(msg: string): Promise<void> {
    await Deno.stdout.write(encoder.encode(msg))
  }

  /**
   * Set terminal raw mode for input capture
   * @param mode - Whether to enable or disable raw mode
   */
  setRaw(mode: boolean, options?: Deno.SetRawOptions): void {
    if (Deno.stdin.isTerminal()) {
      Deno.stdin.setRaw(mode, options)
      this.isRaw = mode
    }
  }

  /**
   * Displays an animated banner featuring a walking dinosaur with spinning star eyes
   *
   * The animation consists of multiple phases:
   * 1. Environment setup: Palm tree and clouds appear
   * 2. Walking phase: Dinosaur walks across with dust particles from steps
   * 3. Eye phase: Red spinning stars appear in the dinosaur's eye socket
   *
   * @param version - The version string to display in the banner header
   *
   * @example
   * ```typescript
   * await terminal.printBanner("1.2.3")
   * ```
   *
   * Animation can be controlled by modifying these internal variables:
   * - `WALK_DISTANCE`: Controls how far the dinosaur travels
   * - `ANIMATION_SPEED_MS`: Controls animation speed in milliseconds
   */
  async printBanner({
    version = '0.0.0',
    rollup = false,
  }: {
    version?: string
    rollup?: boolean
  }) {
    if (!this.#config.colors) {
      const plainBanner = stdText.dedent(`
        =================================
        ${this.#config.name} - v${version}
        =================================`)
      this.print(plainBanner)
    } else {
      await printBannerImpl({
        version,
        colors: palette,
        rollup,
      })
    }
  }
}

// NOTE: Intentional multiple calling conventions by consumers of this module
const terminalWithColors = new Terminal()
type TerminalWithColors = Terminal & typeof palette & typeof stdText
const terminal: TerminalWithColors = Object.assign(
  terminalWithColors,
  palette,
  stdText,
)

export * from './gradient.ts'
export * from '@std/fmt/colors'
export * from '@std/text/unstable-dedent'
export * from './palette.ts'
export * from './keyboard.ts'
export * from './mouse.ts'
export * from './protocols.ts'
export * from './constants.ts'
export * from './terminal-cleanup.ts'
export * from './banner.ts'
export * from './prompts/prompt.ts'
export * from './debugger.ts'
//export * from './simple-prompt.ts'

const text = {
  ...stdText,
} as const

export { colors, LogLevelEnum, Terminal, terminal, text }
export const {
  purple,
  purpleGradient,
  green,
  greenGradient,
  red,
  redGradient,
  blue,
  blueGradient,
  whiteGradient,
  gradient,
} = palette

export type { InspectOptions, LogLevel, TerminalConfig, TerminalWithColors }

export default terminal
