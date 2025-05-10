#!/usr/bin/env -S deno run -A
/**
 * IMPORTANT: This file is a template for creating new commands.
 * It is not a real command and will not be executed.
 *
 * To create a new command, copy this file and rename it to the desired name.
 * Then, implement the command logic in the `command` function.
 */
import { type Args, parseArgs } from '@std/cli'
import logger from '../utils/logger.ts'
import loadConfig from '../config.ts'
import type { CommandRouteDefinition, CommandRouteOptions } from '../utils/command-router.ts'

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

function command({ args, routes }: CommandRouteOptions): Promise<void> {
  logger.debug(`Command ${commandRoute.name} executed in environment ${config.DENO_KIT_ENV}`, {
    args,
    config,
    routes,
  })

  return Promise.resolve()
}

if (import.meta.main) {
  const args: Args = parseArgs(Deno.args, commandRoute.options)
  await commandRoute.command({ args, routes: [commandRoute] })
}
export default commandRoute
