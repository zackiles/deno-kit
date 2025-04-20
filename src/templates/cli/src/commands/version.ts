#!/usr/bin/env -S deno run -A
import { type Args, parseArgs } from '@std/cli'
import type { CommandDefinition } from '../types.ts'
import logger from '../utils/logger.ts'

const commandDefinition: CommandDefinition = {
  name: 'version',
  command: command,
  description: 'Show version'
}

async function command(): Promise<void> {
  logger.print("{PACKAGE_VERSION}")
}

if (import.meta.main) {
  const args: Args = parseArgs(Deno.args)
  await commandDefinition.command({ args, routes: [commandDefinition] })
}

export default commandDefinition
