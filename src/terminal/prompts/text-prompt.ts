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
    }
  }

  protected render(): string[] {
    const lines: string[] = []
    const config = this.config as TextPromptConfig

    lines.push(this.formatMessage())

    if (this.state.error) {
      lines.push(this.formatError())
    }

    const value = this.state.value as string
    const placeholder = config.placeholder || 'Enter text...'
    const displayValue = value || this.theme.colors.disabled(placeholder)

    const inputLine = this.config.type === 'password'
      ? '•'.repeat(value.length)
      : displayValue

    lines.push(`  ${this.theme.colors.primary('›')} ${inputLine}`)

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
    let value = this.state.value as string

    switch (event.key) {
      case 'Enter':
        this.handleSubmit()
        break
      case 'Escape':
        this.emit('cancel')
        break
      case 'Backspace':
        value = value.slice(0, -1)
        this.state.value = value
        break
      case '?':
        this.state.showHelp = !this.state.showHelp
        break
      default:
        if (this.isValidTextInputForTextPrompt(event.key)) {
          if (!config.maxLength || value.length < config.maxLength) {
            this.state.value = value + event.key
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
