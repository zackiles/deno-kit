import type { CommandRouteDefinition } from '../utils/command-router.ts'
import { findPackagePathFromPath } from '../utils/package-info.ts'
import terminal from '../terminal/mod.ts'
import { getConfig } from '../config.ts'
import type { DenoKitConfig } from '../types.ts'

const config = await getConfig() as DenoKitConfig

const commandRoute: CommandRouteDefinition = {
  name: 'remove',
  command: command,
  description: 'Remove Deno-Kit from this workspace',
}

async function command(): Promise<void> {
  terminal.debug(
    `Removing Deno-Kit from workspace: ${config.DENO_KIT_WORKSPACE_PATH}`,
  )

  const packageInfo = await findPackagePathFromPath(
    config.DENO_KIT_WORKSPACE_PATH,
    ['kit.json'],
  )

  if (packageInfo) {
    await Deno.remove(packageInfo)
    terminal.print(
      `Removed Deno-Kit from workspace: ${config.DENO_KIT_WORKSPACE_PATH}`,
    )
  } else {
    throw new Error(
      `Deno-Kit not found in workspace: ${config.DENO_KIT_WORKSPACE_PATH}`,
    )
  }
}

export default commandRoute
