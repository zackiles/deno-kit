/**
 * @module logger
 * @description Logger utility library.
 */

import { blue, bold, dim, green, red, yellow } from '@std/fmt/colors'
import loadConfig from '../config.ts'

const config = await loadConfig()

const logger = {
  print: (msg: string, ...args: unknown[]) => console.log(msg, ...args),
  log: (msg: string, ...args: unknown[]) =>
    console.log(`${bold(green('[{PACKAGE_NAME}]'))} ${msg}`, ...args),
  info: (msg: string, ...args: unknown[]) =>
    config.DENO_ENV === 'development' &&
    console.log(`${bold(blue('[{PACKAGE_NAME}]'))} ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) =>
    console.error(`${bold(red('[{PACKAGE_NAME}] ❌'))} ${msg}`, ...args),
  debug: (msg: string, ...args: unknown[]) =>
    config.DENO_ENV === 'development' &&
    console.debug(`${bold(dim('[{PACKAGE_NAME}]'))} ${dim(msg)}`, ...args),
  warn: (msg: string, ...args: unknown[]) =>
    config.DENO_ENV === 'development' &&
    console.warn(`${bold(yellow('[{PACKAGE_NAME}] ⚠'))} ${msg}`, ...args),
}

export default logger
