/**
 * @module graceful-shutdown
 * @description Graceful shutdown handler that manages process signals and performs cleanup. Implemented as a singleton to ensure only one instance controls the signal handlers.
 */

import logger from './logger.ts'

/**
 * Function that will be called during shutdown
 */
type ShutdownHandler = () => void | Promise<void>

/**
 * Singleton class for managing graceful shutdown
 */
class GracefulShutdown {
  private static instance: GracefulShutdown
  private signalHandlers = new Map<Deno.Signal, () => void>()
  private shutdownHandlers: ShutdownHandler[] = []
  private isShuttingDown = false
  private signals: Deno.Signal[] = []

  /**
   * Private constructor to prevent direct instantiation
   */
  private constructor() {
    // Define signals to handle based on platform
    const isWindows = Deno.build.os === 'windows'

    // Common signals across platforms
    this.signals = ['SIGINT', 'SIGTERM']

    // Add Unix-specific signals when not on Windows
    if (!isWindows) {
      this.signals.push('SIGHUP', 'SIGQUIT')
    } else {
      // Add Windows-specific signals
      this.signals.push('SIGBREAK')
    }
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): GracefulShutdown {
    if (!GracefulShutdown.instance) {
      GracefulShutdown.instance = new GracefulShutdown()
    }
    return GracefulShutdown.instance
  }

  /**
   * Register handlers to execute during shutdown
   */
  public register(handler: ShutdownHandler): void {
    this.shutdownHandlers.push(handler)
  }

  /**
   * Start listening for shutdown signals
   */
  public start(): void {
    // Create and add signal listeners
    for (const signal of this.signals) {
      // Create a handler function for this specific signal
      const handler = () => this.handleShutdown(signal)

      // Store the handler reference so we can remove it later
      this.signalHandlers.set(signal, handler)

      try {
        Deno.addSignalListener(signal, handler)
      } catch (error) {
        logger.debug(
          `Failed to add signal listener for ${signal}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }

    logger.debug('Graceful shutdown handlers initialized')
  }

  /**
   * Execute a controlled shutdown sequence
   */
  private async handleShutdown(signal: Deno.Signal): Promise<void> {
    // Prevent multiple shutdown sequences
    if (this.isShuttingDown) return
    this.isShuttingDown = true

    logger.debug(`Received ${signal} signal, shutting down gracefully...`)

    // Execute all shutdown handlers
    for (const handler of this.shutdownHandlers) {
      try {
        await Promise.resolve(handler())
      } catch (error) {
        logger.error(
          `Error during shutdown: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    // Exit with success code
    Deno.exit(0)
  }

  /**
   * Clean up signal handlers
   */
  public cleanup(): void {
    if (this.isShuttingDown) return

    // Remove all signal handlers
    for (const signal of this.signals) {
      const handler = this.signalHandlers.get(signal)
      if (handler) {
        try {
          Deno.removeSignalListener(signal, handler)
          logger.debug(`Removed signal handler for ${signal}`)
        } catch {
          // Ignore errors when removing listeners
        }
      }
    }

    // Clear all handlers
    this.signalHandlers.clear()
    this.shutdownHandlers = []
    logger.debug('Graceful shutdown handlers cleaned up')
  }

  /**
   * Trigger a manual shutdown (useful for error handlers)
   */
  public triggerShutdown(reason: string): void {
    logger.error(reason)
    this.handleShutdown('SIGTERM')
  }
}

// Export the singleton instance
export const gracefulShutdown = GracefulShutdown.getInstance()
export default gracefulShutdown
