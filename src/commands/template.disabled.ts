#!/usr/bin/env -S deno run -A
import { type Args, parseArgs } from '@std/cli'
import logger from '../utils/logger.ts'
import loadConfig from '../config.ts'
import type { CommandDefinition, CommandOptions } from '../types.ts'

const config = await loadConfig()

const commandDefinition: CommandDefinition = {
  name: 'template',
  command: command,
  description: 'An example command template',
  options: {
    boolean: ['flag'],
    alias: { f: 'flag' },
  },
}

async function command({ args, routes }: CommandOptions): Promise<void> {
  logger.debug(`Command ${commandDefinition.name} executed in environment ${config.DENO_ENV}`, {
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
