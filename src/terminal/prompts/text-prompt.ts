/**
 * @module text-prompt
 * @description TextPrompt class for text and password input prompts
 */

import {
  BasePrompt,
  type KeyEvent,
  type MouseEvent,
  type PromptState,
  type TextPromptConfig,
} from './prompt.ts'

class TextPrompt extends BasePrompt {
  protected initializeState(): PromptState {
    const config = this.config as TextPromptConfig
    return {
      value: config.defaultValue || '',
      selectedIndex: 0,
      selectedIndices: [],
      searchQuery: '',
      page: 0,
      isLoading: false,
      error: null,
      cursor: 0,
      showHelp: false,
      isDone: false,
      cursorPosition: (config.defaultValue || '').length,
      cursorVisible: true,
    }
  }

  protected render(): string[] {
    const lines: string[] = []
    const config = this.config as TextPromptConfig

    if (this.state.isDone) {
      const value = this.state.value as string
      const displayValue = config.type === 'password'
        ? '*'.repeat(value.length)
        : value || '(empty)'
      lines.push(
        `${this.formatMessage()} ${this.theme.colors.success(displayValue)}`,
      )
      return lines
    }

    lines.push(this.formatMessage())

    if (this.state.error) {
      lines.push(this.formatError())
    }

    const value = this.state.value as string
    const placeholder = config.placeholder || 'Enter text...'

    let displayValue: string
    if (value) {
      if (this.config.type === 'password') {
        const maskedValue = '•'.repeat(value.length)
        displayValue = this.theme.colors.inputText(
          this.insertCursorInText(maskedValue, this.state.cursorPosition),
        )
      } else {
        displayValue = this.theme.colors.inputText(
          this.insertCursorInText(value, this.state.cursorPosition),
        )
      }
    } else {
      const placeholderText = this.theme.colors.disabled(placeholder)
      displayValue = this.insertCursorInText(placeholderText, 0)
    }

    lines.push(
      `  ${this.theme.colors.secondary(this.theme.pointer)} ${displayValue}`,
    )

    if (config.maxLength) {
      const count = `${value.length}/${config.maxLength}`
      lines.push(`  ${this.theme.colors.disabled(count)}`)
    }

    if (this.state.showHelp) {
      lines.push('')
      lines.push(this.formatHelp())
    }

    return lines
  }

  public onKeyEvent(event: KeyEvent): void {
    if (event.type !== 'press') return

    const config = this.config as TextPromptConfig
    const value = this.state.value as string

    switch (event.key) {
      case 'Enter':
        this.handleSubmit()
        break
      case 'Escape':
        this.emit('cancel')
        break
      case 'Backspace':
        if (this.state.cursorPosition > 0) {
          const beforeCursor = value.slice(0, this.state.cursorPosition - 1)
          const afterCursor = value.slice(this.state.cursorPosition)
          this.state.value = beforeCursor + afterCursor
          this.state.cursorPosition--
        }
        break
      case 'Delete':
        if (this.state.cursorPosition < value.length) {
          const beforeCursor = value.slice(0, this.state.cursorPosition)
          const afterCursor = value.slice(this.state.cursorPosition + 1)
          this.state.value = beforeCursor + afterCursor
        }
        break
      case 'ArrowLeft':
        this.state.cursorPosition = Math.max(0, this.state.cursorPosition - 1)
        break
      case 'ArrowRight':
        this.state.cursorPosition = Math.min(
          value.length,
          this.state.cursorPosition + 1,
        )
        break
      case 'Home':
        this.state.cursorPosition = 0
        break
      case 'End':
        this.state.cursorPosition = value.length
        break
      case '?':
        this.state.showHelp = !this.state.showHelp
        break
      default:
        if (this.isValidTextInputForTextPrompt(event.key)) {
          if (!config.maxLength || value.length < config.maxLength) {
            const beforeCursor = value.slice(0, this.state.cursorPosition)
            const afterCursor = value.slice(this.state.cursorPosition)
            this.state.value = beforeCursor + event.key + afterCursor
            this.state.cursorPosition++
          }
        }
    }

    this.renderScreen()
  }

  public onMouseEvent(_event: MouseEvent): void {
    // Text input doesn't typically need mouse handling
  }

  private isValidTextInputForTextPrompt(key: string): boolean {
    if (key.length !== 1) return false

    const charCode = key.charCodeAt(0)

    return (charCode >= 32 && charCode <= 126) ||
      (charCode >= 128 && charCode <= 255)
  }

  private async handleSubmit(): Promise<void> {
    const value = this.state.value as string
    const config = this.config as TextPromptConfig

    if (config.required && !value.trim()) {
      this.state.error = 'This field is required'
      await this.renderScreen()
      return
    }

    const validation = await this.validate(value)
    if (validation !== true) {
      this.state.error = typeof validation === 'string'
        ? validation
        : 'Invalid input'
      await this.renderScreen()
      return
    }

    this.emit('submit', value)
  }

  protected getValue(): unknown {
    return this.state.value
  }
}

export { TextPrompt }
