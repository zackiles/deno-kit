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

class Logger {
  private config: LoggerConfig

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  setConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config }
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
      console.debug(`${this.formatTimestamp()}${formattedName} ${dim(msg)}`, ...args)
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
