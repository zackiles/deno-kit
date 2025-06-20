/**
 * @module graceful-shutdown
 * @description Graceful shutdown handler that manages process signals and performs cleanup.
 *
 * Basic usage:
 * - Import the default instance: `import gracefulShutdown`
 * - (Optional) Add one or more custom shutdown/cleanup handlers: `addShutdownHandler(cleanupMethod)`
 * - Choose ONE of the following to start listening and responding to signals:
 *   - Either use `gracefulShutdown.start()` for simple initialization
 *   - OR use `await gracefulShutdown.wrapAndStart(entrypointMethod)` to wrap an entry point
 * - Done! Graceful shutdown will now respond to signals and perform the registered cleanup handlers.
 *
 * Note: (Optional)You can call panic(errorOrMessage) to trigger a custom shutdown() and exit with a non-zero exit code.
 */

type ShutdownLogger = Record<
  'debug' | 'info' | 'warn' | 'error' | 'log',
  (message: string, ...args: unknown[]) => void
>

class GracefulShutdown {
  private static instance: GracefulShutdown
  private signals: Deno.Signal[] = []
  private signalHandlers = new Map<Deno.Signal, () => void>()
  private cleanupHandlers: (() => void | Promise<void>)[] = []
  private isShuttingDown = false
  private hasStarted = false
  private logger: ShutdownLogger = console

  /**
   * Private constructor to prevent direct instantiation
   */
  private constructor(logger?: ShutdownLogger) {
    // Standard signals across platforms
    this.signals = ['SIGINT', 'SIGTERM']
    // Platform specific signals
    if (Deno.build.os === 'windows') {
      this.signals.push('SIGBREAK')
    } else {
      this.signals.push('SIGHUP', 'SIGQUIT')
    }

    if (logger) this.logger = logger
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(logger?: ShutdownLogger): GracefulShutdown {
    if (!GracefulShutdown.instance) {
      GracefulShutdown.instance = new GracefulShutdown(logger)
    }
    return GracefulShutdown.instance
  }

  /**
   * Register handlers to execute during shutdown
   */
  public addShutdownHandler(handler: () => void | Promise<void>): void {
    this.cleanupHandlers.push(handler)
  }

  /**
   * Add a signal handler for a specific signal
   */
  private addSignalHandler(signal: Deno.Signal): void {
    const signalHandler = () => {
      this.logger.debug(
        `Signal handler: Received ${signal} signal. Exiting gracefully...`,
      )
      Deno.removeSignalListener(signal, signalHandler)
      this.signalHandlers.delete(signal)
      if (signal === 'SIGINT') {
        this.logger.debug(
          'Signal handler: SIGINT detected, calling shutdown with code 130',
        )
        this.shutdown(false, 130)
      } else {
        this.logger.debug(
          `Signal handler: ${signal} detected, calling shutdown with code 0`,
        )
        this.shutdown(false)
      }
    }

    try {
      this.signalHandlers.set(signal, signalHandler)
      Deno.addSignalListener(signal, signalHandler)
      this.logger.debug(`Signal handler registered for ${signal}`)
    } catch (error) {
      this.logger.warn(
        `Failed to add signal listener for ${signal}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  /**
   * Start listening for shutdown signals
   */
  public start(logger?: ShutdownLogger): void {
    if (logger) this.logger = logger

    if (this.hasStarted) {
      this.logger.warn('Graceful shutdown handlers already initialized')
      return
    }

    this.hasStarted = true
    for (const signal of this.signals) {
      this.addSignalHandler(signal)
    }
  }

  /**
   * Start listening for shutdown signals and wrap an entrypoint function
   */
  public async startAndWrap(
    entrypoint: () => Promise<void>,
    logger?: ShutdownLogger,
  ): Promise<void> {
    if (logger) this.logger = logger
    if (this.hasStarted) {
      this.logger.warn('Graceful shutdown wrap already called')
      return
    }

    this.start()

    if (entrypoint) {
      try {
        await entrypoint()
        this.shutdown(false)
      } catch (err) {
        // 🤖 Add debugging information
        this.logger.debug('startAndWrap caught error:', err)
        this.logger.debug(
          'Error name:',
          err instanceof Error ? err.name : 'unknown',
        )
        this.logger.debug(
          'Error message:',
          err instanceof Error ? err.message : String(err),
        )
        this.logger.debug('isShuttingDown flag:', this.isShuttingDown)

        // If we're already shutting down, don't panic - just exit cleanly
        if (this.isShuttingDown) {
          this.logger.debug('Already shutting down, exiting cleanly')
          return
        }

        // Check for interruption signals or graceful shutdown requests
        const isInterruption = err instanceof Error && (
          err.name === 'Interrupted' ||
          err.message.includes('Interrupted') ||
          err.message.includes('exit code 130')
        )

        if (isInterruption) {
          this.logger.debug(
            'Detected interruption/graceful shutdown, exiting with code 130',
          )
          this.shutdown(false, 130)
        } else {
          this.logger.debug('Unexpected error, calling panic')
          this.panic(err instanceof Error ? err : String(err), err)
        }
      }
    }
  }

  /**
   * Execute a controlled shutdown sequence
   */
  public async shutdown(isPanic = false, exitCode?: number): Promise<void> {
    const code = exitCode ?? (isPanic ? 1 : 0)
    this.logger.debug(
      `shutdown() called with isPanic=${isPanic}, exitCode=${exitCode}, finalCode=${code}`,
    )

    if (this.isShuttingDown) {
      this.logger.debug('shutdown() already in progress, returning')
      return
    }
    this.isShuttingDown = true

    const executeHandler = async (
      handler: () => void | Promise<void>,
      handlerType: string,
    ) => {
      try {
        await handler()
      } catch (err) {
        this.logger.warn(
          `Error in ${handlerType} handler: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
    }

    this.logger.debug('Removing signal listeners')
    for (const [signal, handler] of this.signalHandlers.entries()) {
      Deno.removeSignalListener(signal, handler)
      this.signalHandlers.delete(signal)
    }

    this.logger.debug(
      `Executing ${this.cleanupHandlers.length} cleanup handlers`,
    )
    // Execute handlers in order they were added (first added = first executed)
    for (const handler of this.cleanupHandlers) {
      await executeHandler(handler, 'shutdown')
    }

    this.logger.debug(`All cleanup complete, calling Deno.exit(${code})`)
    Deno.exit(code)
  }

  /**
   * Handle an unexpected error and trigger a shutdown
   */
  public panic(errorOrMessage: Error | string, ...args: unknown[]): void {
    this.logger.error(
      errorOrMessage instanceof Error ? errorOrMessage.message : errorOrMessage,
      ...args,
    )
    this.shutdown(true)
  }
}

export const gracefulShutdown = GracefulShutdown.getInstance()
export default gracefulShutdown
