#!/usr/bin/env -S deno run -A
import { type Args, parseArgs } from '@std/cli'
import type { CommandRouteDefinition, CommandRouteOptions } from '../utils/command-router.ts'
import logger from '../utils/logger.ts'
import loadConfig from '../config.ts'

const config = await loadConfig()

const commandRouteDefinition: CommandRouteDefinition = {
	name: 'example',
	command: command,
	description: 'An example command template',
	options: {
		boolean: ['flag'],
		alias: { f: 'flag' },
	},
};

function command({ args, routes }: CommandRouteOptions): void {
	logger.print(`Command ${commandRouteDefinition.name} executed`, {
		args,
		config,
		routes,
	});
}

if (import.meta.main) {
	const args: Args = parseArgs(Deno.args, commandRouteDefinition.options)
	await commandRouteDefinition.command({ args, routes: [commandRouteDefinition] })
}

export { commandRouteDefinition, command }
export default commandRouteDefinition
