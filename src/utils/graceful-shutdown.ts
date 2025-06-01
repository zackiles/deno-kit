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
 * Note: (Optional)You can call panic(errorOrMessage) to trigger a custom shutdown and exit with a non-zero exit code.
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
      this.logger.debug(`Received ${signal} signal. Exiting gracefully...`)
      Deno.removeSignalListener(signal, signalHandler)
      this.signalHandlers.delete(signal)
      this.shutdown(false)
    }

    try {
      this.signalHandlers.set(signal, signalHandler)
      Deno.addSignalListener(signal, signalHandler)
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
        this.panic(err instanceof Error ? err : String(err))
      }
    }
  }

  /**
   * Execute a controlled shutdown sequence
   */
  private async shutdown(isPanic = false): Promise<void> {
    if (this.isShuttingDown) return
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

    for (const [signal, handler] of this.signalHandlers.entries()) {
      Deno.removeSignalListener(signal, handler)
      this.signalHandlers.delete(signal)
    }

    await Promise.all(
      this.cleanupHandlers.map((handler) =>
        executeHandler(handler, 'shutdown')
      ),
    )

    Deno.exit(isPanic ? 1 : 0)
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
