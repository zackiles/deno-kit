// Comprehensive terminal cleanup utility
// Ensures terminal is properly restored after TUI applications exit
import { gracefulShutdown } from '../utils/graceful-shutdown.ts'
import { ANSI_CODES, resetSequence } from './constants.ts'

interface TerminalCleanupOptions {
  signalHandlerRegistry?: (handler: () => void | Promise<void>) => void
}

// Lazy-loaded terminal instance to avoid circular dependency
let terminalInstance: unknown = null
async function getTerminal(): Promise<{
  debug: (msg: string, ...args: unknown[]) => void
  info: (msg: string, ...args: unknown[]) => void
  warn: (msg: string, ...args: unknown[]) => void
  error: (msg: string, ...args: unknown[]) => void
}> {
  if (!terminalInstance) {
    const mod = await import('./mod.ts')
    terminalInstance = mod.terminal
  }
  return terminalInstance as {
    debug: (msg: string, ...args: unknown[]) => void
    info: (msg: string, ...args: unknown[]) => void
    warn: (msg: string, ...args: unknown[]) => void
    error: (msg: string, ...args: unknown[]) => void
  }
}

// Synchronous terminal access for cases where async is not possible
function getTerminalSync(): {
  debug: (msg: string, ...args: unknown[]) => void
  info: (msg: string, ...args: unknown[]) => void
  warn: (msg: string, ...args: unknown[]) => void
  error: (msg: string, ...args: unknown[]) => void
} | null {
  if (terminalInstance) {
    return terminalInstance as {
      debug: (msg: string, ...args: unknown[]) => void
      info: (msg: string, ...args: unknown[]) => void
      warn: (msg: string, ...args: unknown[]) => void
      error: (msg: string, ...args: unknown[]) => void
    }
  }
  return null
}

export class TerminalCleanup {
  static #instance: TerminalCleanup | null = null
  #cleanupHandlers: (() => void | Promise<void>)[] = []
  #isCleaningUp = false
  #signalHandlerRegistry:
    | ((handler: () => void | Promise<void>) => void)
    | undefined
  #originalTerminalState: {
    rawMode: boolean
    alternateScreen: boolean
    mouseEnabled: boolean
    bracketedPaste: boolean
    focusTracking: boolean
  } | null = null

  private constructor(options: TerminalCleanupOptions = {}) {
    this.#signalHandlerRegistry = options.signalHandlerRegistry
    this.recordOriginalState()
    this.setupGlobalErrorHandlers()

    if (this.#signalHandlerRegistry) {
      this.#signalHandlerRegistry(this.cleanup.bind(this))
    }

    // Use sync terminal access during initialization if available
    const terminal = getTerminalSync()
    terminal?.debug('TerminalCleanup initialized', this.#originalTerminalState)
  }

  static getInstance(options: TerminalCleanupOptions = {}): TerminalCleanup {
    if (!TerminalCleanup.#instance) {
      TerminalCleanup.#instance = new TerminalCleanup(options)
    }
    return TerminalCleanup.#instance
  }

  // Record the original terminal state before any modifications
  recordOriginalState(): void {
    this.#originalTerminalState = {
      rawMode: false, // Assume normal mode initially
      alternateScreen: false,
      mouseEnabled: false,
      bracketedPaste: false,
      focusTracking: false,
    }
    // Use sync terminal access during initialization if available
    const terminal = getTerminalSync()
    terminal?.debug('TerminalCleanup', 'Original terminal state recorded')
  }

  // Add a cleanup handler
  addCleanupHandler(handler: () => void | Promise<void>): void {
    this.#cleanupHandlers.push(handler)
  }

  addExternalCleanupHandler(handler: () => void | Promise<void>): void {
    if (this.#signalHandlerRegistry) {
      this.#signalHandlerRegistry(handler)
    }
  }

  // Remove a cleanup handler
  removeCleanupHandler(handler: () => void | Promise<void>): void {
    const index = this.#cleanupHandlers.indexOf(handler)
    if (index >= 0) {
      this.#cleanupHandlers.splice(index, 1)
    }
  }

  // Perform comprehensive terminal cleanup
  async cleanup(): Promise<void> {
    if (this.#isCleaningUp) return
    this.#isCleaningUp = true

    const terminal = await getTerminal()
    terminal.debug('TerminalCleanup', 'Calling #cleanupHandlers')

    try {
      // Run custom cleanup handlers first
      for (const handler of this.#cleanupHandlers) {
        try {
          await handler()
        } catch (error) {
          terminal.warn('TerminalCleanup', 'Error in cleanup handler', error)
        }
      }

      // Restore terminal to normal state
      // await this.restoreTerminalState()

      // terminal.debug(
      //   'TerminalCleanup',
      //   'Terminal cleanup completed successfully',
      // )
    } catch (error) {
      terminal.error('TerminalCleanup', 'Error during terminal cleanup', error)
    } finally {
      this.#isCleaningUp = false
    }
  }

  // Restore terminal to its original state
  private async restoreTerminalState(): Promise<void> {
    const encoder = new TextEncoder()
    const terminal = await getTerminal()

    try {
      // Disable raw mode first (most important)
      if (Deno.stdin.isTerminal()) {
        try {
          Deno.stdin.setRaw(false)
          terminal.debug('TerminalCleanup', 'Raw mode disabled')
        } catch (error) {
          terminal.warn('TerminalCleanup', 'Failed to disable raw mode', error)
        }
      }

      // Write the reset sequence synchronously for immediate effect
      Deno.stdout.writeSync(encoder.encode(resetSequence))

      // Small delay to ensure terminal processes the reset
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Additional cleanup for specific terminal types
      await this.performTerminalSpecificCleanup()

      // Force a final flush and ensure cursor is visible
      await Deno.stdout.write(encoder.encode(ANSI_CODES.CURSOR_SHOW))

      // Final delay to ensure everything is processed
      await new Promise((resolve) => setTimeout(resolve, 10))

      terminal.debug('TerminalCleanup', 'Terminal state restoration completed')
    } catch (error) {
      terminal.error('TerminalCleanup', 'Error restoring terminal state', error)
    }
  }

  // Perform cleanup specific to certain terminal types
  private async performTerminalSpecificCleanup(): Promise<void> {
    const term = Deno.env.get('TERM') || ''
    const encoder = new TextEncoder()
    const terminal = await getTerminal()

    try {
      // Kitty terminal specific cleanup
      if (term.includes('kitty') || Deno.env.get('KITTY_WINDOW_ID')) {
        Deno.stdout.writeSync(encoder.encode(ANSI_CODES.KITTY_KEYBOARD_DISABLE))
        terminal.debug('TerminalCleanup', 'Kitty-specific cleanup performed')
      }

      // iTerm2 specific cleanup
      if (Deno.env.get('TERM_PROGRAM') === 'iTerm.app') {
        // iTerm2 specific reset sequences if needed
        terminal.debug('TerminalCleanup', 'iTerm2-specific cleanup performed')
      }

      // Windows Terminal specific cleanup
      if (Deno.env.get('WT_SESSION')) {
        // Windows Terminal specific reset sequences if needed
        terminal.debug(
          'TerminalCleanup',
          'Windows Terminal-specific cleanup performed',
        )
      }
    } catch (error) {
      terminal.warn(
        'TerminalCleanup',
        'Error in terminal-specific cleanup',
        error,
      )
    }
  }

  // Setup global cleanup handlers for various exit scenarios
  private setupGlobalErrorHandlers(): void {
    globalThis.addEventListener?.('beforeunload', () => {
      this.cleanup()
    })

    globalThis.addEventListener('error', (event) => {
      this.cleanup().then(() => {
        const terminal = getTerminalSync()
        terminal?.error(
          'TerminalCleanup',
          'Uncaught error, cleaning up terminal',
          event.error,
        )
      })
    })

    globalThis.addEventListener('unhandledrejection', (event) => {
      this.cleanup().then(() => {
        const terminal = getTerminalSync()
        terminal?.error(
          'TerminalCleanup',
          'Unhandled promise rejection, cleaning up terminal',
          event.reason,
        )
      })
    })
  }

  // Force immediate cleanup (for emergency situations)
  forceCleanup(): void {
    const encoder = new TextEncoder()

    try {
      // Disable raw mode first
      if (Deno.stdin.isTerminal()) {
        Deno.stdin.setRaw(false)
      }

      // Emergency terminal reset - use the same reset sequence for consistency
      Deno.stdout.writeSync(encoder.encode(resetSequence))
    } catch {
      // Ignore errors in emergency cleanup
    }
  }
}

// Export singleton instance
export const terminalCleanup = TerminalCleanup.getInstance({
  signalHandlerRegistry: gracefulShutdown.addShutdownHandler.bind(
    gracefulShutdown,
  ),
})

// Convenience function for one-time cleanup
export async function cleanupTerminal(): Promise<void> {
  await terminalCleanup.cleanup()
}

// Emergency cleanup function
export function emergencyCleanupTerminal(): void {
  terminalCleanup.forceCleanup()
}
