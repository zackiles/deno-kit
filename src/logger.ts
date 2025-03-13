import { logs } from '@opentelemetry/api-logs'
import {
  ConsoleLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs'

type LogLevelName =
  | 'silent'
  | 'error'
  | 'warn'
  | 'info'
  | 'debug'
  | 'log'
  | 'verbose'

interface LoggerConfig {
  level?: LogLevelName
  tags?: string[]
}

interface LogData {
  sessionId?: string
  error?: Error
  [key: string]: unknown
}

const LOG_LEVELS: Record<LogLevelName, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  log: 5,
  verbose: 6,
}

// Initialize the logger provider with configuration from environment variables
const loggerProvider = new LoggerProvider()

// Only add console exporter if OTEL logs are enabled or we're not in production
const logsEnabled = Deno.env.get('OTEL_LOGS_ENABLED') === 'true'
const isProduction = ['production'].includes(
  Deno.env.get('DENO_ENV') || Deno.env.get('NODE_ENV') || '',
)

// If logs are enabled explicitly, or if we're not in production (development mode)
if (logsEnabled || !isProduction) {
  // Add the console exporter for viewing logs in the console
  loggerProvider.addLogRecordProcessor(
    new SimpleLogRecordProcessor(new ConsoleLogRecordExporter()),
  )
}

// If there's a specific OTEL exporter endpoint configured, we would set it up here
const exporterEndpoint = Deno.env.get('OTEL_EXPORTER_ENDPOINT')
const exporterType = Deno.env.get('OTEL_EXPORTER_TYPE') || 'console'
if (logsEnabled && exporterEndpoint && exporterType !== 'console') {
  // Here we would configure additional exporters based on the type
  // For example: OTLP, Zipkin, Jaeger, etc.
  // This would require additional dependencies and configuration
}

// Get the logger with the configured service name from environment
const loggerName = Deno.env.get('LIB_LOG_NAME') ||
  Deno.env.get('OTEL_SERVICE_NAME') || 'DENO_LOGs'
const logger = logs.getLogger(loggerName)

class Logger {
  private static readonly instances = new Map<string, Logger>()

  private static get globalTags(): string[] {
    return Deno.env.get('LIB_LOG_TAGS')?.split(',') || []
  }

  private static normalizeLogLevel(level?: string | null): LogLevelName {
    return level &&
        LOG_LEVELS[level.toLowerCase() as LogLevelName] !== undefined
      ? (level.toLowerCase() as LogLevelName)
      : 'info'
  }

  private static get globalLevel(): LogLevelName {
    // If OTEL is disabled, return silent in production
    if (isProduction && Deno.env.get('OTEL_LOGS_ENABLED') !== 'true') {
      return 'silent'
    }
    return Logger.normalizeLogLevel(Deno.env.get('LIB_LOG_LEVEL'))
  }

  static clearInstances(): void {
    Logger.instances.clear()
  }

  private constructor(
    private readonly context: string,
    private config: LoggerConfig = {},
  ) {
    this.config = { tags: [], level: Logger.globalLevel, ...config }
  }

  static get(context: string, config?: LoggerConfig): Logger {
    const key = `${context}-${JSON.stringify(config)}`
    if (!Logger.instances.has(key)) {
      Logger.instances.set(key, new Logger(context, config))
    }
    return Logger.instances.get(key) ?? new Logger(context, config)
  }

  withTags = (tags: string[]): Logger =>
    Logger.get(this.context, {
      ...this.config,
      tags: [...(this.config.tags ?? []), ...tags],
    })

  private shouldLog(level: LogLevelName): boolean {
    // If OTEL logs are disabled explicitly, don't log except for errors
    if (Deno.env.get('OTEL_LOGS_ENABLED') === 'false' && level !== 'error') {
      return false
    }

    return LOG_LEVELS[level] <=
      LOG_LEVELS[this.config.level ?? Logger.globalLevel]
  }

  private emitLog(
    level: LogLevelName,
    messageOrError: string | Error,
    data?: LogData,
  ): void {
    if (!this.shouldLog(level)) return

    const message = messageOrError instanceof Error
      ? messageOrError.message
      : messageOrError
    const errorToLog = messageOrError instanceof Error
      ? messageOrError
      : data?.error

    // Create a clean version of the data object without the Error instances
    const cleanData: Record<string, unknown> = {}
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        if (key !== 'error') {
          cleanData[key] = value
        }
      }
    }

    logger.emit({
      severityText: level.toUpperCase(),
      body: message,
      attributes: {
        context: this.context,
        tags: this.config.tags?.join(', ') ?? '',
        errorStack: errorToLog ? String(errorToLog.stack) : undefined,
        errorMessage: errorToLog ? errorToLog.message : undefined,
        ...cleanData,
      },
    })
  }

  verbose = (messageOrError: string | Error, data?: LogData) =>
    this.emitLog('verbose', messageOrError, data)
  log = (messageOrError: string | Error, data?: LogData) =>
    this.emitLog('log', messageOrError, data)
  debug = (messageOrError: string | Error, data?: LogData) =>
    this.emitLog('debug', messageOrError, data)
  info = (messageOrError: string | Error, data?: LogData) =>
    this.emitLog('info', messageOrError, data)
  warn = (messageOrError: string | Error, data?: LogData) =>
    this.emitLog('warn', messageOrError, data)
  error = (messageOrError: string | Error, data?: LogData) =>
    this.emitLog('error', messageOrError, data)
}

export { Logger }
export type { LogData, LoggerConfig, LogLevelName }
