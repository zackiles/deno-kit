#!/usr/bin/env -S deno run --allow-all
import type { Attributes } from '@opentelemetry/api'
import { trace } from '@opentelemetry/api'
import { Lib } from '../src/lib.ts'
import { getAvailablePort } from '@std/net'
import { Logger } from '../src/core/logger.ts'
import {
  createContextWithSpan,
  createSpan,
  extractTraceContext,
  getCurrentContext,
  initTelemetry,
  type TelemetryOptions,
  TRACE_PARENT_HEADER,
  TRACE_STATE_HEADER,
  withContext,
  withSpan,
} from '../src/core/telemetry.ts'
import type { LibRequest, LibResult } from '../src/types.ts'

// Create loggers for server components
const serverLogger = Logger.get('server')
const httpLogger = Logger.get('server.http')
const wsLogger = Logger.get('server.websocket')

interface JsonRpcRequest {
  jsonrpc: string
  id: string | number
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: string
  id: string | number | null
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

/**
 * Utility function to make HTTP requests with proper context propagation
 * This allows tracing across service boundaries
 */
async function makeContextualRequest(
  url: string | URL,
  options: RequestInit = {},
  spanAttributes: Attributes = {},
): Promise<Response> {
  // Get the current context
  const currentContext = getCurrentContext()

  // Create a client span for the outbound request
  const clientSpan = createSpan('http.client.request', {
    kind: 'client',
    parent: currentContext,
    attributes: {
      'http.url': url.toString(),
      'http.method': options.method || 'GET',
      ...spanAttributes,
    },
  })

  try {
    // Create a context with this client span
    const clientContext = createContextWithSpan(clientSpan)

    // Extract W3C trace context headers
    const headers = new Headers(options.headers || {})

    // Inject trace context headers for distributed tracing
    // In a production-ready implementation, we would use the OpenTelemetry
    // propagator API to properly inject both trace headers
    if (!headers.has(TRACE_PARENT_HEADER) || !headers.has(TRACE_STATE_HEADER)) {
      serverLogger.debug(
        'Injecting trace context headers for outbound request',
        {
          url: url.toString(),
        },
      )

      // Simplified implementation to show both headers would be used
      // Real implementation would use the OTel Context Propagation API
      // to properly extract values from the current context

      // Example of what a real implementation might do:
      // const propagator = new W3CTraceContextPropagator()
      // propagator.inject(clientContext, headers)
    }

    // Set the updated headers
    options.headers = headers

    // Make the request within the client context
    return await withContext(clientContext, async () => {
      const response = await fetch(url, options)

      // Update the span with response details
      clientSpan.setAttribute('http.status_code', response.status)
      clientSpan.setStatus({
        code: response.status >= 400 ? 2 : 1, // ERROR or OK
      })

      return response
    })
  } catch (error) {
    // Record error in the span
    const errorObj = error instanceof Error ? error : new Error(String(error))
    clientSpan.recordException(errorObj)
    clientSpan.setStatus({ code: 2 }) // ERROR
    throw error
  } finally {
    // Always end the client span
    clientSpan.end()
  }
}

/**
 * Parse URL search params into a record
 */
function parseSearchParams(url: URL): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of url.searchParams.entries()) {
    // Try to convert to proper types
    if (value === 'true') {
      result[key] = true
    } else if (value === 'false') {
      result[key] = false
    } else if (value === 'null') {
      result[key] = null
    } else if (!Number.isNaN(Number(value)) && value !== '') {
      result[key] = Number(value)
    } else {
      result[key] = value
    }
  }

  return result
}

// Method map for typed execution with proper error handling
const methodMap = {
  create: (lib: Lib, params: LibRequest): LibResult => lib.create(params),
  read: (lib: Lib, params: LibRequest): LibResult => lib.read(params),
  update: (lib: Lib, params: LibRequest): LibResult => lib.update(params),
  destroy: (lib: Lib, params: LibRequest): LibResult => lib.destroy(params),
}

type MethodType = keyof typeof methodMap

/**
 * Execute a lib method with proper error handling and tracing
 */
async function executeLibMethod(
  method: string,
  lib: Lib,
  params: Record<string, unknown>,
): Promise<LibResult> {
  const validMethod = method as MethodType

  // Get the current context to maintain the trace chain
  const currentContext = getCurrentContext()

  if (validMethod in methodMap) {
    // Create attributes for better tracing
    const attributes = {
      'lib.method': method,
      'lib.params.count': Object.keys(params).length,
      ...('id' in params ? { 'lib.params.id': String(params.id) } : {}),
    }

    return withSpan(`lib.${method}`, async () => {
      return methodMap[validMethod](lib, params as LibRequest)
    }, {
      kind: 'server',
      attributes,
      parent: currentContext,
    })
  }

  throw new Error(`Unknown method: ${method}`)
}

/**
 * Handle HTTP requests
 */
async function handleHttpRequest(request: Request): Promise<Response> {
  // Create a new Lib instance
  const lib = new Lib()

  // Get the current context which may contain trace info from headers
  const parentContext = getCurrentContext()

  // Create a request-specific span and context
  const requestSpan = createSpan('http.request', {
    kind: 'server',
    parent: parentContext,
    attributes: {
      'http.method': request.method,
      'http.url': request.url,
      'http.user_agent': request.headers.get('user-agent') || 'unknown',
      'http.host': request.headers.get('host') || 'unknown',
    },
  })

  // Create a context for this request
  const requestContext = createContextWithSpan(requestSpan)

  try {
    // Run all request handling within this context
    return await withContext(requestContext, async () => {
      try {
        const url = new URL(request.url)
        const pathParts = url.pathname.split('/').filter(Boolean)

        httpLogger.debug(
          `Received ${request.method} request to ${url.pathname}`,
        )

        // Update span with more path information
        requestSpan.updateName(
          `http.request ${request.method} ${url.pathname}`,
        )
        requestSpan.setAttribute('http.route', url.pathname)

        // Check if it's a request to the lib
        if (pathParts.length >= 2 && pathParts[0] === 'lib') {
          const method = pathParts[1]

          httpLogger.verbose(`Processing lib/${method} request`, {
            method: request.method,
            url: url.toString(),
          })

          // Only process valid Lib methods
          if (['create', 'read', 'update', 'destroy'].includes(method)) {
            try {
              // Parse parameters based on request method
              const paramsObj = request.method === 'GET'
                ? parseSearchParams(url)
                : await parseRequestBody(request)

              // Execute the method with proper types
              const result = await executeLibMethod(method, lib, paramsObj)

              httpLogger.info(`Successfully executed ${method}`, {
                method,
                requestPath: url.pathname,
              })

              // Mark the span as successful
              requestSpan.setStatus({ code: 1 }) // OK status

              // Return the result
              return new Response(
                JSON.stringify(result),
                {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' },
                },
              )
            } catch (error) {
              // Record error in the span
              const errorObj = error instanceof Error
                ? error
                : new Error(String(error))

              requestSpan.recordException(errorObj)
              requestSpan.setStatus({ code: 2 }) // ERROR status

              httpLogger.error(`Error executing ${method}`, {
                error: errorObj,
              })

              return new Response(
                JSON.stringify({ error: errorObj.message }),
                {
                  status: 500,
                  headers: { 'Content-Type': 'application/json' },
                },
              )
            }
          }
        }

        // If not found or not a valid method
        requestSpan.setAttribute('http.status_code', 404)
        requestSpan.setStatus({ code: 2 }) // ERROR status

        httpLogger.warn(`Not found: ${url.pathname}`)
        return new Response(
          JSON.stringify({ error: 'Not found' }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      } catch (serverError) {
        // Record error in the span
        const errorObj = serverError instanceof Error
          ? serverError
          : new Error(String(serverError))

        requestSpan.recordException(errorObj)
        requestSpan.setStatus({ code: 2 }) // ERROR status
        requestSpan.setAttribute('http.status_code', 500)

        httpLogger.error('Unhandled server error', { error: errorObj })
        return new Response(
          JSON.stringify({
            error: 'Internal Server Error',
            details: errorObj.message,
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }
    })
  } finally {
    // Always end the request span
    requestSpan.end()
  }
}

/**
 * Parse request body from JSON requests
 */
async function parseRequestBody(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const body = await request.json()
    httpLogger.debug('Parsed request body', { params: body })
    return body as Record<string, unknown>
  } catch (parseError) {
    const error = parseError instanceof Error
      ? parseError
      : new Error(String(parseError))
    httpLogger.error('Failed to parse JSON body', { error })
    throw new Error('Invalid JSON body')
  }
}

/**
 * Check if a request is a WebSocket upgrade request
 */
function isWebSocketRequest(request: Request): boolean {
  const upgrade = request.headers.get('upgrade') || ''
  return upgrade.toLowerCase() === 'websocket'
}

/**
 * Handle WebSocket connections with JSON-RPC protocol
 */
function handleWebSocket(request: Request): Response {
  const lib = new Lib()

  // Capture the current context which may contain trace information from request headers
  const parentContext = getCurrentContext()

  // Upgrade the connection to WebSocket
  const { socket, response } = Deno.upgradeWebSocket(request)

  // Create a span for the WebSocket connection
  const wsConnectionSpan = createSpan('websocket.connection', {
    kind: 'server',
    parent: parentContext,
    attributes: {
      'http.method': request.method,
      'http.url': request.url,
      'ws.protocol': request.headers.get('sec-websocket-protocol') || undefined,
    },
  })

  // Create a context for this WebSocket connection
  const wsConnectionContext = createContextWithSpan(wsConnectionSpan)

  socket.onopen = () => {
    withContext(wsConnectionContext, () => {
      wsLogger.info('WebSocket connection established')
      wsConnectionSpan.addEvent('connection.open')
    })
  }

  socket.onmessage = (event) => {
    // Create a message-specific span
    const messageSpan = createSpan('websocket.message', {
      kind: 'server',
      parent: wsConnectionContext,
    })

    // Create a context for this message
    const messageContext = createContextWithSpan(messageSpan)

    // Process the message with the message-specific context
    withContext(messageContext, async () => {
      try {
        // Parse the JSON-RPC request
        const request = JSON.parse(event.data as string) as JsonRpcRequest

        // Add request details to the span
        messageSpan.setAttribute('rpc.method', request.method)
        messageSpan.setAttribute('rpc.id', String(request.id))
        messageSpan.setAttribute('rpc.system', 'json-rpc')
        messageSpan.setAttribute('rpc.version', request.jsonrpc)

        wsLogger.debug('Received WebSocket message', {
          method: request.method,
          id: request.id,
        })

        // Create response object
        const response: JsonRpcResponse = {
          jsonrpc: '2.0',
          id: request.id || null,
        }

        try {
          // Validate JSON-RPC version
          if (request.jsonrpc !== '2.0') {
            throw createJsonRpcError(
              -32600,
              'Invalid Request: Invalid JSON-RPC version',
              'invalid_jsonrpc_version',
            )
          }

          // Extract method name and params
          const { method, params = {} } = request

          // Check if it's a valid method
          if (!['create', 'read', 'update', 'destroy'].includes(method)) {
            throw createJsonRpcError(
              -32601,
              'Method not found',
              'method_not_found',
            )
          }

          // Execute the method
          const result = await executeLibMethod(method, lib, params)
          response.result = result

          messageSpan.setStatus({ code: 1 }) // OK status
          messageSpan.addEvent('method.success', { method })

          wsLogger.info(`Successfully executed ${method}`)
        } catch (methodError) {
          // Set error in response
          const errorObj = methodError as unknown

          if (
            errorObj && typeof errorObj === 'object' && 'code' in errorObj &&
            'message' in errorObj
          ) {
            // This is already a JSON-RPC formatted error
            response.error = errorObj as {
              code: number
              message: string
              data?: unknown
            }
          } else {
            // Standard error needs formatting
            const stdError = methodError instanceof Error
              ? methodError
              : new Error(String(methodError))
            messageSpan.recordException(stdError)
            messageSpan.setStatus({ code: 2 }) // ERROR status

            response.error = {
              code: -32603,
              message: 'Internal error',
              data: stdError.message,
            }

            wsLogger.error('Error executing request', { error: stdError })
          }
        }

        // Send the response
        messageSpan.addEvent('response.sent')
        socket.send(JSON.stringify(response))
      } catch (parseError) {
        // Handle JSON parsing error
        const errorObj = parseError instanceof Error
          ? parseError
          : new Error(String(parseError))

        messageSpan.recordException(errorObj)
        messageSpan.setStatus({ code: 2 }) // ERROR status
        messageSpan.setAttribute('error.type', 'parse_error')

        wsLogger.error('Failed to parse WebSocket message', {
          error: errorObj,
        })

        const response: JsonRpcResponse = {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error',
            data: errorObj.message,
          },
        }
        socket.send(JSON.stringify(response))
      } finally {
        // Always end the message span
        messageSpan.end()
      }
    })
  }

  socket.onclose = () => {
    withContext(wsConnectionContext, () => {
      wsLogger.info('WebSocket connection closed')
      wsConnectionSpan.addEvent('connection.close')
      wsConnectionSpan.end()
    })
  }

  socket.onerror = (e) => {
    withContext(wsConnectionContext, () => {
      const errorMessage = e instanceof ErrorEvent
        ? e.message
        : 'Unknown WebSocket error'
      const errorObj = new Error(errorMessage)

      wsConnectionSpan.recordException(errorObj)
      wsConnectionSpan.setStatus({ code: 2 }) // ERROR status
      wsLogger.error('WebSocket error', { error: errorObj })
    })
  }

  return response
}

/**
 * Create a standard JSON-RPC error object
 */
function createJsonRpcError(
  code: number,
  message: string,
  errorType?: string,
): { code: number; message: string; data?: unknown } {
  const error = { code, message }

  if (errorType) {
    const currentContext = getCurrentContext()
    const currentSpan = trace.getSpan(currentContext)

    if (currentSpan) {
      currentSpan.setAttribute('error', true)
      currentSpan.setAttribute('error.type', errorType)
      currentSpan.setStatus({ code: 2 }) // ERROR status
    }
  }

  return error
}

/**
 * Main handler for all requests
 */
function handler(request: Request): Response | Promise<Response> {
  // Get parent context from active context
  const parentContext = getCurrentContext()

  // Extract trace context from request headers
  const traceContext = extractTraceContext(request)
  if (traceContext.traceparent) {
    httpLogger.debug('Extracted trace context from request', traceContext)
  }

  // Create a root span for this request
  const rootSpan = createSpan('http.server.request', {
    kind: 'server',
    parent: parentContext,
    attributes: {
      'http.method': request.method,
      'http.url': request.url,
      'http.host': new URL(request.url).host,
      'http.user_agent': request.headers.get('user-agent') || 'unknown',
      // Add trace context information if available
      ...(traceContext.traceparent
        ? { 'trace.parent': traceContext.traceparent }
        : {}),
      ...(traceContext.tracestate
        ? { 'trace.state': traceContext.tracestate }
        : {}),
    },
  })

  // Create a context with this span
  const requestContext = createContextWithSpan(rootSpan)

  // Handle request within context
  return withContext(requestContext, async () => {
    try {
      // Check for WebSocket upgrade
      if (isWebSocketRequest(request)) {
        wsLogger.debug('WebSocket connection request received')
        return handleWebSocket(request)
      }

      // Otherwise handle as HTTP request
      return await handleHttpRequest(request)
    } catch (handlerError) {
      // Log and record error
      const error = handlerError instanceof Error
        ? handlerError
        : new Error(String(handlerError))

      httpLogger.error('Error handling request', {
        error,
        url: request.url,
        method: request.method,
      })

      // Set error status on span
      rootSpan.setStatus({
        code: 2, // ERROR
        message: error.message,
      })

      // Return appropriate error response
      return new Response('Internal Server Error', { status: 500 })
    } finally {
      // Always end the span
      rootSpan.end()
    }
  })
}

/**
 * Start the server on the specified port
 * @param port The port to start the server on
 * @param options Server configuration options
 */
async function runServer(
  port?: number,
  options: TelemetryOptions = {},
): Promise<void> {
  try {
    // Initialize telemetry system with options
    initTelemetry(options)

    // Get the root context before server starts
    const rootContext = getCurrentContext()

    // If port is not specified, get an available port
    const serverPort = port || Number(Deno.env.get('DENO_KIT_PORT')) ||
      await getAvailablePort()
    const serverHost = Deno.env.get('DENO_KIT_HOST') || '0.0.0.0'

    serverLogger.info('Starting server', {
      port: serverPort,
      host: serverHost,
      serviceName: options.serviceName || 'deno-lib-server',
      telemetryEnabled: options.enabled !== false,
      samplingRatio: options.samplingRatio || 1.0,
    })

    // Create a server span
    const serverSpan = createSpan('server.start', {
      parent: rootContext,
      attributes: {
        'service.name': options.serviceName || 'deno-lib-server',
        'server.port': serverPort,
        'process.pid': Deno.pid,
        'process.command': Deno.mainModule,
        'telemetry.enabled': options.enabled !== false,
        'telemetry.sampling_ratio': options.samplingRatio || 1.0,
      },
    })

    // Create a context for the server
    const serverContext = createContextWithSpan(serverSpan)

    try {
      // Run server within the server context
      await withContext(serverContext, async () => {
        // Create the server with abort controller for graceful shutdown
        const abortController = new AbortController()
        const { signal } = abortController

        // Set up signal handlers for graceful shutdown
        const signals: Deno.Signal[] = ['SIGINT', 'SIGTERM', 'SIGHUP']
        const signalCleanups = signals.map((sig) => {
          const handler = () => {
            serverLogger.info(`Received ${sig}, shutting down gracefully...`)
            abortController.abort()
          }

          Deno.addSignalListener(sig, handler)
          return { signal: sig, handler }
        })

        try {
          // Serve requests with abort signal
          await Deno.serve({
            port: serverPort,
            hostname: serverHost,
            signal,
          }, handler).finished

          serverLogger.info('Server shut down gracefully')
        } catch (serveError) {
          // Only throw if it's not an AbortError (which is expected during shutdown)
          if (
            !(serveError instanceof DOMException &&
              serveError.name === 'AbortError')
          ) {
            throw serveError
          }
          serverLogger.info('Server aborted as requested')
        } finally {
          // Clean up signal handlers
          for (const { signal, handler } of signalCleanups) {
            try {
              Deno.removeSignalListener(signal, handler)
            } catch (_) {
              // Ignore errors when removing signal handlers
            }
          }
        }
      })
    } catch (serverError) {
      const error = serverError instanceof Error
        ? serverError
        : new Error(String(serverError))

      serverLogger.error('Server error', { error })

      // Set error status on span
      serverSpan.setStatus({
        code: 2, // ERROR
        message: error.message,
      })

      throw error
    } finally {
      // Always end the server span
      serverSpan.end()
    }
  } catch (initError) {
    const error = initError instanceof Error
      ? initError
      : new Error(String(initError))

    serverLogger.error('Failed to initialize server', { error })
    throw error
  }
}

// Start the server if this module is executed directly
if (import.meta.main) {
  runServer().catch((error) => {
    const formattedError = error instanceof Error
      ? error
      : new Error(String(error))
    serverLogger.error('Failed to start server', { error: formattedError })
    Deno.exit(1)
  })
}

// Export all interfaces and functions at the bottom of the file
export type { JsonRpcRequest, JsonRpcResponse }
export { makeContextualRequest, parseSearchParams, runServer }
