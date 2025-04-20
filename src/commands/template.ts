#!/usr/bin/env -S deno run -A
import { type Args, parseArgs } from '@std/cli'
import logger from '../utils/logger.ts'
import loadConfig from '../config.ts'
import type { CommandRouteDefinition, CommandRouteOptions } from '../utils/ command-router.ts'

const config = await loadConfig()

const commandRoute: CommandRouteDefinition = {
  name: 'template',
  command: command,
  description: 'An example command template',
  options: {
    boolean: ['flag'],
    alias: { f: 'flag' },
  },
}

async function command({ args, routes }: CommandRouteOptions): Promise<void> {
  logger.debug(`Command ${commandRoute.name} executed in environment ${config.DENO_ENV}`, {
    args,
    config,
    routes,
  })
}

if (import.meta.main) {
  const args: Args = parseArgs(Deno.args, commandRoute.options)
  await commandRoute.command({ args, routes: [commandRoute] })
}
export default commandRoute
