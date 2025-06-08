/**
 * @module select-prompt
 * @description SelectPrompt class for single and multi-select prompts
 */

import {
  type BaseOption,
  BasePrompt,
  type KeyEvent,
  type MouseEvent,
  type PromptState,
  type SelectPromptConfig,
} from './prompt.ts'

class SelectPrompt extends BasePrompt {
  private filteredOptions: BaseOption[] = []

  protected initializeState(): PromptState {
    const config = this.config as SelectPromptConfig
    const terminal = this.engine.getTerminal()

    terminal.debug('SelectPrompt.initializeState() called', {
      type: config.type,
      hasOptions: !!config.options,
      optionsLength: config.options?.length || 0,
      defaultValue: config.defaultValue,
    })

    const state = {
      value: config.type === 'multiselect' ? [] : config.defaultValue,
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

    this.state = state
    this.updateFilteredOptions()

    terminal.debug('SelectPrompt.initializeState() completed', {
      filteredOptionsLength: this.filteredOptions.length,
      state: this.state,
    })

    if (config.type === 'multiselect' && config.defaultValue) {
      const defaults = Array.isArray(config.defaultValue)
        ? config.defaultValue
        : [config.defaultValue]
      this.state.selectedIndices = this.filteredOptions
        .map((option, index) => defaults.includes(option.value) ? index : -1)
        .filter((index) => index !== -1)

      terminal.debug(
        'SelectPrompt.initializeState() multiselect defaults set',
        {
          defaults,
          selectedIndices: this.state.selectedIndices,
        },
      )
    }

    return state
  }

  protected render(): string[] {
    const lines: string[] = []
    const config = this.config as SelectPromptConfig
    const terminal = this.engine.getTerminal()

    if (this.state.isDone) {
      if (config.type === 'multiselect') {
        const selectedValues = this.state.selectedIndices
          .filter((i) => i >= 0 && i < this.filteredOptions.length)
          .map((i) => this.filteredOptions[i].label)
        const summary = selectedValues.length > 0
          ? selectedValues.join(', ')
          : 'None selected'
        lines.push(
          `${this.formatMessage()} ${this.theme.colors.success(summary)}`,
        )
      } else {
        const selectedOption = this.filteredOptions[this.state.selectedIndex]
        const summary = selectedOption ? selectedOption.label : 'No selection'
        lines.push(
          `${this.formatMessage()} ${this.theme.colors.success(summary)}`,
        )
      }
      return lines
    }

    if (
      this.filteredOptions.length === 0 && config.options &&
      config.options.length > 0
    ) {
      terminal.debug(
        'SelectPrompt.render() DETECTED EMPTY filteredOptions - force updating',
        {
          configOptionsLength: config.options.length,
          filteredOptionsLength: this.filteredOptions.length,
        },
      )
      this.updateFilteredOptions()
      terminal.debug('SelectPrompt.render() AFTER force update', {
        filteredOptionsLength: this.filteredOptions.length,
      })
    }

    terminal.debug('SelectPrompt.render() called', {
      filteredOptionsLength: this.filteredOptions.length,
      selectedIndex: this.state.selectedIndex,
      hasError: !!this.state.error,
      searchQuery: this.state.searchQuery,
    })

    lines.push(this.formatMessage())

    if (this.state.error) {
      lines.push(this.formatError())
    }

    if (config.searchable) {
      const searchIcon = this.theme.colors.disabled('🔍')
      const query = this.state.searchQuery
      const placeholder = 'Type to search...'

      let displayText: string
      if (query) {
        displayText = this.theme.colors.inputText(
          this.insertCursorInText(query, this.state.cursorPosition),
        )
      } else {
        const placeholderText = this.theme.colors.disabled(placeholder)
        displayText = this.insertCursorInText(placeholderText, 0)
      }

      lines.push(`  ${searchIcon} ${displayText}`)
      lines.push('')
    }

    const pageSize = this.config.pagination?.pageSize || 10
    const startIndex = this.state.page * pageSize
    const endIndex = Math.min(
      startIndex + pageSize,
      this.filteredOptions.length,
    )
    const visibleOptions = this.filteredOptions.slice(startIndex, endIndex)

    terminal.debug('SelectPrompt.render() options processing', {
      pageSize,
      startIndex,
      endIndex,
      visibleOptionsLength: visibleOptions.length,
      totalFilteredOptions: this.filteredOptions.length,
    })

    if (config.groupBy) {
      lines.push(...this.renderGroupedOptions(visibleOptions))
    } else {
      lines.push(...this.renderFlatOptions(visibleOptions, startIndex))
    }

    if (this.filteredOptions.length > pageSize) {
      const current = this.state.page + 1
      const total = Math.ceil(this.filteredOptions.length / pageSize)
      lines.push('')
      lines.push(
        this.theme.colors.disabled(
          `  Page ${current}/${total} • ${this.filteredOptions.length} items`,
        ),
      )
    }

    if (config.type === 'multiselect') {
      const selected = this.state.selectedIndices.length
      const total = this.filteredOptions.length
      lines.push('')
      lines.push(this.theme.colors.disabled(`  Selected: ${selected}/${total}`))
    }

    if (this.state.showHelp) {
      lines.push('')
      lines.push(this.formatHelp())
    }

    terminal.debug('SelectPrompt.render() completed', {
      totalLines: lines.length,
      firstFewLines: lines.slice(0, 3),
    })

    return lines
  }

  private renderFlatOptions(
    options: BaseOption[],
    _startIndex: number,
  ): string[] {
    const lines: string[] = []
    const config = this.config as SelectPromptConfig

    for (let index = 0; index < options.length; index++) {
      const option = options[index]

      const actualFilteredIndex = this.filteredOptions.indexOf(option)
      const isSelected = this.state.selectedIndex === actualFilteredIndex
      const isMultiSelected = this.state.selectedIndices.includes(
        actualFilteredIndex,
      )

      let prefix = '  '

      if (isSelected) {
        prefix = `${this.theme.colors.secondary(this.theme.pointer)} `
      }

      if (config.type === 'multiselect') {
        const checkbox = isMultiSelected
          ? this.theme.colors.highlight(this.theme.checkbox.checked)
          : this.theme.colors.highlight(this.theme.checkbox.unchecked)
        prefix = `${prefix}${checkbox} `
      }

      let optionText = option.label
      if (option.disabled) {
        optionText = this.theme.colors.disabled(optionText)
      } else if (isSelected) {
        optionText = this.theme.colors.secondary(optionText)
      } else {
        optionText = this.theme.colors.text(optionText)
      }

      lines.push(`${prefix}${optionText}`)

      if (option.description) {
        const desc = this.theme.colors.disabled(`    ${option.description}`)
        lines.push(desc)
      }
    }

    return lines
  }

  private renderGroupedOptions(options: BaseOption[]): string[] {
    const lines: string[] = []
    const groups = new Map<string, BaseOption[]>()

    for (const option of options) {
      const group = option.group || 'Other'
      if (!groups.has(group)) {
        groups.set(group, [])
      }
      const groupList = groups.get(group)
      if (groupList) {
        groupList.push(option)
      }
    }

    for (const [groupName, groupOptions] of groups) {
      lines.push('')
      lines.push(this.theme.colors.secondary(`  ${groupName}`))
      lines.push(
        this.theme.colors.disabled(`  ${'─'.repeat(groupName.length)}`),
      )
      lines.push(...this.renderFlatOptions(groupOptions, 0))
    }

    return lines
  }

  protected override handleKeyEvent(event: KeyEvent): void {
    if (event.type !== 'press') return

    if (!event.key || event.key.length === 0) return

    const config = this.config as SelectPromptConfig
    let shouldRender = false

    switch (event.key) {
      case 'ArrowUp':
        if (config.searchable && this.state.searchQuery.length > 0) {
          // Don't move selection when in search mode, handle cursor instead if needed
        } else {
          this.moveCursor(-1)
          shouldRender = true
        }
        break
      case 'ArrowDown':
        if (config.searchable && this.state.searchQuery.length > 0) {
          // Don't move selection when in search mode, handle cursor instead if needed
        } else {
          this.moveCursor(1)
          shouldRender = true
        }
        break
      case 'ArrowLeft':
        if (config.searchable && this.state.searchQuery.length > 0) {
          this.state.cursorPosition = Math.max(0, this.state.cursorPosition - 1)
          shouldRender = true
        }
        break
      case 'ArrowRight':
        if (config.searchable && this.state.searchQuery.length > 0) {
          this.state.cursorPosition = Math.min(
            this.state.searchQuery.length,
            this.state.cursorPosition + 1,
          )
          shouldRender = true
        }
        break
      case 'PageUp':
        this.movePage(-1)
        shouldRender = true
        break
      case 'PageDown':
        this.movePage(1)
        shouldRender = true
        break
      case 'Home':
        if (config.searchable && this.state.searchQuery.length > 0) {
          this.state.cursorPosition = 0
          shouldRender = true
        } else {
          this.state.selectedIndex = 0
          this.updatePage()
          shouldRender = true
        }
        break
      case 'End':
        if (config.searchable && this.state.searchQuery.length > 0) {
          this.state.cursorPosition = this.state.searchQuery.length
          shouldRender = true
        } else {
          this.state.selectedIndex = this.filteredOptions.length - 1
          this.updatePage()
          shouldRender = true
        }
        break
      case 'Enter':
        this.handleSelect()
        return
      case 'Space': {
        if (config.type === 'multiselect') {
          this.toggleSelection()
          shouldRender = true
        } else {
          this.handleSelect()
          return
        }
        break
      }
      case 'Backspace': {
        if (config.searchable && this.state.searchQuery.length > 0) {
          this.removeFromSearch()
          shouldRender = true
        }
        break
      }
      case 'Delete': {
        if (
          config.searchable &&
          this.state.cursorPosition < this.state.searchQuery.length
        ) {
          const beforeCursor = this.state.searchQuery.slice(
            0,
            this.state.cursorPosition,
          )
          const afterCursor = this.state.searchQuery.slice(
            this.state.cursorPosition + 1,
          )
          this.state.searchQuery = beforeCursor + afterCursor
          this.updateFilteredOptions()
          this.state.selectedIndex = 0
          this.state.page = 0
          shouldRender = true
        }
        break
      }
      case '/': {
        if (config.searchable) {
          this.enterSearchMode()
          shouldRender = true
        }
        break
      }
      case 'Escape':
        if (config.searchable && this.state.searchQuery.length > 0) {
          this.clearSearch()
          shouldRender = true
        } else {
          this.emit('cancel')
          return
        }
        break
      case '?':
        this.state.showHelp = !this.state.showHelp
        shouldRender = true
        break
      default: {
        if (config.searchable && this.isValidTextInput(event.key)) {
          this.updateSearch(event.key)
          shouldRender = true
        }
      }
    }

    if (shouldRender) {
      this.renderScreen()
    }
  }

  protected override handleMouseEvent(event: MouseEvent): void {
    if (event.type === 'press' && event.button === 'left') {
      const clickedIndex = this.getOptionFromPosition(event.y)

      if (clickedIndex < 0) {
        return
      }

      if (clickedIndex < this.filteredOptions.length) {
        this.state.selectedIndex = clickedIndex

        const config = this.config as SelectPromptConfig
        const clickedOption = this.filteredOptions[clickedIndex]

        if (clickedOption.disabled) {
          this.renderScreen()
          return
        }

        if (config.type === 'multiselect') {
          this.toggleSelection()
          this.renderScreen()
        } else {
          this.handleSelect()
        }
      }
    }
  }

  private getOptionFromPosition(y: number): number {
    const config = this.config as SelectPromptConfig
    let currentLine = 0

    currentLine++
    if (this.state.error) currentLine++

    if (config.searchable) {
      currentLine += 2
    }

    if (y <= currentLine) return -1

    const pageSize = this.config.pagination?.pageSize || 10
    const startIndex = this.state.page * pageSize
    const endIndex = Math.min(
      startIndex + pageSize,
      this.filteredOptions.length,
    )
    const visibleOptions = this.filteredOptions.slice(startIndex, endIndex)

    let lineOffset = y - currentLine - 1

    if (config.groupBy) {
      const groups = new Map<string, BaseOption[]>()
      for (const option of visibleOptions) {
        const group = option.group || 'Other'
        if (!groups.has(group)) groups.set(group, [])
        const groupOptions = groups.get(group)
        if (groupOptions) {
          groupOptions.push(option)
        }
      }

      for (const [_groupName, groupOptions] of groups) {
        if (lineOffset <= 0) break

        if (lineOffset <= 2) return -1
        lineOffset -= 3

        for (const option of groupOptions) {
          if (lineOffset <= 0) {
            const actualIndex = this.filteredOptions.indexOf(option)
            return actualIndex >= 0 ? actualIndex : -1
          }
          lineOffset--

          if (option.description) {
            if (lineOffset <= 0) return -1
            lineOffset--
          }
        }
      }
    } else {
      for (let i = 0; i < visibleOptions.length; i++) {
        if (lineOffset <= 0) {
          return startIndex + i
        }
        lineOffset--

        if (visibleOptions[i].description) {
          if (lineOffset <= 0) return -1
          lineOffset--
        }
      }
    }

    return -1
  }

  private moveCursor(direction: number): void {
    if (this.filteredOptions.length === 0) return

    const currentIndex = Math.max(
      0,
      Math.min(this.state.selectedIndex, this.filteredOptions.length - 1),
    )
    const newIndex = currentIndex + direction

    this.state.selectedIndex = Math.max(
      0,
      Math.min(newIndex, this.filteredOptions.length - 1),
    )
    this.updatePage()
  }

  private movePage(direction: number): void {
    const pageSize = this.config.pagination?.pageSize || 10
    this.state.page = Math.max(0, this.state.page + direction)
    this.state.selectedIndex = this.state.page * pageSize
  }

  private updatePage(): void {
    const pageSize = this.config.pagination?.pageSize || 10
    this.state.page = Math.floor(this.state.selectedIndex / pageSize)
  }

  private handleSelect(): void {
    const config = this.config as SelectPromptConfig
    if (config.type === 'multiselect') {
      const validSelectedIndices = this.state.selectedIndices.filter(
        (i) => i >= 0 && i < this.filteredOptions.length,
      )

      const values = validSelectedIndices.map((i) =>
        this.filteredOptions[i].value
      )
      this.emit('submit', values)
      return
    }

    const selectedOption = this.filteredOptions[this.state.selectedIndex]
    if (selectedOption && !selectedOption.disabled) {
      this.emit('submit', selectedOption.value)
    }
  }

  private toggleSelection(): void {
    const index = this.state.selectedIndex
    const selectedIndices = [...this.state.selectedIndices]

    const existingIndex = selectedIndices.indexOf(index)
    if (existingIndex >= 0) {
      selectedIndices.splice(existingIndex, 1)
    } else {
      selectedIndices.push(index)
    }

    this.state.selectedIndices = selectedIndices
  }

  private enterSearchMode(): void {
    this.state.searchQuery = ''
    this.state.cursorPosition = 0
  }

  private updateSearch(char: string): void {
    const beforeCursor = this.state.searchQuery.slice(
      0,
      this.state.cursorPosition,
    )
    const afterCursor = this.state.searchQuery.slice(this.state.cursorPosition)
    this.state.searchQuery = beforeCursor + char + afterCursor
    this.state.cursorPosition++

    this.updateFilteredOptions()

    this.state.selectedIndex = 0
    this.state.page = 0

    const config = this.config as SelectPromptConfig
    if (config.type === 'multiselect') {
      const originalOptions = config.options
      const selectedValues = this.state.selectedIndices.map((i) =>
        originalOptions[i]?.value
      ).filter(Boolean)

      this.state.selectedIndices = this.filteredOptions
        .map((option, index) =>
          selectedValues.includes(option.value) ? index : -1
        )
        .filter((index) => index !== -1)
    }
  }

  private removeFromSearch(): void {
    if (this.state.cursorPosition > 0) {
      const beforeCursor = this.state.searchQuery.slice(
        0,
        this.state.cursorPosition - 1,
      )
      const afterCursor = this.state.searchQuery.slice(
        this.state.cursorPosition,
      )
      this.state.searchQuery = beforeCursor + afterCursor
      this.state.cursorPosition--
    }

    this.updateFilteredOptions()

    this.state.selectedIndex = 0
    this.state.page = 0

    const config = this.config as SelectPromptConfig
    if (config.type === 'multiselect') {
      const originalOptions = config.options
      const selectedValues = this.state.selectedIndices.map((i) =>
        originalOptions[i]?.value
      ).filter(Boolean)

      this.state.selectedIndices = this.filteredOptions
        .map((option, index) =>
          selectedValues.includes(option.value) ? index : -1
        )
        .filter((index) => index !== -1)
    }
  }

  private clearSearch(): void {
    this.state.searchQuery = ''
    this.state.cursorPosition = 0
    this.updateFilteredOptions()

    this.state.selectedIndex = 0
    this.state.page = 0

    const config = this.config as SelectPromptConfig
    if (config.type === 'multiselect') {
      this.state.selectedIndices = this.state.selectedIndices.filter(
        (index) => index < this.filteredOptions.length,
      )
    }
  }

  private isValidTextInput(key: string): boolean {
    if (key.length !== 1) return false

    const charCode = key.charCodeAt(0)

    return (charCode >= 32 && charCode <= 126) ||
      (charCode >= 128 && charCode <= 255)
  }

  private updateFilteredOptions(): void {
    const config = this.config as SelectPromptConfig
    const terminal = this.engine.getTerminal()

    terminal.debug('SelectPrompt.updateFilteredOptions() called', {
      hasOptions: !!config.options,
      optionsLength: config.options?.length || 0,
      searchQuery: this.state?.searchQuery || '',
    })

    let filtered = config.options || []

    if (this.state.searchQuery) {
      const query = this.state.searchQuery.toLowerCase()
      filtered = filtered.filter((option) =>
        option.label.toLowerCase().includes(query) ||
        option.description?.toLowerCase().includes(query)
      )
    }

    this.filteredOptions = filtered

    terminal.debug('SelectPrompt.updateFilteredOptions() completed', {
      filteredLength: this.filteredOptions.length,
      selectedIndex: this.state.selectedIndex,
    })

    if (this.filteredOptions.length > 0) {
      this.state.selectedIndex = Math.max(
        0,
        Math.min(this.state.selectedIndex, this.filteredOptions.length - 1),
      )
    } else {
      this.state.selectedIndex = 0
    }
  }

  protected getValue(): unknown {
    const config = this.config as SelectPromptConfig
    if (config.type === 'multiselect') {
      return this.state.selectedIndices
        .filter((i) => i >= 0 && i < this.filteredOptions.length)
        .map((i) => this.filteredOptions[i].value)
    }

    const selectedOption = this.filteredOptions[this.state.selectedIndex]
    return selectedOption?.value
  }

  protected override getFilteredOptionsLength(): number {
    return this.filteredOptions.length
  }
}

export { SelectPrompt }
