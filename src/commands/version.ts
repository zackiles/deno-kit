#!/usr/bin/env -S deno run -A
import { type Args, parseArgs } from '@std/cli'
import type { CLIRouteDefinition } from '../types.ts'
import { getPackageInfo } from '../utils/package-info.ts'
import logger from '../utils/logger.ts'

const commandDefinition: CLIRouteDefinition = {
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
  const args: Args = parseArgs(Deno.args, commandDefinition.options)
  await commandDefinition.command({ args, routes: [commandDefinition] })
}

export default commandDefinition
