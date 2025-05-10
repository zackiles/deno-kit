/**
 * @module logger.test
 * @description Tests for the logger utility
 */

import { assertEquals, assertStringIncludes } from '@std/assert'
import { assertSpyCalls, restore, spy } from '@std/testing/mock'
import { logger, LogLevel } from '../src/utils/logger.ts'

// Helper function to access private config
function getLoggerConfig() {
  // biome-ignore lint/complexity/useLiteralKeys: Accessing private property for testing
  return logger['config']
}

// Helpers to store and verify console output
const captureOutput = () => {
  const logs: string[] = []
  const originalConsole = {
    log: console.log,
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
  }

  console.log = (...args) => {
    logs.push(args.join(' '))
  }
  console.debug = (...args) => {
    logs.push(args.join(' '))
  }
  console.info = (...args) => {
    logs.push(args.join(' '))
  }
  console.warn = (...args) => {
    logs.push(args.join(' '))
  }
  console.error = (...args) => {
    logs.push(args.join(' '))
  }

  return {
    getLogs: () => [...logs],
    restore: () => {
      console.log = originalConsole.log
      console.debug = originalConsole.debug
      console.info = originalConsole.info
      console.warn = originalConsole.warn
      console.error = originalConsole.error
    },
  }
}

Deno.test('logger respects log level settings', () => {
  // Save original config
  const originalConfig = { ...getLoggerConfig() }

  try {
    // Test INFO level
    logger.setConfig({ level: LogLevel.INFO })

    // Set up spies for console methods
    const logSpy = spy(console, 'log')
    const debugSpy = spy(console, 'debug')
    const warnSpy = spy(console, 'warn')
    const errorSpy = spy(console, 'error')

    logger.debug('Debug message')
    logger.info('Info message')
    logger.log('Log message')
    logger.warn('Warn message')
    logger.error('Error message')

    assertSpyCalls(debugSpy, 0) // Debug should be skipped at INFO level
    assertSpyCalls(logSpy, 2) // info and log both use console.log
    assertSpyCalls(warnSpy, 1)
    assertSpyCalls(errorSpy, 1)

    // Restore spies
    restore()

    // Test ERROR level with new spies
    logger.setConfig({ level: LogLevel.ERROR })

    const logSpy2 = spy(console, 'log')
    const debugSpy2 = spy(console, 'debug')
    const warnSpy2 = spy(console, 'warn')
    const errorSpy2 = spy(console, 'error')

    logger.debug('Debug message')
    logger.info('Info message')
    logger.log('Log message')
    logger.warn('Warn message')
    logger.error('Error message')

    assertSpyCalls(debugSpy2, 0)
    assertSpyCalls(logSpy2, 0)
    assertSpyCalls(warnSpy2, 0)
    assertSpyCalls(errorSpy2, 1) // Only error should be shown
  } finally {
    // Restore original config and spies
    logger.setConfig(originalConfig)
    restore()
  }
})

Deno.test('logger includes logger name in output', () => {
  // Save original config
  const originalConfig = { ...getLoggerConfig() }

  const output = captureOutput()

  try {
    // Configure logger with specific name
    logger.setConfig({
      level: LogLevel.DEBUG,
      name: 'test-logger',
      colors: false,
    })

    logger.info('Test message')

    const logs = output.getLogs()
    assertStringIncludes(logs[0], '[test-logger]')
  } finally {
    // Restore console and logger config
    output.restore()
    logger.setConfig(originalConfig)
  }
})

Deno.test('logger includes timestamps when configured', () => {
  // Save original config
  const originalConfig = { ...getLoggerConfig() }

  const output = captureOutput()

  try {
    // Configure logger with timestamps enabled
    logger.setConfig({
      level: LogLevel.DEBUG,
      timestamp: true,
      colors: false,
    })

    logger.info('Test message')

    const logs = output.getLogs()
    // Check for ISO timestamp format
    const timestampRegex = /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
    assertEquals(timestampRegex.test(logs[0]), true)
  } finally {
    // Restore console and logger config
    output.restore()
    logger.setConfig(originalConfig)
  }
})

Deno.test('logger.setConfig updates config values', () => {
  // Save original config
  const originalConfig = { ...getLoggerConfig() }

  try {
    // Set up new config
    const testConfig = {
      level: LogLevel.ERROR,
      colors: false,
      timestamp: true,
      name: 'test-name',
    }

    logger.setConfig(testConfig)

    // Verify each property was updated
    assertEquals(getLoggerConfig().level, LogLevel.ERROR)
    assertEquals(getLoggerConfig().colors, false)
    assertEquals(getLoggerConfig().timestamp, true)
    assertEquals(getLoggerConfig().name, 'test-name')

    // Test partial update
    logger.setConfig({ level: LogLevel.DEBUG })
    assertEquals(getLoggerConfig().level, LogLevel.DEBUG)
    assertEquals(getLoggerConfig().name, 'test-name') // Should retain previous value
  } finally {
    // Restore original config
    logger.setConfig(originalConfig)
  }
})

Deno.test('logger.debug is shown only at DEBUG level', () => {
  // Save original config
  const originalConfig = { ...getLoggerConfig() }

  try {
    // Set INFO level (higher than DEBUG)
    logger.setConfig({ level: LogLevel.INFO })

    const debugSpy = spy(console, 'debug')
    logger.debug('Debug message')
    assertSpyCalls(debugSpy, 0)
    restore()

    // Set DEBUG level
    logger.setConfig({ level: LogLevel.DEBUG })

    const debugSpy2 = spy(console, 'debug')
    logger.debug('Debug message')
    assertSpyCalls(debugSpy2, 1)
    restore()

    // Verify output for debug message
    const output = captureOutput()
    try {
      logger.setConfig({ level: LogLevel.DEBUG, colors: false })
      logger.debug('Debug test')

      const logs = output.getLogs()
      assertStringIncludes(logs[0], 'Debug test')
    } finally {
      output.restore()
    }
  } finally {
    // Restore original config
    logger.setConfig(originalConfig)
  }
})
