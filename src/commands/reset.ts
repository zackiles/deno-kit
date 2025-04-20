#!/usr/bin/env -S deno run -A
import { type Args, parseArgs } from '@std/cli'
import { load as loadWorkspace, type Workspace } from '../workspace.ts'
import type { CLIRouteDefinition } from '../types.ts'
import { getPackageForPath } from '../utils/package-info.ts'
import logger from '../utils/logger.ts'
import loadConfig from '../config.ts'

const config = await loadConfig()

const commandDefinition: CLIRouteDefinition = {
  name: 'reset',
  command: command,
  description: 'Reset the current workspace and restore original files',
}

async function command(): Promise<void> {
  logger.debug(`Resetting and restoring backup files for workspace: ${config.workspace}`)

  const packageInfo = await getPackageForPath(config.workspace, {
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
