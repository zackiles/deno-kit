import { load as loadWorkspace, type Workspace } from '../workspace/index.ts'
import type { CommandRouteDefinition } from '../utils/command-router.ts'
import { findPackagePathFromPath } from '../utils/package-info.ts'
import terminal from '../terminal/mod.ts'
import { getConfig } from '../config.ts'
import type { DenoKitConfig } from '../types.ts'

const config = await getConfig() as DenoKitConfig

const commandRoute: CommandRouteDefinition = {
  name: 'reset',
  command: command,
  description: 'Reset the current workspace and restore original files',
}

async function command(): Promise<void> {
  terminal.debug(
    `Resetting and restoring backup files for workspace: ${config.DENO_KIT_WORKSPACE_PATH}`,
  )

  const packageInfo = await findPackagePathFromPath(
    config.DENO_KIT_WORKSPACE_PATH,
    ['kit.json'],
  )

  if (!packageInfo) {
    throw new Error(
      `Deno-Kit not found in workspace: ${config.DENO_KIT_WORKSPACE_PATH}`,
    )
  }

  const workspace: Workspace = await loadWorkspace(packageInfo)
  await workspace.reset()

  terminal.info(`Reset workspace: ${workspace.path}`)
}

export default commandRoute
