#!/usr/bin/env -S deno run -A
import { type Args, parseArgs } from '@std/cli'
import type { CommandRouteDefinition } from '../utils/command-router.ts'
import logger from '../utils/logger.ts'
import loadConfig from '../config.ts'

const config = await loadConfig()

const commandRouteDefinition: CommandRouteDefinition = {
	name: 'version',
	command: command,
	description: 'Show version',
};

async function command(): Promise<void> {
	logger.print(`${config.PACKAGE_VERSION}`)
}

if (import.meta.main) {
	const args: Args = parseArgs(Deno.args)
	await commandRouteDefinition.command({ args, routes: [commandRouteDefinition] })
}

export { commandRouteDefinition, command }
export default commandRouteDefinition
