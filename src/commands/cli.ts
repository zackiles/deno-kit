#!/usr/bin/env -S deno run -A
import { type Args, parseArgs } from '@std/cli'
import type { CommandRouteDefinition } from '../utils/command-router.ts'
import { getMainExportPath } from '../utils/package-info.ts'
import logger from '../utils/logger.ts'
import loadConfig from '../config.ts'

const config = await loadConfig()

const commandRoute: CommandRouteDefinition = {
  name: 'cli',
  command: command,
  description: 'Runs the library for your project as a CLI',
  options: {
    boolean: ['help', 'h'],
    alias: { h: 'help' },
  },
}

async function command(): Promise<void> {
  logger.debug(`Running your library through a CLI in the workspace: ${config.workspace}`)

  try {
    const mainExportPath = await getMainExportPath(config.workspace)
    const moduleToCLIArgs = Deno.args.slice(Deno.args.indexOf(commandRoute.name) + 1)
    logger.info(mainExportPath, moduleToCLIArgs)

    const command = new Deno.Command('deno', {
      args: [
        'run',
        '-A',
        'jsr:@deno-kit/module-to-cli',
        mainExportPath,
        ...moduleToCLIArgs,
      ],
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    })
    await command.spawn().status
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : String(err))
  }
}

if (import.meta.main) {
  const args: Args = parseArgs(Deno.args, commandRoute.options)
  await commandRoute.command({ args, routes: [commandRoute] })
}
export default commandRoute
