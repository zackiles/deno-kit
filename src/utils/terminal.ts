/**
 * @module terminal
 * @description Logging, formatting, and colors for terminals.
 */

import * as stdColors from '@std/fmt/colors'

const encoder = new TextEncoder()
const RESET = '\x1b[0m'
const STYLE_BASE = '\x1b[0m\x1b[38;2;255;255;255m'
const CLEAR_SCREEN = '\x1b[0m\x1b[2J\x1b[3J\x1b[H'

const colors = {
  ...stdColors,
  ...{
    // Create extended colors object (overrides std colors)
    purple: (text: string) => stdColors.rgb24(text, { r: 125, g: 99, b: 202 }),
  },
} as const

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
  colors: true,
  timestamp: false,
  name: 'deno-kit',
  inspect: {
    depth: 4,
    showHidden: false,
    colors: false, // IMPORTANT: We'll handle colors ourselves
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

  constructor(config: Partial<TerminalConfig> = {}) {
    this.#config = {
      ...DEFAULT_LOGGER_CONFIG,
      ...config,
    }
    // IMPORTANT: To be used one time on CLI startup to clear the screen and reset the style
    this.start()
  }

  start(): void {
    Deno.stdout.writeSync(encoder.encode(`${CLEAR_SCREEN}${STYLE_BASE}`))
  }

  stop(): void {
    Deno.stdout.writeSync(encoder.encode(`${RESET}\n`))
  }

  setConfig(config: Partial<TerminalConfig>): void {
    this.#config = {
      ...this.#config,
      ...config,
      inspect: {
        ...this.#config.inspect,
        ...config.inspect,
      },
    }
  }

  setInspectOptions(options: Partial<InspectOptions>): void {
    this.#config.inspect = { ...this.#config.inspect, ...options }
  }

  getInspectOptions(): InspectOptions {
    return this.#config.inspect
  }

  getLogLevel(): LogLevelEnum {
    return this.#config.level
  }

  setLogLevel(level: LogLevelEnum | LogLevel): void {
    this.#config.level = parseLogLevel(level)
  }

  formatTimestamp(): string {
    return this.#config.timestamp
      ? `[${Temporal.Now.instant().toString()}]`
      : ''
  }

  formatName(colorFn?: (s: string) => string, suffix = ''): string {
    const name = `[${this.#config.name}]${suffix}`
    return this.#config.colors && colorFn ? colors.bold(colorFn(name)) : name
  }

  clear(): void {
    this.print(`${CLEAR_SCREEN}${STYLE_BASE}`)
  }

  info(msg: string, ...args: unknown[]): void {
    if (this.#config.level <= LogLevelEnum.INFO) {
      const formattedName = this.formatName(colors.blue)
      console.log(
        `${
          colors.cyan(colors.bold('INFO'))
        }${this.formatTimestamp()}${formattedName} ${msg}`,
        ...args,
      )
    }
  }

  error(msg: string, ...args: unknown[]): void {
    if (this.#config.level <= LogLevelEnum.ERROR) {
      const formattedName = this.formatName(colors.red)
      console.error(`${this.formatTimestamp()}${formattedName} ${msg}`, ...args)
    }
  }

  debug(msg: string, ...args: unknown[]): void {
    if (this.#config.level <= LogLevelEnum.DEBUG) {
      const formattedName = this.formatName(colors.dim)
      const dimmedArgs = args.map((arg) => {
        if (typeof arg === 'string') {
          return colors.dim(arg)
        } else {
          const inspected = Deno.inspect(arg, this.#config.inspect)
          return colors.dim(inspected)
        }
      })
      this.print(
        `${
          colors.dim(colors.bold(`DEBUG | ENV:${this.#config.environment}]`))
        }:${this.formatTimestamp()}${formattedName} ${colors.dim(msg)}`,
        ...dimmedArgs,
      )
    }
  }

  // TODO: Implement Otel trace logging
  trace(msg: string, ...args: unknown[]): void {
    this.debug(msg, ...args)
  }

  warn(msg: string, ...args: unknown[]): void {
    if (this.#config.level <= LogLevelEnum.WARN) {
      const formattedName = this.formatName(colors.yellow)
      console.warn(`${this.formatTimestamp()}${formattedName} ${msg}`, ...args)
    }
  }

  log(msg: string, ...args: unknown[]): void {
    if (this.#config.level <= LogLevelEnum.INFO) {
      const formattedName = this.formatName(colors.green)
      console.log(`${this.formatTimestamp()}${formattedName} ${msg}`, ...args)
    }
  }

  print(msg: string, ...args: unknown[]): void {
    const output = args.length > 0
      ? [msg, ...args].map(String).join(' ')
      : String(msg)
    Deno.stdout.writeSync(encoder.encode(`${STYLE_BASE}${output}${RESET}\n`))
  }
}

// NOTE: Intentional multiple calling conventions by consumers of this module
const terminalWithColors = new Terminal()
type TerminalWithColors = Terminal & typeof colors
const terminal: TerminalWithColors = Object.assign(terminalWithColors, colors)

export * from '@std/fmt/colors'
export const purple = colors.purple

export { colors, LogLevelEnum, Terminal, terminal }
export type { InspectOptions, LogLevel, TerminalConfig, TerminalWithColors }

export default terminal
