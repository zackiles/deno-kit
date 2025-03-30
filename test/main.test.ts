import { assertEquals, assertMatch } from '@std/assert'
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd'
import { createTempDir, restoreEnv, setupTestEnv } from './test-utils.ts'
import { CLI_NAME, main } from '../src/main.ts'

// Extend the globalThis interface to include our logger
declare global {
  let logger: {
    helpTitle: (msg: string) => void
    helpUsage: (msg: string) => void
    helpSection: (msg: string) => void
    helpCommand: (name: string, desc: string, maxLength?: number) => void
    helpNote: (msg: string) => void
    error: (msg: string, ...args: unknown[]) => void
    warn: (msg: string) => void
  }
}

describe('main.ts', () => {
  let tempDir: string
  let originalEnv: Record<string, string>
  let originalArgs: string[]
  let mockOutput: {
    title: string
    usage: string
    section: string
    commands: string[]
    note: string
  }

  // Mock logger functions to capture output
  const mockLogger = {
    helpTitle: (msg: string) => {
      mockOutput.title = msg
    },
    helpUsage: (msg: string) => {
      mockOutput.usage = msg
    },
    helpSection: (msg: string) => {
      mockOutput.section = msg
    },
    helpCommand: (name: string, desc: string) => {
      mockOutput.commands.push(`${name}: ${desc}`)
    },
    helpNote: (msg: string) => {
      mockOutput.note = msg
    },
    error: (_msg: string, ..._args: unknown[]) => {},
    warn: (_msg: string) => {},
  }

  beforeEach(async () => {
    // Setup test environment
    tempDir = await createTempDir()
    originalEnv = setupTestEnv(tempDir)
    originalArgs = Deno.args

    // Reset mock output
    mockOutput = {
      title: '',
      usage: '',
      section: '',
      commands: [],
      note: '',
    }

    // Mock the logger
    globalThis.logger = mockLogger
  })

  afterEach(() => {
    // Restore environment
    restoreEnv(originalEnv)
    Object.defineProperty(Deno, 'args', { value: originalArgs })

    // Clean up temp directory
    try {
      Deno.removeSync(tempDir, { recursive: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('help command', () => {
    it('should display help when no command is provided', async () => {
      // Set empty args
      Object.defineProperty(Deno, 'args', { value: [] })

      // Run main
      await main()

      // Verify help output
      assertEquals(mockOutput.title, `${CLI_NAME} - Usage:`)
      assertEquals(mockOutput.usage, `  ${CLI_NAME} [command] [options]`)
      assertEquals(mockOutput.section, 'Commands:')
      assertMatch(mockOutput.commands[0], /help: Display this help message/)
      assertEquals(
        mockOutput.note,
        'If no command is provided, the "help" command will be executed.',
      )
    })

    it('should display help when help command is explicitly called', async () => {
      // Set help command args
      Object.defineProperty(Deno, 'args', { value: ['help'] })

      // Run main
      await main()

      // Verify help output
      assertEquals(mockOutput.title, `${CLI_NAME} - Usage:`)
      assertEquals(mockOutput.usage, `  ${CLI_NAME} [command] [options]`)
      assertEquals(mockOutput.section, 'Commands:')
      assertMatch(mockOutput.commands[0], /help: Display this help message/)
      assertEquals(
        mockOutput.note,
        'If no command is provided, the "help" command will be executed.',
      )
    })

    it('should display help when an invalid command is provided', async () => {
      // Set invalid command args
      Object.defineProperty(Deno, 'args', { value: ['invalid-command'] })

      // Mock error logger to not pollute test output
      const errorLogs: string[] = []
      mockLogger.error = (msg: string) => errorLogs.push(msg)

      // Run main
      try {
        await main()
      } catch {
        // Ignore exit error
      }

      // Verify error and help output
      assertMatch(errorLogs[0], /Invalid command/)
      assertEquals(mockOutput.title, `${CLI_NAME} - Usage:`)
      assertEquals(mockOutput.usage, `  ${CLI_NAME} [command] [options]`)
      assertEquals(mockOutput.section, 'Commands:')
      assertMatch(mockOutput.commands[0], /help: Display this help message/)
    })

    it('should format CLI name correctly in help output', async () => {
      // Set empty args
      Object.defineProperty(Deno, 'args', { value: [] })

      // Run main
      await main()

      // Verify CLI name formatting
      const formattedCliName = CLI_NAME.split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
      assertEquals(mockOutput.title, `${formattedCliName} - Usage:`)
    })
  })
})
