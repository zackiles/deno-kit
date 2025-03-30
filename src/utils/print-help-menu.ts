import { bold, dim, green } from '@std/fmt/colors'
import logger from './logger.ts'

function printHelpMenu(config: {
  title?: { text: string }
  usage?: { text: string }
  section?: { text: string }
  command?: { command: string; description: string; padding: number }
  note?: { text: string }
}): void {
  if (config.title) {
    logger.print(`\n${bold(config.title.text)}`)
  }
  if (config.usage) {
    logger.print(`${dim(config.usage.text)}`)
  }
  if (config.section) {
    logger.print(`\n${bold(config.section.text)}`)
  }
  if (config.command) {
    const { command, description, padding } = config.command
    const paddingSpaces = ' '.repeat(padding - command.length + 2)
    logger.print(`  ${bold(green(command))}${paddingSpaces}${dim(description)}`)
  }
  if (config.note) {
    logger.print(`\n${dim(config.note.text)}`)
  }
}
export { printHelpMenu }
export default printHelpMenu
