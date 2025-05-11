import type { CommandRouteDefinition } from '../utils/command-router.ts'
import { findPackagePathFromPath } from '../utils/package-info.ts'
import logger from '../utils/logger.ts'
import { getConfig } from '../config.ts'
import type { DenoKitConfig } from '../types.ts'

const config = await getConfig() as DenoKitConfig

const commandRoute: CommandRouteDefinition = {
  name: 'remove',
  command: command,
  description: 'Remove deno-kit from the current workspace',
}

async function command(): Promise<void> {
  logger.debug(`Removing Deno-Kit from workspace: ${config.DENO_KIT_WORKSPACE_PATH}`)

  const packageInfo = await findPackagePathFromPath(config.DENO_KIT_WORKSPACE_PATH || '', {
    packageConfigFiles: [config.DENO_KIT_WORKSPACE_CONFIG_FILE_NAME],
  })

  if (packageInfo) {
    await Deno.remove(packageInfo)
    logger.info(`Removed Deno-Kit from workspace: ${config.DENO_KIT_WORKSPACE_PATH}`)
  } else {
    throw new Error(`Deno-Kit not found in workspace: ${config.DENO_KIT_WORKSPACE_PATH}`)
  }
}

export default commandRoute
