#!/usr/bin/env -S deno run -A
import { type Args, parseArgs } from '@std/cli'
import { load as loadWorkspace, type Workspace } from '../workspace.ts'
import type { CommandDefinition, CommandOptions } from '../types.ts'
import { getPackageForPath } from '../utils/package-info.ts'
import logger from '../utils/logger.ts'
import loadConfig from '../config.ts'

const config = await loadConfig()

const commandDefinition: CommandDefinition = {
  name: 'reset',
  command: command,
  description: 'Reset the current workspace and restore original files',
  options: {
    string: ['workspace'],
    default: { 'workspace': config.DENO_KIT_WORKSPACE || Deno.cwd() },
  },
}

async function command({ args }: CommandOptions): Promise<void> {
  logger.debug(`Resetting and restoring backup files for workspace: ${args.workspace}`)

  const packageInfo = await getPackageForPath(args.workspace, {
    packageConfigFiles: ['kit.json'],
  })

  const workspace: Workspace = await loadWorkspace(packageInfo)
  await workspace.reset()

  logger.info(`Reset workspace: ${workspace.path}`)
}

if (import.meta.main) {
  const args: Args = parseArgs(Deno.args, commandDefinition.options)
  await commandDefinition.command({ args, routes: [commandDefinition] })
}
export default commandDefinition
