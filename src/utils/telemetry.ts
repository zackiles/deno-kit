import { context, trace } from '@opentelemetry/api'
import { logs } from '@opentelemetry/api-logs'
import {
  ConsoleLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs'
import type { Attributes, Context, Span, SpanOptions } from '@opentelemetry/api'

// --------------- Logger Implementation ---------------

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
const otelLogger = logs.getLogger(loggerName)

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

    const message = messageOrError instanceof Error ? messageOrError.message : messageOrError
    const errorToLog = messageOrError instanceof Error ? messageOrError : data?.error

    // Create a clean version of the data object without the Error instances
    const cleanData: Record<string, unknown> = {}
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        if (key !== 'error') {
          cleanData[key] = value
        }
      }
    }

    otelLogger.emit({
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

// --------------- Telemetry Implementation ---------------

// Logger for the telemetry module
const logger = Logger.get('telemetry')

// Read service name from environment variable
const SERVICE_NAME = Deno.env.get('OTEL_SERVICE_NAME') || 'lib'

// Define trace header constants for distributed tracing
const TRACE_PARENT_HEADER = 'traceparent'
const TRACE_STATE_HEADER = 'tracestate'

// Map kind string to SpanKind enum for better code reuse
const KIND_MAP: Record<string, number> = {
  internal: 0, // SpanKind.INTERNAL
  server: 1, // SpanKind.SERVER
  client: 2, // SpanKind.CLIENT
  producer: 3, // SpanKind.PRODUCER
  consumer: 4, // SpanKind.CONSUMER
}

/**
 * Extract trace context from HTTP request headers
 * This enables distributed tracing across services
 */
const extractTraceContext = (request: Request) => ({
  traceparent: request.headers.get(TRACE_PARENT_HEADER) || undefined,
  tracestate: request.headers.get(TRACE_STATE_HEADER) || undefined,
})

/**
 * Get the current tracer for the service
 */
const getTracer = (name = SERVICE_NAME) => trace.getTracer(name)

/**
 * Get the current context or create a new one
 */
const getCurrentContext = (): Context => context.active()

/**
 * Create a child context with the given span
 */
const createContextWithSpan = (span: Span, parent?: Context): Context =>
  trace.setSpan(parent || context.active(), span)

/**
 * Execute a callback with the given context active
 */
const withContext = <T>(ctx: Context, fn: () => T): T => context.with(ctx, fn)

/**
 * Create a span for a given operation
 */
async function withSpan<T>(
  name: string,
  fn: () => Promise<T> | T,
  options: {
    attributes?: Attributes
    kind?: 'internal' | 'server' | 'client' | 'producer' | 'consumer'
    parent?: Context
  } = {},
): Promise<T> {
  // Skip tracing if not enabled
  if (
    Deno.env.get('OTEL_DENO') !== 'true' ||
    Deno.env.get('OTEL_TRACE_ENABLED') !== 'true'
  ) {
    return fn()
  }

  const tracer = getTracer()
  const kind = options.kind ? KIND_MAP[options.kind] : KIND_MAP.internal
  const parentContext = options.parent || context.active()
  const spanOptions: SpanOptions = {
    kind,
    ...(options.attributes && { attributes: options.attributes }),
  }

  return tracer.startActiveSpan(
    name,
    spanOptions,
    parentContext,
    async (span: Span) => {
      try {
        logger.debug(`Starting span: ${name}`)
        // Execute function with span context
        const spanContext = trace.setSpan(parentContext, span)
        const result = await context.with(spanContext, fn)
        span.end()
        return result
      } catch (error) {
        // Record error details to the span
        const errorObj = error instanceof Error ? error : new Error(String(error))
        span.recordException(errorObj)
        span.setStatus({ code: 2 }) // ERROR status
        logger.error(`Error in span ${name}`, {
          error: error instanceof Error ? error : errorObj,
        })
        span.end()
        throw error
      }
    },
  )
}

/**
 * Create a new detached span (not set as active)
 */
function createSpan(
  name: string,
  options: {
    attributes?: Attributes
    kind?: 'internal' | 'server' | 'client' | 'producer' | 'consumer'
    parent?: Context
  } = {},
): Span {
  if (
    Deno.env.get('OTEL_DENO') !== 'true' ||
    Deno.env.get('OTEL_TRACE_ENABLED') !== 'true'
  ) {
    // Return a no-op span if telemetry is disabled
    return trace.getTracer('noop').startSpan('noop')
  }

  const tracer = getTracer()
  const kind = options.kind ? KIND_MAP[options.kind] : KIND_MAP.internal
  const parentContext = options.parent || context.active()
  const spanOptions: SpanOptions = {
    kind,
    ...(options.attributes && { attributes: options.attributes }),
  }

  return tracer.startSpan(name, spanOptions, parentContext)
}

/**
 * Options for initializing telemetry
 */
interface TelemetryOptions {
  /** The name of the service */
  serviceName?: string
  /** Whether telemetry is enabled */
  enabled?: boolean
  /** The sampling ratio for traces (0.0 to 1.0) */
  samplingRatio?: number
  /** The type of exporter to use (console, otlp, etc.) */
  exporterType?: string
  /** The endpoint for the exporter */
  exporterEndpoint?: string
}

/**
 * Initialize OpenTelemetry for the application
 */
function initTelemetry(options?: TelemetryOptions): void {
  const serviceName = options?.serviceName ||
    Deno.env.get('OTEL_SERVICE_NAME') || 'lib'
  const enabled = options?.enabled !== false &&
    Deno.env.get('OTEL_SDK_DISABLED') !== 'true'
  const samplingRatio = options?.samplingRatio ||
    Number(Deno.env.get('OTEL_SAMPLING_RATIO') || '1.0')
  const exporterType = options?.exporterType ||
    Deno.env.get('OTEL_EXPORTER_TYPE') || 'console'
  const exporterEndpoint = options?.exporterEndpoint ||
    Deno.env.get('OTEL_EXPORTER_ENDPOINT')

  // Set environment variables if provided in options
  if (options?.serviceName) {
    Deno.env.set('OTEL_SERVICE_NAME', options.serviceName)
  }

  if (options?.enabled === false) {
    Deno.env.set('OTEL_SDK_DISABLED', 'true')
  }

  if (options?.samplingRatio !== undefined) {
    Deno.env.set('OTEL_SAMPLING_RATIO', String(options.samplingRatio))
  }

  if (!enabled) {
    logger.warn('Telemetry is disabled. Set enabled=true to enable.')
    return
  }

  logger.info(`Initializing telemetry for service: ${serviceName}`, {
    enabled,
    samplingRatio,
    exporterType,
    exporterEndpoint: exporterEndpoint || '(none)',
  })

  // In a real implementation, we would dynamically import and configure
  // the appropriate SDK components based on the options
}

// Export all telemetry and logger functions and types
export {
  createContextWithSpan,
  createSpan,
  extractTraceContext,
  getCurrentContext,
  getTracer,
  initTelemetry,
  Logger,
  TRACE_PARENT_HEADER,
  TRACE_STATE_HEADER,
  withContext,
  withSpan,
}

export type { LogData, LoggerConfig, LogLevelName, TelemetryOptions }
