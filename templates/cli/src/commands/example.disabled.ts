#!/usr/bin/env -S deno run -A
import { type Args, parseArgs } from '@std/cli'
import type { CommandDefinition, CommandOptions } from '../types.ts'
import logger from '../utils/logger.ts'
import loadConfig from '../config.ts'

const commandDefinition: CommandDefinition = {
  name: 'example',
  command: command,
  description: 'An example command template',
  options: {
    boolean: ['flag'],
    alias: { f: 'flag' },
  },
}

async function command({ args, routes }: CommandOptions): Promise<void> {
  const config = await loadConfig()
  logger.print(`Command ${commandDefinition.name} executed`, {
    args,
    config,
    routes,
  })
}

if (import.meta.main) {
  const args: Args = parseArgs(Deno.args, commandDefinition.options)
  await commandDefinition.command({ args, routes: [commandDefinition] })
}
export default commandDefinition
