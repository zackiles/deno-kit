#!/usr/bin/env -S deno run -A
import { type Args, parseArgs } from '@std/cli'
import type { CommandDefinition, CommandOptions } from '../types.ts'
import logger from '../utils/logger.ts'

const commandDefinition: CommandDefinition = {
  name: 'help',
  command: command,
  description: 'Display help menu'
}

async function command({ routes }: CommandOptions): Promise<void> {
  logger.print(`{{PACKAGE_NAME}} - {{PACKAGE_DESCRIPTION}}

Usage:
  {{PROJECT_NAME}} [command] [options]

Commands:
${routes.map((cmd) => `  ${cmd.name.padEnd(10)} ${cmd.description}`).join('\n')}`)
}

if (import.meta.main) {
  const args: Args = parseArgs(Deno.args)
  await commandDefinition.command({ args, routes: [commandDefinition] })
}

export default commandDefinition
