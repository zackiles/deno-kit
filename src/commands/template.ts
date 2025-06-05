/**
 * IMPORTANT: This file is a template for creating new commands.
 * It is not a real command and will not be executed.
 *
 * To create a new command, copy this file and rename it to the desired name.
 * Then, implement the command logic in the `command` function.
 */
import terminal from '../terminal/mod.ts'
import { getConfig } from '../config.ts'
import type {
  CommandRouteDefinition,
  CommandRouteOptions,
} from '../utils/command-router.ts'
import type { DenoKitConfig } from '../types.ts'

const config = await getConfig() as DenoKitConfig

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
  terminal.debug(
    `Command ${commandRoute.name} executed in environment ${config.DENO_KIT_ENV}`,
    {
      args,
      config,
      routes,
    },
  )

  return Promise.resolve()
}

export default commandRoute
