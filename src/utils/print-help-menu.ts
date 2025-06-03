/**
 * @module print-help-menu
 */
import { bold, dim, green } from '@std/fmt/colors'
import terminal from './terminal.ts'

function printHelpMenu(config: {
  workspace?: { text: string }
  title?: { text: string }
  usage?: { text: string }
  section?: { text: string }
  command?: { command: string; description: string; padding: number }
  note?: { text: string }
}): void {
  if (config.title) {
    terminal.print(`\n${bold(config.title.text)}`)
  }
  if (config.usage) {
    terminal.print(`${dim(config.usage.text)}`)
  }
  if (config.section) {
    terminal.print(`\n${bold(config.section.text)}`)
  }
  if (config.command) {
    const { command, description, padding } = config.command
    const paddingSpaces = ' '.repeat(padding - command.length + 2)
    terminal.print(
      `  ${bold(green(command))}${paddingSpaces}${dim(description)}`,
    )
  }
  if (config.workspace) {
    terminal.print(`\n${bold(`Workspace: ${dim(config.workspace.text)}`)}`)
  }
  if (config.note) {
    terminal.print(`\n${dim(config.note.text)}`)
  }
}
export { printHelpMenu }
export default printHelpMenu
