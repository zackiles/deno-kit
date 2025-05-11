import type { CommandRouteDefinition } from '../utils/command-router.ts'
import { findPackageFromPath } from '../utils/package-info.ts'
import logger from '../utils/logger.ts'

const commandRoute: CommandRouteDefinition = {
  name: 'version',
  command: displayVersion,
  description: 'Display the package version',
}

async function displayVersion(): Promise<void> {
  try {
    const packageData = await findPackageFromPath()
    const version = packageData.version as string || 'unknown'
    logger.print(version)
  } catch (err) {
    throw new Error(
      `Failed to retrieve version information: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

export default commandRoute
