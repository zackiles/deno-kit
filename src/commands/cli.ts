import type { CommandRouteDefinition } from '../utils/command-router.ts'
import { getMainExportPath } from '../utils/package-info.ts'
import terminal from '../utils/terminal.ts'
import { getConfig } from '../config.ts'
import type { DenoKitConfig } from '../types.ts'

const config = await getConfig() as DenoKitConfig

const commandRoute: CommandRouteDefinition = {
  name: 'cli',
  command: command,
  description: 'Runs the library for your project as a CLI',
  options: {
    boolean: ['help', 'h'],
    alias: { h: 'help' },
  },
}

async function command(): Promise<void> {
  terminal.debug(
    `Running your library through a CLI in the workspace: ${config.DENO_KIT_WORKSPACE_PATH}`,
  )

  try {
    const mainExportPath = await getMainExportPath(
      config.DENO_KIT_WORKSPACE_PATH || '',
    )
    const moduleToCLIArgs = Deno.args.slice(
      Deno.args.indexOf(commandRoute.name) + 1,
    )
    terminal.info(mainExportPath, moduleToCLIArgs)

    const command = new Deno.Command('deno', {
      args: [
        'run',
        '-A',
        'jsr:@deno-kit/module-to-cli',
        mainExportPath,
        ...moduleToCLIArgs,
      ],
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    })
    await command.spawn().status
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : String(err))
  }
}

export default commandRoute
