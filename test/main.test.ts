import { assertStringIncludes } from '@std/assert'
import { describe, it } from '@std/testing/bdd'
import { dirname, fromFileUrl, join } from '@std/path'
import { stripAnsi } from '../src/utils/formatting.ts'

const CLI_PATH = join(dirname(fromFileUrl(import.meta.url)), '../src/main.ts')

/**
 * Helper function to run the CLI with given arguments
 * @param args Arguments to pass to the CLI
 * @returns Promise containing the output of the command
 */
async function runCLI(
  args: string[] = [],
): Promise<{ output: string; success: boolean }> {
  const command = new Deno.Command(Deno.execPath(), {
    args: ['run', '--allow-read', '--allow-env', CLI_PATH, ...args],
    stdout: 'piped',
    stderr: 'piped',
  })

  const { success, stdout, stderr } = await command.output()
  const output = new TextDecoder().decode(success ? stdout : stderr)
  return { output: stripAnsi(output), success }
}

describe('main.ts CLI', () => {
  it('should display help menu when --help flag is passed', async () => {
    const { output } = await runCLI(['--help'])

    assertStringIncludes(output, 'Deno-Kit - Usage:')
    assertStringIncludes(output, 'Commands:')
    assertStringIncludes(output, 'help')
  })

  it('should display help menu when no command is passed', async () => {
    const { output } = await runCLI()

    assertStringIncludes(output, 'Deno-Kit - Usage:')
    assertStringIncludes(output, 'Commands:')
    assertStringIncludes(output, 'help')
  })

  it('should display custom workspace when --workspace flag is passed', async () => {
    const testWorkspace = '/custom/workspace/path'
    const { output } = await runCLI(['--workspace', testWorkspace])

    assertStringIncludes(output, `Workspace: ${testWorkspace}`)
  })

  it('should display current working directory as workspace when no --workspace flag is passed', async () => {
    const { output } = await runCLI()

    assertStringIncludes(output, `Workspace: ${Deno.cwd()}`)
  })
})
