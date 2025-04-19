#!/usr/bin/env -S deno run -A
import { type Args, parseArgs } from '@std/cli'
import type { CommandDefinition } from '../types.ts'
import { getMainExportPath } from '../utils/package-info.ts'
import logger from '../utils/logger.ts'
import loadConfig from '../config.ts'

const config = await loadConfig()

const commandDefinition: CommandDefinition = {
  name: 'run-cli',
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
    const moduleToCLIArgs = Deno.args.slice(Deno.args.indexOf(commandDefinition.name) + 1)
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
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error))
  }
}

if (import.meta.main) {
  const args: Args = parseArgs(Deno.args, commandDefinition.options)
  await commandDefinition.command({ args, routes: [commandDefinition] })
}
export default commandDefinition
