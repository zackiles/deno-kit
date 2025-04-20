#!/usr/bin/env -S deno run -A
import { type Args, parseArgs } from '@std/cli'
import type { CommandRouteDefinition } from '../utils/ command-router.ts'
import { getPackageInfo } from '../utils/package-info.ts'
import logger from '../utils/logger.ts'

const commandRoute: CommandRouteDefinition = {
  name: 'version',
  command: displayVersion,
  description: 'Display the package version',
}

async function displayVersion(): Promise<void> {
  try {
    const packageInfo = await getPackageInfo()
    const version = packageInfo.version || 'unknown'
    logger.print(version)
  } catch (err) {
    throw new Error(
      `Failed to retrieve version information: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

if (import.meta.main) {
  const args: Args = parseArgs(Deno.args, commandRoute.options)
  await commandRoute.command({ args, routes: [commandRoute] })
}

export default commandRoute
