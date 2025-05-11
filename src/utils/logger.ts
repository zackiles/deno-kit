/**
 * @module logger
 * @description Logger with support for log levels, timestamps, and configurable output.
 */

import { blue, bold, dim, green, red, yellow } from '@std/fmt/colors'

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

export interface LoggerConfig {
  level: LogLevel
  colors: boolean
  timestamp: boolean
  name: string
}

const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  colors: true,
  timestamp: false,
  name: 'deno-kit',
}

/**
 * Parses a string log level to the corresponding LogLevel enum value
 *
 * @param level The log level as a string (case-insensitive)
 * @returns The corresponding LogLevel enum value, defaults to INFO if invalid
 */
export function parseLogLevel(level: string | undefined): LogLevel {
  if (!level) return LogLevel.INFO

  switch (level.toUpperCase()) {
    case 'DEBUG':
      return LogLevel.DEBUG
    case 'INFO':
      return LogLevel.INFO
    case 'WARN':
      return LogLevel.WARN
    case 'ERROR':
      return LogLevel.ERROR
    case 'SILENT':
      return LogLevel.SILENT
    default: {
      // Try to parse as number if not a recognized string
      const numLevel = Number.parseInt(level, 10)
      if (!Number.isNaN(numLevel) && numLevel >= 0 && numLevel <= 4) {
        return numLevel
      }
      return LogLevel.INFO // INFO as default
    }
  }
}

class Logger {
  private config: LoggerConfig

  constructor(config: Partial<LoggerConfig> = {}) {
    // Apply default config with provided overrides
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    }
  }

  setConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Sets the log level from a string or enum value
   */
  setLogLevel(level: string | LogLevel): void {
    if (typeof level === 'string') {
      this.config.level = parseLogLevel(level)
    } else {
      this.config.level = level
    }
  }

  /**
   * Gets the current log level as a number
   */
  getLogLevel(): LogLevel {
    return this.config.level
  }

  print(msg: string, ...args: unknown[]): void {
    console.log(msg, ...args)
  }

  log(msg: string, ...args: unknown[]): void {
    if (this.config.level <= LogLevel.INFO) {
      const formattedName = this.formatName(green)
      console.log(`${this.formatTimestamp()}${formattedName} ${msg}`, ...args)
    }
  }

  info(msg: string, ...args: unknown[]): void {
    if (this.config.level <= LogLevel.INFO) {
      const formattedName = this.formatName(blue)
      console.log(`${this.formatTimestamp()}${formattedName} ${msg}`, ...args)
    }
  }

  error(msg: string, ...args: unknown[]): void {
    if (this.config.level <= LogLevel.ERROR) {
      const formattedName = this.formatName(red)
      console.error(`${this.formatTimestamp()}${formattedName} ${msg}`, ...args)
    }
  }

  debug(msg: string, ...args: unknown[]): void {
    if (this.config.level <= LogLevel.DEBUG) {
      const formattedName = this.formatName(dim)
      console.debug(`DEBUG:${this.formatTimestamp()}${formattedName} ${dim(msg)}`, ...args)
    }
  }

  warn(msg: string, ...args: unknown[]): void {
    if (this.config.level <= LogLevel.WARN) {
      const formattedName = this.formatName(yellow)
      console.warn(`${this.formatTimestamp()}${formattedName} ${msg}`, ...args)
    }
  }

  private formatTimestamp(): string {
    return this.config.timestamp ? `[${Temporal.Now.instant().toString()}]` : ''
  }

  private formatName(colorFn?: (s: string) => string, suffix = ''): string {
    const name = `[${this.config.name}]${suffix}`
    return this.config.colors && colorFn ? bold(colorFn(name)) : name
  }
}

// Create singleton logger instance
export const logger = new Logger()

export default logger
