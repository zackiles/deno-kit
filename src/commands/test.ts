#!/usr/bin/env -S deno run -A
import { parseArgs } from '@std/cli'
import type { Args } from '@std/cli'
import type { CommandArgs, CommandDefinition } from '../types.ts'
import type { Workspace } from '../workspace.ts'

const commandDefinition: CommandDefinition = {
  name: 'test',
  command: command,
  description: 'Test the Deno-Kit CLI',
  options: {
    string: ['workspace'],
    default: { 'workspace': Deno.cwd() },
  },
}

async function command({ args, workspace }: CommandArgs): Promise<void> {
  console.log('args', args)
  console.log('workspace', workspace?.toJSON())
}

if (import.meta.main) {
  const args = parseArgs(Deno.args, commandDefinition.options)
  await commandDefinition.command({ args, routes: [commandDefinition] })
}
export default commandDefinition
