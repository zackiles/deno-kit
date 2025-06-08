/**
 * @module confirm-prompt
 * @description ConfirmPrompt class for yes/no confirmation prompts
 */

import {
  BasePrompt,
  type ConfirmPromptConfig,
  type KeyEvent,
  type MouseEvent,
  type PromptState,
} from './prompt.ts'

class ConfirmPrompt extends BasePrompt {
  protected initializeState(): PromptState {
    const config = this.config as ConfirmPromptConfig
    return {
      value: config.initial || config.defaultValue || false,
      selectedIndex: 0,
      selectedIndices: [],
      searchQuery: '',
      page: 0,
      isLoading: false,
      error: null,
      cursor: 0,
      showHelp: false,
      isDone: false,
      cursorPosition: 0,
      cursorVisible: true,
    }
  }

  protected render(): string[] {
    const lines: string[] = []

    if (this.state.isDone) {
      const answer = this.state.value ? 'Yes' : 'No'
      lines.push(`${this.formatMessage()} ${this.theme.colors.success(answer)}`)
      return lines
    }

    lines.push(this.formatMessage())

    if (this.state.error) {
      lines.push(this.formatError())
    }

    const value = this.state.value as boolean
    const yesOption = value
      ? this.theme.colors.secondary('● Yes')
      : this.theme.colors.text('○ Yes')
    const noOption = !value
      ? this.theme.colors.secondary('● No')
      : this.theme.colors.text('○ No')

    lines.push(`  ${yesOption}  ${noOption}`)
    lines.push('')
    lines.push(this.theme.colors.disabled('  Y/N or Enter to confirm'))

    return lines
  }

  protected override handleKeyEvent(event: KeyEvent): void {
    if (event.type !== 'press') return

    switch (event.key.toLowerCase()) {
      case 'y':
      case 'yes':
        this.state.value = true
        this.renderScreen()
        break
      case 'n':
      case 'no':
        this.state.value = false
        this.renderScreen()
        break
      case 'enter':
        this.emit('submit', this.state.value)
        break
      case 'escape':
        this.emit('cancel')
        break
      case 'arrowleft':
      case 'arrowright':
        this.state.value = !this.state.value
        this.renderScreen()
        break
    }
  }

  protected override handleMouseEvent(_event: MouseEvent): void {
    //TODO: Could implement click-to-select for Yes/No options
  }

  protected getValue(): unknown {
    return this.state.value
  }
}

export { ConfirmPrompt }
