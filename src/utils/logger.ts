import { blue, bold, dim, green, red, yellow } from '@std/fmt/colors'
const PACKAGE_NAME = 'deno-kit'
export default {
  print: (msg: string, ...args: unknown[]) => console.log(msg, ...args),
  log: (msg: string, ...args: unknown[]) =>
    console.log(`${bold(green(`[${PACKAGE_NAME}]`))} ${msg}`, ...args),
  info: (msg: string, ...args: unknown[]) =>
    console.log(`${bold(blue(`[${PACKAGE_NAME}]`))} ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) =>
    console.error(`${bold(red(`[${PACKAGE_NAME}] ❌`))} ${msg}`, ...args),
  debug: (msg: string, ...args: unknown[]) =>
    console.debug(`${bold(dim(`[${PACKAGE_NAME}]`))} ${dim(msg)}`, ...args),
  warn: (msg: string, ...args: unknown[]) =>
    console.warn(`${bold(yellow(`[${PACKAGE_NAME}] ⚠`))} ${msg}`, ...args),
}
