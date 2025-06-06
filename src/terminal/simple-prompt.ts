/**
 * @module interactive-prompt
 * @description Interactive prompt system with arrow key navigation
 */

import { ANSI_CODES } from './constants.ts'
import { terminal } from './mod.ts'
import type { BaseOption } from './prompts/prompt.ts'

export interface SimplePromptConfig {
  message: string
  options?: BaseOption[]
  defaultValue?: string
  type?: 'select' | 'text' | 'confirm'
  clearBefore?: boolean
  clearAfter?: boolean
}

class SimplePrompt {
  isRawMode = false
  private lastRenderedLines = 0

  async ask(config: SimplePromptConfig): Promise<string> {
    try {
      if (config.type === 'select' && config.options) {
        return await this.selectPrompt(
          config.message,
          config.options,
          config.defaultValue,
          config.clearBefore ?? false,
          config.clearAfter ?? false,
        )
      } else if (config.type === 'confirm') {
        return await this.confirmPrompt(
          config.message,
          config.defaultValue === 'true',
          config.clearBefore ?? false,
          config.clearAfter ?? false,
        )
      } else {
        return await this.textPrompt(
          config.message,
          config.defaultValue || '',
          config.clearBefore ?? false,
          config.clearAfter ?? false,
        )
      }
    } catch (error) {
      await this.cleanup(config.clearAfter ?? false)
      throw error
    }
  }

  private async selectPrompt(
    message: string,
    options: BaseOption[],
    defaultValue?: string,
    clearBefore = false,
    clearAfter = false,
  ): Promise<string> {
    let selectedIndex = defaultValue
      ? options.findIndex((opt) => opt.value === defaultValue)
      : 0

    if (selectedIndex < 0) selectedIndex = 0

    terminal.setRaw(true)

    if (clearBefore) {
      await terminal.write(ANSI_CODES.CURSOR_HOME + ANSI_CODES.CLEAR_SCREEN)
    }

    while (true) {
      await this.renderSelectOptions(
        message,
        options,
        selectedIndex,
        clearBefore,
      )

      const key = await this.readSingleKey()

      if (key === 'ArrowUp' && selectedIndex > 0) {
        selectedIndex--
      } else if (key === 'ArrowDown' && selectedIndex < options.length - 1) {
        selectedIndex++
      } else if (key === 'Enter') {
        await this.cleanup(clearAfter)
        return options[selectedIndex].value
      } else if (key === 'Escape') {
        await this.cleanup(clearAfter)
        throw new Error('Prompt was cancelled')
      } else if (key >= '1' && key <= '9') {
        const num = Number.parseInt(key) - 1
        if (num >= 0 && num < options.length) {
          selectedIndex = num
        }
      } else if (key === 'q' || key === 'Q') {
        await this.cleanup(clearAfter)
        throw new Error('Prompt was cancelled')
      }
    }
  }

  private async confirmPrompt(
    message: string,
    defaultValue = false,
    clearBefore = false,
    clearAfter = false,
  ): Promise<string> {
    if (clearBefore) {
      await terminal.write(ANSI_CODES.CURSOR_HOME + ANSI_CODES.CLEAR_SCREEN)
    }

    await terminal.write(
      `${terminal.green('❯')} ${message} (${defaultValue ? 'Y/n' : 'y/N'}): `,
    )

    terminal.setRaw(true)

    while (true) {
      const key = await this.readSingleKey()

      if (key === 'Enter') {
        await this.cleanup(clearAfter)
        await terminal.write('\n')
        return defaultValue ? 'true' : 'false'
      } else if (key === 'y' || key === 'Y') {
        await this.cleanup(clearAfter)
        await terminal.write('y\n')
        return 'true'
      } else if (key === 'n' || key === 'N') {
        await this.cleanup(clearAfter)
        await terminal.write('n\n')
        return 'false'
      } else if (key === 'Escape' || key === 'q' || key === 'Q') {
        await this.cleanup(clearAfter)
        throw new Error('Prompt was cancelled')
      }
    }
  }

  private async textPrompt(
    message: string,
    defaultValue: string,
    clearBefore = false,
    clearAfter = false,
  ): Promise<string> {
    if (clearBefore) {
      await terminal.write(ANSI_CODES.CURSOR_HOME + ANSI_CODES.CLEAR_SCREEN)
    }

    const defaultText = defaultValue ? ` [${defaultValue}]` : ''
    await terminal.write(`${message}${defaultText}: `)

    const buf = new Uint8Array(1024)
    const n = await Deno.stdin.read(buf)

    if (n === null) {
      throw new Error('Failed to read input')
    }

    const input = new TextDecoder().decode(buf.subarray(0, n))
    const result = input.replace(/\r?\n$/, '').trim() || defaultValue

    if (clearAfter) {
      await terminal.write(ANSI_CODES.CURSOR_HOME + ANSI_CODES.CLEAR_SCREEN)
    }

    return result
  }

  private async renderSelectOptions(
    message: string,
    options: BaseOption[],
    selectedIndex: number,
    clearBefore = false,
  ): Promise<void> {
    if (this.lastRenderedLines > 0 && !clearBefore) {
      await terminal.write(`\x1b[${this.lastRenderedLines}A`)
      await terminal.write(ANSI_CODES.CLEAR_FROM_CURSOR_DOWN)
    }

    const totalLines = 1 + options.length + 1 + 1
    this.lastRenderedLines = totalLines

    await terminal.write(`${terminal.green('❯')} ${message}\n`)

    for (let i = 0; i < options.length; i++) {
      const option = options[i]
      const isSelected = i === selectedIndex
      const pointer = isSelected ? terminal.green('●') : terminal.dim('○')
      const optionText = isSelected
        ? terminal.green(option.label)
        : option.label

      await terminal.write(`  ${i + 1}. ${pointer} ${optionText}\n`)
    }

    await terminal.write(
      `\n${
        terminal.dim(
          `Use ↑/↓ arrows or numbers 1-${options.length}, Enter to select, Esc/q to cancel`,
        )
      }\n`,
    )
  }

  private async cleanup(clearAfter = false): Promise<void> {
    this.lastRenderedLines = 0

    if (terminal.isRaw) {
      try {
        await terminal.write(ANSI_CODES.CURSOR_SHOW)

        if (Deno.stdin.isTerminal()) {
          terminal.setRaw(false)
        }
        terminal.isRaw = false
      } catch (error) {
        terminal.error('Cleanup error:', error)
      }
      if (clearAfter) {
        await terminal.write(ANSI_CODES.CURSOR_HOME + ANSI_CODES.CLEAR_SCREEN)
      }
    }
  }

  private async readSingleKey(): Promise<string> {
    const buffer = new Uint8Array(8)
    const bytesRead = await Deno.stdin.read(buffer)

    if (!bytesRead) {
      throw new Error('Failed to read input')
    }

    const data = buffer.slice(0, bytesRead)

    // Handle common key sequences
    if (data.length === 1) {
      const char = String.fromCharCode(data[0])

      // Handle control characters
      if (data[0] === 13) return 'Enter'
      if (data[0] === 27) return 'Escape'
      if (data[0] === 3) {
        // Use graceful shutdown for Ctrl+C instead of throwing
        await this.cleanup()
        const { gracefulShutdown } = await import(
          '../utils/graceful-shutdown.ts'
        )
        await gracefulShutdown.shutdown(false, 130)
        return 'Escape' // This won't actually be reached due to Deno.exit()
      }

      return char
    }

    // Handle escape sequences (arrow keys)
    if (data.length === 3 && data[0] === 27 && data[1] === 91) {
      switch (data[2]) {
        case 65:
          return 'ArrowUp'
        case 66:
          return 'ArrowDown'
        case 67:
          return 'ArrowRight'
        case 68:
          return 'ArrowLeft'
      }
    }

    // Handle other sequences - just ignore them
    return ''
  }
}

export const simple = new SimplePrompt()
