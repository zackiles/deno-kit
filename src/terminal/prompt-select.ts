/**
 * @module prompt-select
 * @description The most advanced, extensible, and beautiful prompt system for Deno 2
 *
 * Features:
 * - Single & Multi-select prompts with search and pagination
 * - Text, Password, and Confirm prompts
 * - Conditional questions and question flows
 * - Beautiful themes with gradients
 * - Mouse and keyboard support
 * - TypeScript-first with full type safety
 * - Cross-platform terminal support
 */

import { keyboard, type KeyEvent } from './keyboard.ts'
import { mouse, type MouseEvent } from './mouse.ts'
import { ANSI_CODES } from './constants.ts'
import { terminalCleanup } from './terminal-cleanup.ts'
import * as colors from '@std/fmt/colors'
import palette from './palette.ts'
import type { Terminal } from './mod.ts'

// Lazy-loaded terminal instance to avoid circular dependency
let terminalInstance: unknown = null
async function getTerminal(): Promise<Terminal> {
  if (!terminalInstance) {
    const mod = await import('./mod.ts')
    terminalInstance = mod.terminal
  }
  return terminalInstance as Terminal
}

// 🎨 Core Types & Interfaces

interface BaseOption<T = string> {
  value: T
  label: string
  description?: string
  disabled?: boolean
  group?: string
}

interface PromptTheme {
  prefix: string
  suffix: string
  pointer: string
  checkbox: {
    checked: string
    unchecked: string
    indeterminate: string
  }
  colors: {
    primary: (text: string) => string
    secondary: (text: string) => string
    success: (text: string) => string
    error: (text: string) => string
    warning: (text: string) => string
    disabled: (text: string) => string
    highlight: (text: string) => string
  }
}

interface BasePromptConfig {
  message: string
  name?: string
  required?: boolean
  validate?: (value: unknown) => boolean | string | Promise<boolean | string>
  when?: (answers: Record<string, unknown>) => boolean | Promise<boolean>
  theme?: Partial<PromptTheme>
  maxWidth?: number
  pagination?: {
    pageSize: number
    showNumbers: boolean
  }
}

interface SelectPromptConfig extends BasePromptConfig {
  type: 'select' | 'multiselect'
  options: BaseOption[]
  searchable?: boolean
  groupBy?: boolean
  multiple?: boolean
  default?: string | string[]
}

interface TextPromptConfig extends BasePromptConfig {
  type: 'text' | 'password'
  placeholder?: string
  maxLength?: number
  default?: string
}

interface ConfirmPromptConfig extends BasePromptConfig {
  type: 'confirm'
  initial?: boolean
  default?: boolean
}

type PromptConfig = SelectPromptConfig | TextPromptConfig | ConfirmPromptConfig

interface PromptState {
  value: unknown
  selectedIndex: number
  selectedIndices: number[]
  searchQuery: string
  page: number
  isLoading: boolean
  error: string | null
  cursor: number
  showHelp: boolean
}

interface PromptResult<T = unknown> {
  name: string
  value: T
  cancelled: boolean
}

// 🎨 Default Theme
const DEFAULT_THEME: PromptTheme = {
  prefix: '❯',
  suffix: '',
  pointer: '›',
  checkbox: {
    checked: '◉',
    unchecked: '◯',
    indeterminate: '◐',
  },
  colors: {
    primary: palette.purple,
    secondary: colors.cyan,
    success: colors.green,
    error: colors.red,
    warning: colors.yellow,
    disabled: colors.dim,
    highlight: palette.purpleGradient,
  },
}

// 🎨 Event System
class PromptEventEmitter {
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  protected terminal: Terminal

  constructor(terminal: Terminal) {
    this.terminal = terminal
  }

  on(event: string, listener: (...args: unknown[]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      eventListeners.add(listener)
    }

    return () => this.off(event, listener)
  }

  off(event: string, listener: (...args: unknown[]) => void): void {
    this.listeners.get(event)?.delete(listener)
  }

  emit(event: string, ...args: unknown[]): void {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      for (const listener of eventListeners) {
        try {
          listener(...args)
        } catch (error) {
          this.terminal.error(
            'PromptEventEmitter: Error in event listener:',
            error,
          )
        }
      }
    }
  }
}

// 🎨 Core Prompt Engine
class PromptEngine {
  private currentPrompt: BasePrompt | null = null
  private isActive = false
  private cleanupRegistered = false
  private keyboardCleanup: (() => void) | null = null
  private mouseCleanup: (() => void) | null = null
  private terminal: Terminal

  constructor(terminal: Terminal) {
    this.terminal = terminal
  }

  async start(): Promise<void> {
    if (this.isActive) return

    this.terminal.debug('PromptEngine.start() called')

    this.isActive = true
    this.terminal.setRaw(true)

    await keyboard.enableRawMode()
    await mouse.enableMouse()

    this.keyboardCleanup = keyboard.addEventListener(
      this.handleKeyEvent.bind(this),
    )
    this.mouseCleanup = mouse.addEventListener(this.handleMouseEvent.bind(this))

    // Connect keyboard to mouse system for sequence handling
    keyboard.setMouseHandler((sequence: string) => {
      return mouse.processMouseInput(sequence)
    })

    if (!this.cleanupRegistered) {
      terminalCleanup.addExternalCleanupHandler(this.stop.bind(this))
      this.cleanupRegistered = true
    }

    await this.terminal.write(ANSI_CODES.CURSOR_HIDE)
    await this.terminal.write(ANSI_CODES.ALTERNATE_SCREEN_ENTER)

    this.terminal.debug('PromptEngine.start() completed')
  }

  async stop(): Promise<void> {
    if (!this.isActive) return

    this.isActive = false

    await this.terminal.write(ANSI_CODES.CURSOR_SHOW)
    await this.terminal.write(ANSI_CODES.ALTERNATE_SCREEN_EXIT)

    // Clean up event listeners
    if (this.keyboardCleanup) {
      this.keyboardCleanup()
      this.keyboardCleanup = null
    }
    if (this.mouseCleanup) {
      this.mouseCleanup()
      this.mouseCleanup = null
    }

    // Clean up mouse handler connection
    keyboard.setMouseHandler(null)

    // Properly disable keyboard and mouse to reset their internal state
    await keyboard.disableRawMode()
    await mouse.disableMouse()
  }

  setCurrentPrompt(prompt: BasePrompt): void {
    this.currentPrompt = prompt
  }

  getTerminal(): Terminal {
    return this.terminal
  }

  private handleKeyEvent(event: KeyEvent): void {
    if (this.currentPrompt) {
      this.currentPrompt.onKeyEvent(event)
    }
  }

  private handleMouseEvent(event: MouseEvent): void {
    if (this.currentPrompt) {
      this.currentPrompt.onMouseEvent(event)
    }
  }
}

// 🎨 Base Prompt Class
abstract class BasePrompt extends PromptEventEmitter {
  protected config: PromptConfig
  protected state: PromptState
  protected theme: PromptTheme
  protected engine: PromptEngine
  protected startTime = Date.now()
  private renderingInProgress = false
  private pendingRender = false

  constructor(config: PromptConfig, engine: PromptEngine) {
    super(engine.getTerminal())
    this.config = config
    this.engine = engine
    this.theme = { ...DEFAULT_THEME, ...config.theme }
    this.state = this.initializeState()
  }

  protected abstract initializeState(): PromptState
  protected abstract render(): string[]
  public abstract onKeyEvent(event: KeyEvent): void
  public abstract onMouseEvent(event: MouseEvent): void
  protected abstract getValue(): unknown

  async prompt(): Promise<PromptResult> {
    await this.engine.start()
    this.engine.setCurrentPrompt(this)

    await this.renderScreen()

    return new Promise<PromptResult>((resolve) => {
      this.on('submit', (...args: unknown[]) => {
        const value = args[0]
        resolve({
          name: this.config.name || '',
          value,
          cancelled: false,
        })
      })

      this.on('cancel', () => {
        resolve({
          name: this.config.name || '',
          value: this.state.value,
          cancelled: true,
        })
      })
    })
  }

  // Flow-specific prompt method that doesn't restart the engine
  async promptInFlow(): Promise<PromptResult> {
    const terminal = this.engine.getTerminal()
    terminal.debug('BasePrompt.promptInFlow() called', {
      promptType: this.constructor.name,
      configType: this.config.type,
      message: this.config.message,
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      filteredOptionsLength: (this as any).filteredOptions?.length || 0,
    })

    // Engine is already started in flow context
    terminal.debug('BasePrompt.promptInFlow() about to setCurrentPrompt')
    this.engine.setCurrentPrompt(this)
    terminal.debug('BasePrompt.promptInFlow() setCurrentPrompt completed', {
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      filteredOptionsLength: (this as any).filteredOptions?.length || 0,
    })

    await this.renderScreen()

    return new Promise<PromptResult>((resolve) => {
      this.on('submit', (...args: unknown[]) => {
        const value = args[0]
        terminal.debug('BasePrompt.promptInFlow() submit event', { value })
        resolve({
          name: this.config.name || '',
          value,
          cancelled: false,
        })
      })

      this.on('cancel', () => {
        terminal.debug('BasePrompt.promptInFlow() cancel event')
        resolve({
          name: this.config.name || '',
          value: this.state.value,
          cancelled: true,
        })
      })
    })
  }

  protected async renderScreen(): Promise<void> {
    // Prevent concurrent renders
    if (this.renderingInProgress) {
      this.pendingRender = true
      return
    }

    this.renderingInProgress = true
    this.pendingRender = false

    try {
      const lines = this.render()
      const output = lines.join('\n')
      const terminal = this.engine.getTerminal() // Fix: Use engine's terminal instance

      // More robust screen clearing for macOS compatibility
      await terminal.write(ANSI_CODES.CURSOR_HOME)
      await terminal.write(ANSI_CODES.CLEAR_SCREEN)
      await terminal.write(ANSI_CODES.CURSOR_HOME)
      await terminal.write(output)
    } finally {
      this.renderingInProgress = false

      // If another render was requested while this one was running, execute it
      if (this.pendingRender) {
        queueMicrotask(() => this.renderScreen())
      }
    }
  }

  protected async validate(value: unknown): Promise<boolean | string> {
    if (!this.config.validate) return true

    try {
      const result = await this.config.validate(value)
      return result
    } catch (error) {
      return `Validation error: ${error}`
    }
  }

  protected formatMessage(): string {
    const prefix = this.theme.colors.primary(this.theme.prefix)
    const message = this.theme.colors.secondary(this.config.message)
    return `${prefix} ${message}`
  }

  protected formatError(): string {
    if (!this.state.error) return ''
    return this.theme.colors.error(`  ✗ ${this.state.error}`)
  }

  protected formatHelp(): string {
    const helps = [
      '↑/↓ Navigate',
      'Enter Submit',
      'Esc Cancel',
    ]

    const config = this.config as SelectPromptConfig
    if (config.searchable) {
      helps.push('Type to search')
      helps.push('Backspace to delete')
    }

    return this.theme.colors.disabled(
      `  ${helps.join(' • ')}`,
    )
  }
}

// 🎨 Select Prompt
class SelectPrompt extends BasePrompt {
  private filteredOptions: BaseOption[] = []

  protected initializeState(): PromptState {
    const config = this.config as SelectPromptConfig
    const terminal = this.engine.getTerminal()

    terminal.debug('SelectPrompt.initializeState() called', {
      type: config.type,
      hasOptions: !!config.options,
      optionsLength: config.options?.length || 0,
      default: config.default,
    })

    const state = {
      value: config.type === 'multiselect' ? [] : config.default,
      selectedIndex: 0,
      selectedIndices: [],
      searchQuery: '',
      page: 0,
      isLoading: false,
      error: null,
      cursor: 0,
      showHelp: false,
    }

    // Set the state first, then update filtered options
    this.state = state
    this.updateFilteredOptions()

    terminal.debug('SelectPrompt.initializeState() completed', {
      filteredOptionsLength: this.filteredOptions.length,
      state: this.state,
    })

    // Initialize default selections for multiselect if provided
    if (config.type === 'multiselect' && config.default) {
      const defaults = Array.isArray(config.default)
        ? config.default
        : [config.default]
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

    // 🤖 CRITICAL BUG FIX: Force update filtered options if they're mysteriously empty
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

    // Header
    lines.push(this.formatMessage())

    if (this.state.error) {
      lines.push(this.formatError())
    }

    // Search box
    if (config.searchable) {
      const searchIcon = this.theme.colors.disabled('🔍')
      const query = this.state.searchQuery
      const placeholder = 'Type to search...'
      const displayText = query
        ? this.theme.colors.primary(query)
        : this.theme.colors.disabled(placeholder)
      lines.push(`  ${searchIcon} ${displayText}`)
      lines.push('')
    }

    // Options
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

    // Group rendering
    if (config.groupBy) {
      lines.push(...this.renderGroupedOptions(visibleOptions))
    } else {
      lines.push(...this.renderFlatOptions(visibleOptions, startIndex))
    }

    // Pagination info
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

    // Selection summary for multiselect
    if (config.type === 'multiselect') {
      const selected = this.state.selectedIndices.length
      const total = this.filteredOptions.length
      lines.push('')
      lines.push(this.theme.colors.disabled(`  Selected: ${selected}/${total}`))
    }

    // Help
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

      // Find the actual index in filteredOptions to fix grouped rendering bug
      const actualFilteredIndex = this.filteredOptions.indexOf(option)
      const isSelected = this.state.selectedIndex === actualFilteredIndex
      const isMultiSelected = this.state.selectedIndices.includes(
        actualFilteredIndex,
      )

      let prefix = '  '

      // Pointer
      if (isSelected) {
        prefix = `${this.theme.colors.primary(this.theme.pointer)} `
      }

      // Checkbox for multiselect
      if (config.type === 'multiselect') {
        const checkbox = isMultiSelected
          ? this.theme.colors.success(this.theme.checkbox.checked)
          : this.theme.colors.disabled(this.theme.checkbox.unchecked)
        prefix = `${prefix}${checkbox} `
      }

      // Option text
      let optionText = option.label
      if (option.disabled) {
        optionText = this.theme.colors.disabled(optionText)
      } else if (isSelected) {
        optionText = this.theme.colors.highlight(optionText)
      }

      lines.push(`${prefix}${optionText}`)

      // Description
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

    // Group options
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

    // Render groups
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

  public onKeyEvent(event: KeyEvent): void {
    if (event.type !== 'press') return

    // Skip empty or invalid keys
    if (!event.key || event.key.length === 0) return

    const config = this.config as SelectPromptConfig
    let shouldRender = false

    switch (event.key) {
      case 'ArrowUp':
        this.moveCursor(-1)
        shouldRender = true
        break
      case 'ArrowDown':
        this.moveCursor(1)
        shouldRender = true
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
        this.state.selectedIndex = 0
        this.updatePage()
        shouldRender = true
        break
      case 'End':
        this.state.selectedIndex = this.filteredOptions.length - 1
        this.updatePage()
        shouldRender = true
        break
      case 'Enter':
        this.handleSelect()
        // Don't render after submit - the prompt will end
        return
      case 'Space': {
        if (config.type === 'multiselect') {
          this.toggleSelection()
          shouldRender = true
        } else {
          this.handleSelect()
          // Don't render after submit - the prompt will end
          return
        }
        break
      }
      case 'Backspace': {
        if (config.searchable && this.state.searchQuery.length > 0) {
          this.removeFromSearch()
          shouldRender = true
        }
        // Don't render if no search query to remove
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
          // Don't render after cancel - the prompt will end
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

  public onMouseEvent(event: MouseEvent): void {
    if (event.type === 'press' && event.button === 'left') {
      // Calculate clicked option based on mouse position
      const clickedIndex = this.getOptionFromPosition(event.y)

      // If click is in search area or invalid area, ignore it completely
      if (clickedIndex < 0) {
        return // Don't render or change state for clicks outside option areas
      }

      if (clickedIndex < this.filteredOptions.length) {
        // Update the selected index to the clicked option
        this.state.selectedIndex = clickedIndex

        const config = this.config as SelectPromptConfig
        const clickedOption = this.filteredOptions[clickedIndex]

        // Don't allow interaction with disabled options
        if (clickedOption.disabled) {
          this.renderScreen()
          return
        }

        if (config.type === 'multiselect') {
          // In multiselect mode, mouse click should only toggle selection
          this.toggleSelection()
          this.renderScreen()
        } else {
          // In single select mode, mouse click selects and submits
          this.handleSelect()
          // Don't render after submit - the prompt will end
        }
      }
    }
  }

  private getOptionFromPosition(y: number): number {
    const config = this.config as SelectPromptConfig
    let currentLine = 0

    // Account for header lines
    currentLine++ // Message line
    if (this.state.error) currentLine++ // Error line

    // Search box
    if (config.searchable) {
      currentLine += 2 // Search line + spacing
    }

    // If click is above options area, return -1
    if (y <= currentLine) return -1

    const pageSize = this.config.pagination?.pageSize || 10
    const startIndex = this.state.page * pageSize
    const endIndex = Math.min(
      startIndex + pageSize,
      this.filteredOptions.length,
    )
    const visibleOptions = this.filteredOptions.slice(startIndex, endIndex)

    let lineOffset = y - currentLine - 1 // -1 for 0-based indexing

    if (config.groupBy) {
      // Handle grouped options - more complex line counting
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

        // Skip group header lines (empty line, group name, separator)
        if (lineOffset <= 2) return -1 // Clicked on group header
        lineOffset -= 3

        // Check options in this group
        for (const option of groupOptions) {
          if (lineOffset <= 0) {
            const actualIndex = this.filteredOptions.indexOf(option)
            return actualIndex >= 0 ? actualIndex : -1
          }
          lineOffset--

          // Account for description line if present
          if (option.description) {
            if (lineOffset <= 0) return -1 // Clicked on description
            lineOffset--
          }
        }
      }
    } else {
      // Handle flat options
      for (let i = 0; i < visibleOptions.length; i++) {
        if (lineOffset <= 0) {
          return startIndex + i
        }
        lineOffset--

        // Account for description line if present
        if (visibleOptions[i].description) {
          if (lineOffset <= 0) return -1 // Clicked on description
          lineOffset--
        }
      }
    }

    return -1 // Click was beyond the options
  }

  private moveCursor(direction: number): void {
    if (this.filteredOptions.length === 0) return

    // Ensure current index is valid before moving
    const currentIndex = Math.max(
      0,
      Math.min(this.state.selectedIndex, this.filteredOptions.length - 1),
    )
    const newIndex = currentIndex + direction

    // Clamp to valid range
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
      // For multiselect, Enter should submit the currently selected items
      const validSelectedIndices = this.state.selectedIndices.filter(
        (i) => i >= 0 && i < this.filteredOptions.length,
      )

      const values = validSelectedIndices.map((i) =>
        this.filteredOptions[i].value
      )
      this.emit('submit', values)
      return
    }

    // For single select mode
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
    // 🤖 Would implement search input mode
    this.state.searchQuery = ''
  }

  private updateSearch(char: string): void {
    this.state.searchQuery += char
    this.updateFilteredOptions()

    // Reset selection position and page when searching
    this.state.selectedIndex = 0
    this.state.page = 0

    // Update selected indices to remain valid with new filtered options
    const config = this.config as SelectPromptConfig
    if (config.type === 'multiselect') {
      // Map selected indices from original options to filtered options
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
    this.state.searchQuery = this.state.searchQuery.slice(0, -1)
    this.updateFilteredOptions()

    // Reset selection position and page when search changes
    this.state.selectedIndex = 0
    this.state.page = 0

    // Update selected indices to remain valid with new filtered options
    const config = this.config as SelectPromptConfig
    if (config.type === 'multiselect') {
      // Map selected indices from original options to filtered options
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
    this.updateFilteredOptions()

    // Reset selection position but preserve multiselect state
    this.state.selectedIndex = 0
    this.state.page = 0

    // Update selected indices to remain valid with new filtered options
    const config = this.config as SelectPromptConfig
    if (config.type === 'multiselect') {
      this.state.selectedIndices = this.state.selectedIndices.filter(
        (index) => index < this.filteredOptions.length,
      )
    }
  }

  private isValidTextInput(key: string): boolean {
    // Only allow single characters that are printable and not control characters
    if (key.length !== 1) return false

    const charCode = key.charCodeAt(0)

    // Allow printable ASCII characters (32-126) and basic Latin extended (128-255)
    // Exclude DEL (127) and control characters (0-31)
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

    // 🤖 Added null check to prevent potential undefined options
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

    // Ensure selectedIndex is valid after filtering
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
      // Return array of selected values, ensuring indices are valid
      return this.state.selectedIndices
        .filter((i) => i >= 0 && i < this.filteredOptions.length)
        .map((i) => this.filteredOptions[i].value)
    }

    const selectedOption = this.filteredOptions[this.state.selectedIndex]
    return selectedOption?.value
  }
}

// 🎨 Text Prompt
class TextPrompt extends BasePrompt {
  protected initializeState(): PromptState {
    const config = this.config as TextPromptConfig
    return {
      value: config.default || '',
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

    // Input field
    const value = this.state.value as string
    const placeholder = config.placeholder || 'Enter text...'
    const displayValue = value || this.theme.colors.disabled(placeholder)

    const inputLine = this.config.type === 'password'
      ? '•'.repeat(value.length)
      : displayValue

    lines.push(`  ${this.theme.colors.primary('›')} ${inputLine}`)

    // Character count
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
    // Only allow single characters that are printable and not control characters
    if (key.length !== 1) return false

    const charCode = key.charCodeAt(0)

    // Allow printable ASCII characters (32-126) and basic Latin extended (128-255)
    // Exclude DEL (127) and control characters (0-31)
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

// 🎨 Confirm Prompt
class ConfirmPrompt extends BasePrompt {
  protected initializeState(): PromptState {
    const config = this.config as ConfirmPromptConfig
    return {
      value: config.initial || config.default || false,
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

    lines.push(this.formatMessage())

    if (this.state.error) {
      lines.push(this.formatError())
    }

    const value = this.state.value as boolean
    const yesOption = value
      ? this.theme.colors.success('● Yes')
      : this.theme.colors.disabled('○ Yes')
    const noOption = !value
      ? this.theme.colors.error('● No')
      : this.theme.colors.disabled('○ No')

    lines.push(`  ${yesOption}  ${noOption}`)
    lines.push('')
    lines.push(this.theme.colors.disabled('  Y/N or Enter to confirm'))

    return lines
  }

  public onKeyEvent(event: KeyEvent): void {
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

  public onMouseEvent(_event: MouseEvent): void {
    //TODO: Could implement click-to-select for Yes/No options
  }

  protected getValue(): unknown {
    return this.state.value
  }
}

// 🎨 Main Prompt Orchestrator
export class Prompt {
  private engine: PromptEngine | null = null
  private results = new Map<string, unknown>()

  private async initEngine(): Promise<PromptEngine> {
    if (!this.engine) {
      const terminal = await getTerminal()
      this.engine = new PromptEngine(terminal)
    }
    return this.engine
  }

  /**
   * Create a single select prompt
   */
  static select(config: Omit<SelectPromptConfig, 'type'>): SelectPromptConfig {
    return { ...config, type: 'select' }
  }

  /**
   * Create a multi-select prompt
   */
  static multiselect(
    config: Omit<SelectPromptConfig, 'type'>,
  ): SelectPromptConfig {
    return { ...config, type: 'multiselect', multiple: true }
  }

  /**
   * Create a text input prompt
   */
  static text(config: Omit<TextPromptConfig, 'type'>): TextPromptConfig {
    return { ...config, type: 'text' }
  }

  /**
   * Create a password input prompt
   */
  static password(config: Omit<TextPromptConfig, 'type'>): TextPromptConfig {
    return { ...config, type: 'password' }
  }

  /**
   * Create a confirmation prompt
   */
  static confirm(
    config: Omit<ConfirmPromptConfig, 'type'>,
  ): ConfirmPromptConfig {
    return { ...config, type: 'confirm' }
  }

  /**
   * Execute a single prompt
   */
  async ask<T = unknown>(config: PromptConfig): Promise<T> {
    const engine = await this.initEngine()
    const prompt = this.createPrompt(config, engine)
    const result = await prompt.prompt()

    if (result.cancelled) {
      throw new Error('Prompt was cancelled')
    }

    if (config.name) {
      this.results.set(config.name, result.value)
    }

    await engine.stop()
    return result.value as T
  }

  /**
   * Execute multiple prompts in sequence
   */
  async flow(configs: PromptConfig[]): Promise<Record<string, unknown>> {
    const answers: Record<string, unknown> = {}
    const engine = await this.initEngine()

    const terminal = engine.getTerminal()
    terminal.debug('Prompt.flow() started', {
      configCount: configs.length,
      configTypes: configs.map((c) => c.type),
    })

    // Start the engine once for the entire flow
    await engine.start()

    for (const config of configs) {
      terminal.debug('Prompt.flow() processing config', {
        type: config.type,
        name: config.name,
        message: config.message,
        hasWhen: !!config.when,
      })

      // Check conditional display
      if (config.when) {
        const shouldShow = await config.when(answers)
        terminal.debug('Prompt.flow() conditional check', {
          name: config.name,
          shouldShow,
        })
        if (!shouldShow) continue
      }

      const result = await this.askInternal(config, engine)

      if (config.name) {
        answers[config.name] = result
        terminal.debug('Prompt.flow() answer recorded', {
          name: config.name,
          value: result,
        })
      }
    }

    await engine.stop()
    terminal.debug('Prompt.flow() completed', { answers })
    return answers
  }

  /**
   * Internal method to execute a prompt without stopping the engine
   * Used by flow() to chain prompts without engine restart overhead
   */
  private async askInternal<T = unknown>(
    config: PromptConfig,
    engine: PromptEngine,
  ): Promise<T> {
    const terminal = engine.getTerminal()
    terminal.debug('Prompt.askInternal() called', {
      type: config.type,
      name: config.name,
      message: config.message,
    })

    const prompt = this.createPrompt(config, engine)

    terminal.debug('Prompt.askInternal() prompt created', {
      promptType: prompt.constructor.name,
    })

    // Use flow-specific prompt method that doesn't restart the engine
    const result = await prompt.promptInFlow()

    terminal.debug('Prompt.askInternal() result received', {
      cancelled: result.cancelled,
      hasValue: result.value !== undefined,
    })

    if (result.cancelled) {
      throw new Error('Prompt was cancelled')
    }

    if (config.name) {
      this.results.set(config.name, result.value)
    }

    // Don't stop the engine - let the caller manage engine lifecycle
    return result.value as T
  }

  /**
   * Get previous answers
   */
  getAnswers(): Record<string, unknown> {
    return Object.fromEntries(this.results)
  }

  private createPrompt(config: PromptConfig, engine: PromptEngine): BasePrompt {
    switch (config.type) {
      case 'select':
      case 'multiselect':
        return new SelectPrompt(config, engine)
      case 'text':
      case 'password':
        return new TextPrompt(config, engine)
      case 'confirm':
        return new ConfirmPrompt(config, engine)
      default:
        throw new Error(
          `Unsupported prompt type: ${(config as PromptConfig).type}`,
        )
    }
  }
}

// 🎨 Convenience Exports
export const prompt = new Prompt()

export type {
  BaseOption,
  ConfirmPromptConfig,
  PromptConfig,
  PromptResult,
  PromptTheme,
  SelectPromptConfig,
  TextPromptConfig,
}

export { DEFAULT_THEME }
