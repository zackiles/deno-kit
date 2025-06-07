import type { CommandRouteDefinition } from '../utils/command-router.ts'
import { findPackageFromPath } from '../utils/package-info.ts'
import terminal from '../terminal/mod.ts'

const commandRoute: CommandRouteDefinition = {
  name: 'version',
  command: command,
  description: 'Display the package version',
}

async function command(): Promise<void> {
  try {
    const packageData = await findPackageFromPath()
    const version = packageData.version as string || 'unknown'
    terminal.write(version)
  } catch (err) {
    throw new Error(
      `Failed to retrieve version information: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }
}

export default commandRoute
