#!/usr/bin/env -S deno run -A
import { type Args, parseArgs } from '@std/cli'
import type { CommandDefinition, CommandOptions } from '../types.ts'
import printHelpMenu from '../utils/print-help-menu.ts'
import loadConfig from '../config.ts'

const config = await loadConfig()
const CLI_NAME = 'Deno-Kit'

const commandDefinition: CommandDefinition = {
  name: 'help',
  command: displayHelp,
  description: 'Display this help message',
}

function displayHelp({ routes = [] }: CommandOptions): void {
  const formattedCliName = CLI_NAME.split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

  const maxCommandLength = Math.max(...routes.map((cmd) => cmd.name.length))

  printHelpMenu({
    title: { text: `${formattedCliName} - Usage:` },
    usage: { text: '  kit <command> [options]' },
    section: { text: 'Commands:' },
  })

  for (const config of routes) {
    printHelpMenu({
      command: {
        command: config.name,
        description: config.description,
        padding: maxCommandLength,
      },
    })
  }

  printHelpMenu({
    note: { text: `If no command is provided, the "help" command will be executed.` },
    workspace: { text: config.workspace },
  })
}

if (import.meta.main) {
  const args: Args = parseArgs(Deno.args, commandDefinition.options)
  await commandDefinition.command({ args, routes: [commandDefinition] })
}

export default commandDefinition
