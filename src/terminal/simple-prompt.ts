/**
 * @module simple-prompt
 * @description Simple, reliable prompt system for terminal interactions
 *
 * Features:
 * - Filters out ANSI escape sequences (arrow keys, etc.) to prevent terminal corruption
 * - Number-based selection for options (1, 2, 3, etc.)
 * - First-letter matching for quick selection
 * - Proper error handling and validation
 * - No complex raw mode or terminal state management
 *
 * Usage:
 * - For select prompts: Type numbers (1-N) or first letters of options
 * - For text prompts: Type your response and press Enter
 * - For confirm prompts: Type y/n, yes/no, or press Enter for default
 */

import { terminal } from './mod.ts'
import type { BaseOption } from './prompt-select.ts'

export interface SimplePromptConfig {
  message: string
  options?: BaseOption[]
  default?: string
  type?: 'select' | 'text' | 'confirm'
}

class SimplePrompt {
  private originalSetRaw = false

  async ask(config: SimplePromptConfig): Promise<string> {
    try {
      this.originalSetRaw = Deno.stdin.isTerminal()

      if (config.type === 'select' && config.options) {
        return await this.selectPrompt(
          config.message,
          config.options,
          config.default,
        )
      } else if (config.type === 'confirm') {
        return await this.confirmPrompt(
          config.message,
          config.default === 'true',
        )
      } else {
        return await this.textPrompt(config.message, config.default || '')
      }
    } catch (error) {
      this.cleanup()
      throw error
    }
  }

  private async selectPrompt(
    message: string,
    options: BaseOption[],
    defaultValue?: string,
  ): Promise<string> {
    terminal.print(`${terminal.green('❯')} ${message}`)

    // Display options with numbers
    for (let i = 0; i < options.length; i++) {
      const option = options[i]
      const prefix = option.value === defaultValue ? '●' : '○'
      terminal.print(`  ${i + 1}. ${prefix} ${option.label}`)
    }

    terminal.print(
      terminal.dim(
        `\nEnter the number (1-${options.length}) or press Enter for default:`,
      ),
    )

    let selectedIndex = defaultValue
      ? options.findIndex((opt) => opt.value === defaultValue)
      : 0

    if (selectedIndex < 0) selectedIndex = 0

    while (true) {
      const input = await this.readUserInput('')

      // If empty input, use default
      if (input.trim() === '') {
        return options[selectedIndex].value
      }

      // Try to parse as number
      const optionNum = Number.parseInt(input.trim())
      if (optionNum >= 1 && optionNum <= options.length) {
        return options[optionNum - 1].value
      }

      // Try to match by first letter
      const byFirstLetter = options.find((opt) =>
        opt.label.toLowerCase().startsWith(input.toLowerCase())
      )
      if (byFirstLetter) {
        return byFirstLetter.value
      }

      // Invalid input - ask again
      terminal.print(
        terminal.red(
          `Invalid option "${input}". Please enter a number between 1 and ${options.length}:`,
        ),
      )
    }
  }

  private async confirmPrompt(
    message: string,
    defaultValue = false,
  ): Promise<string> {
    const defaultText = defaultValue ? 'Y/n' : 'y/N'

    while (true) {
      const input = await this.readUserInput(`${message} (${defaultText}): `)

      if (input.trim() === '') {
        return defaultValue ? 'true' : 'false'
      }

      const response = input.toLowerCase().trim()
      if (response === 'y' || response === 'yes') {
        return 'true'
      } else if (response === 'n' || response === 'no') {
        return 'false'
      }

      terminal.print(terminal.red('Please enter y, n, yes, or no:'))
    }
  }

  private async textPrompt(
    message: string,
    defaultValue: string,
  ): Promise<string> {
    const defaultText = defaultValue ? ` [${defaultValue}]` : ''
    const input = await this.readUserInput(`${message}${defaultText}: `)

    return input.trim() || defaultValue
  }

  private async readUserInput(prompt: string): Promise<string> {
    if (prompt) {
      terminal.print(prompt)
    }

    // Simple stdin reading without raw mode
    const buf = new Uint8Array(1024)
    const n = await Deno.stdin.read(buf)

    if (n === null) {
      throw new Error('Failed to read input')
    }

    const input = new TextDecoder().decode(buf.subarray(0, n))

    // Filter out ANSI escape sequences (arrow keys, etc.)
    const filteredInput = this.filterAnsiEscapeSequences(input)

    return filteredInput.replace(/\r?\n$/, '') // Remove trailing newline
  }

  // Filter out ANSI escape sequences to prevent arrow key garbage
  private filterAnsiEscapeSequences(input: string): string {
    // Remove ANSI escape sequences like ESC[A, ESC[B, ESC[C, ESC[D (arrow keys)
    // and other escape sequences that start with ESC[
    const ESC = '\u001b' // Escape character
    return input.replace(new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`, 'g'), '')
      .replace(new RegExp(`${ESC}\\[[0-9;]*~`, 'g'), '') // Handle sequences ending with ~
      .replace(new RegExp(`${ESC}O[A-Za-z]`, 'g'), '') // Handle O-style sequences
      .replace(new RegExp(`${ESC}\\]`, 'g'), '') // Handle other escape sequences
  }

  private cleanup(): void {
    // Simple cleanup - just ensure we're out of any special modes
    try {
      if (Deno.stdin.isTerminal()) {
        Deno.stdin.setRaw(false)
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

export const simplePrompt = new SimplePrompt()
