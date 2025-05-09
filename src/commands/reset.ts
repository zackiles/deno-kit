#!/usr/bin/env -S deno run -A
import { type Args, parseArgs } from '@std/cli'
import { load as loadWorkspace, type Workspace } from '../workspace/workspace.ts'
import type { CommandRouteDefinition } from '../utils/command-router.ts'
import { getPackageForPath } from '../utils/package-info.ts'
import logger from '../utils/logger.ts'
import loadConfig from '../config.ts'

const config = await loadConfig()

const commandRoute: CommandRouteDefinition = {
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
  const args: Args = parseArgs(Deno.args, commandRoute.options)
  await commandRoute.command({ args, routes: [commandRoute] })
}
export default commandRoute
