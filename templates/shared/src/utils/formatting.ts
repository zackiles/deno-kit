/**
 * @module formatting
 *
 * Provides utility functions for text formatting, string manipulation, and terminal output styling.
 *
 * This module contains functions for common formatting tasks like:
 * - Text truncation and wrapping
 * - Number, date, and file size formatting
 * - Terminal output styling (stripping ANSI codes, indentation)
 * - Table and error formatting
 *
 * @example
 * ```ts
 * import { truncate, formatFileSize, wrapText } from "./formatting.ts"
 *
 * // Truncate long text
 * const shortened = truncate("This is a very long string", 10) // "This is..."
 *
 * // Format file size
 * const readableSize = formatFileSize(1024 * 1024) // "1 MB"
 *
 * // Wrap text to specific width
 * const wrapped = wrapText("Long paragraph that needs to be wrapped", 20)
 * ```
 */

import { stripAnsiCode } from '@std/fmt/colors'

/**
 * Truncate a string to a maximum length
 * @param text - The string to truncate
 * @param maxLength - Maximum length of the returned string
 * @param suffix - String to append to truncated text
 * @returns Truncated string
 */
function truncate(text: string, maxLength: number, suffix = '...'): string {
  if (!text || text.length <= maxLength) {
    return text
  }

  return text.substring(0, maxLength - suffix.length) + suffix
}

/**
 * Format a number with commas as thousands separators
 * @param num - Number to format
 * @returns Formatted number string with commas
 */
function formatNumber(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * Format a date to ISO string without milliseconds
 * @param date - Date to format
 * @returns ISO date string without milliseconds
 */
function formatDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * Format a file size in bytes to a human-readable string
 * @param bytes - Size in bytes
 * @returns Human-readable size string (e.g., "4.2 MB")
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'

  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))

  return `${Number.parseFloat((bytes / (1024 ** i)).toFixed(2))} ${sizes[i]}`
}

/**
 * Format a duration in milliseconds to a human-readable string
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string (e.g., "5m 30s")
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  }

  const seconds = Math.floor(ms / 1000)

  if (seconds < 60) {
    return `${seconds}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (hours < 24) {
    return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`
  }

  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24

  return `${days}d ${remainingHours}h ${remainingMinutes}m`
}

/**
 * Indent a string with a specified number of spaces
 * @param text - Text to indent
 * @param spaces - Number of spaces to indent with
 * @returns Indented string
 */
function indent(text: string, spaces = 2): string {
  const indentation = ' '.repeat(spaces)
  return text.split('\n').map((line) => indentation + line).join('\n')
}

/**
 * Strip ANSI escape codes from a string
 * @param text - Text containing ANSI escape codes
 * @returns Clean text without ANSI codes
 */
function stripAnsi(text: string): string {
  return stripAnsiCode(text)
}

/**
 * Wrap text to a specified width
 * @param text - Text to wrap
 * @param width - Maximum width of each line
 * @returns Text with line breaks added to respect width
 */
function wrapText(text: string, width = 80): string {
  const lines = text.split('\n')
  return lines.map((line) => {
    if (line.length <= width) {
      return line
    }

    const wrappedLines = []
    let currentLine = ''

    const words = line.split(' ')
    for (const word of words) {
      if ((currentLine + word).length <= width) {
        currentLine += (currentLine ? ' ' : '') + word
      } else {
        if (currentLine) {
          wrappedLines.push(currentLine)
        }

        currentLine = word.length > width ? word.substring(0, width) : word

        if (word.length > width) {
          let remaining = word.substring(width)
          while (remaining.length > 0) {
            wrappedLines.push(remaining.substring(0, width))
            remaining = remaining.substring(width)
          }
        }
      }
    }

    if (currentLine) {
      wrappedLines.push(currentLine)
    }

    return wrappedLines.join('\n')
  }).join('\n')
}

/**
 * Pad a string to a fixed width
 * @param text - Text to pad
 * @param width - Desired width
 * @param padChar - Character to use for padding
 * @param padRight - Whether to pad on the right side (true) or left side (false)
 * @returns Padded string
 */
function padString(
  text: string,
  width: number,
  padChar = ' ',
  padRight = true,
): string {
  if (text.length >= width) {
    return text
  }

  const padding = padChar.repeat(width - text.length)
  return padRight ? text + padding : padding + text
}

/**
 * Center a string within a fixed width
 * @param text - Text to center
 * @param width - Desired width
 * @param padChar - Character to use for padding
 * @returns Centered string
 */
function centerString(text: string, width: number, padChar = ' '): string {
  if (text.length >= width) {
    return text
  }

  const leftPadding = Math.floor((width - text.length) / 2)
  const rightPadding = width - text.length - leftPadding

  return padChar.repeat(leftPadding) + text + padChar.repeat(rightPadding)
}

/**
 * Create a simple text table
 * @param rows - Array of row data (each row is an array of cell values)
 * @param headers - Optional header row
 * @returns Formatted text table
 */
function createTextTable(rows: string[][], headers?: string[]): string {
  if (rows.length === 0) {
    return ''
  }

  // Add headers as first row if provided
  const allRows = headers ? [headers, ...rows] : rows

  // Calculate column widths
  const columnWidths: number[] = []

  for (const row of allRows) {
    for (let i = 0; i < row.length; i++) {
      const cellWidth = String(row[i]).length

      if (!columnWidths[i] || cellWidth > columnWidths[i]) {
        columnWidths[i] = cellWidth
      }
    }
  }

  // Format rows
  const formattedRows = allRows.map((row) => {
    return row.map((cell, i) => padString(String(cell), columnWidths[i])).join(
      ' | ',
    )
  })

  // Add separator after headers if provided
  if (headers) {
    const separator = columnWidths.map((width) => '-'.repeat(width)).join(
      '-+-',
    )
    formattedRows.splice(1, 0, separator)
  }

  return formattedRows.join('\n')
}

/**
 * Format a key-value object as a string
 * @param obj - Object with key-value pairs
 * @param options - Formatting options
 * @returns Formatted string
 */
function formatKeyValue(obj: Record<string, unknown>, options: {
  indent?: number
  keyValueSeparator?: string
  includeEmpty?: boolean
} = {}): string {
  const {
    indent = 0,
    keyValueSeparator = ': ',
    includeEmpty = false,
  } = options

  const indentation = ' '.repeat(indent)
  const lines: string[] = []

  for (const [key, value] of Object.entries(obj)) {
    if (
      !includeEmpty && (value === undefined || value === null || value === '')
    ) {
      continue
    }

    const valueStr = typeof value === 'object' && value !== null
      ? JSON.stringify(value)
      : String(value)

    lines.push(`${indentation}${key}${keyValueSeparator}${valueStr}`)
  }

  return lines.join('\n')
}

/**
 * Convert camelCase to Title Case
 * @param text - camelCase text to convert
 * @returns Title Case text
 */
function camelToTitleCase(text: string): string {
  if (!text) return text

  // Insert a space before all uppercase letters
  const spaceSeparated = text.replace(/([A-Z])/g, ' $1')

  // Capitalize the first letter
  return spaceSeparated.charAt(0).toUpperCase() + spaceSeparated.slice(1)
}

/**
 * Format error details
 * @param error - Error object to format
 * @returns Detailed error information as string
 */
function formatErrorDetails(error: Error): string {
  let details = `Error: ${error.message}`

  if (error.stack) {
    details += `\nStack: ${error.stack.split('\n').slice(1).join('\n')}`
  }

  // Add any additional properties that might be present
  for (const key of Object.keys(error)) {
    if (!['name', 'message', 'stack'].includes(key)) {
      const value: unknown = (error as unknown as Record<string, unknown>)[key]
      if (typeof value !== 'undefined' && value !== null) {
        if (typeof value === 'object') {
          details += `\n${key}: ${JSON.stringify(value)}`
        } else {
          details += `\n${key}: ${value}`
        }
      }
    }
  }

  return details
}

export {
  camelToTitleCase,
  centerString,
  createTextTable,
  formatDate,
  formatDuration,
  formatErrorDetails,
  formatFileSize,
  formatKeyValue,
  formatNumber,
  indent,
  padString,
  stripAnsi,
  truncate,
  wrapText,
}
