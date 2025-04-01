#!/usr/bin/env -S deno run -A
import { type Args, parseArgs } from '@std/cli'
import { load as loadWorkspace, type Workspace } from '../workspace.ts'
import type { CommandDefinition, CommandOptions } from '../types.ts'
import { getPackageForPath } from '../utils/package-info.ts'
import logger from '../utils/logger.ts'

const commandDefinition: CommandDefinition = {
  name: 'remove',
  command: command,
  description: 'Remove Deno-Kit from the current workspace and restore original files',
  options: {
    string: ['workspace'],
    //default: { 'workspace': Deno.cwd() },
    default: { 'workspace': '/Users/zacharyiles/dev/temp' },
  },
}

async function command({ args }: CommandOptions): Promise<void> {
  logger.debug(`Removing Deno-Kit and restoring original files in workspace: ${args.workspace}`)

  const packageInfo = await getPackageForPath(args.workspace, {
    packageConfigFiles: ['kit.json'],
  })

  const workspace: Workspace = await loadWorkspace(packageInfo)

  logger.info('Deno-Kit removed!', await workspace.toJSON())
}

if (import.meta.main) {
  const args: Args = parseArgs(Deno.args, commandDefinition.options)
  await commandDefinition.command({ args, routes: [commandDefinition] })
}
export default commandDefinition
