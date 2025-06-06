/**
 * @module prompt
 * @description Core prompt system with shared types, base classes, and orchestration
 */

import { keyboard, type KeyEvent } from '../keyboard.ts'
import { mouse, type MouseEvent } from '../mouse.ts'
import { ANSI_CODES } from '../constants.ts'
import { terminalCleanup } from '../terminal-cleanup.ts'
import * as colors from '@std/fmt/colors'
import palette from '../palette.ts'
import type { Terminal } from '../mod.ts'

let terminalInstance: unknown = null
async function getTerminal(): Promise<Terminal> {
  if (!terminalInstance) {
    const mod = await import('../mod.ts')
    terminalInstance = mod.terminal
  }
  return terminalInstance as Terminal
}

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
  defaultValue?: string | string[]
}

interface TextPromptConfig extends BasePromptConfig {
  type: 'text' | 'password'
  placeholder?: string
  maxLength?: number
  defaultValue?: string
}

interface ConfirmPromptConfig extends BasePromptConfig {
  type: 'confirm'
  initial?: boolean
  defaultValue?: boolean
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

    if (this.keyboardCleanup) {
      this.keyboardCleanup()
      this.keyboardCleanup = null
    }
    if (this.mouseCleanup) {
      this.mouseCleanup()
      this.mouseCleanup = null
    }

    keyboard.setMouseHandler(null)

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

  async promptInFlow(): Promise<PromptResult> {
    const terminal = this.engine.getTerminal()
    terminal.debug('BasePrompt.promptInFlow() called', {
      promptType: this.constructor.name,
      configType: this.config.type,
      message: this.config.message,
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      filteredOptionsLength: (this as any).filteredOptions?.length || 0,
    })

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
    if (this.renderingInProgress) {
      this.pendingRender = true
      return
    }

    this.renderingInProgress = true
    this.pendingRender = false

    try {
      const lines = this.render()
      const output = lines.join('\n')
      const terminal = this.engine.getTerminal()

      await terminal.write(ANSI_CODES.CURSOR_HOME)
      await terminal.write(ANSI_CODES.CLEAR_SCREEN)
      await terminal.write(ANSI_CODES.CURSOR_HOME)
      await terminal.write(output)
    } finally {
      this.renderingInProgress = false

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

class Prompt {
  private engine: PromptEngine | null = null
  private results = new Map<string, unknown>()

  private async initEngine(): Promise<PromptEngine> {
    if (!this.engine) {
      const terminal = await getTerminal()
      this.engine = new PromptEngine(terminal)
    }
    return this.engine
  }

  static select(config: Omit<SelectPromptConfig, 'type'>): SelectPromptConfig {
    return { ...config, type: 'select' }
  }

  static multiselect(
    config: Omit<SelectPromptConfig, 'type'>,
  ): SelectPromptConfig {
    return { ...config, type: 'multiselect', multiple: true }
  }

  static text(config: Omit<TextPromptConfig, 'type'>): TextPromptConfig {
    return { ...config, type: 'text' }
  }

  static password(config: Omit<TextPromptConfig, 'type'>): TextPromptConfig {
    return { ...config, type: 'password' }
  }

  static confirm(
    config: Omit<ConfirmPromptConfig, 'type'>,
  ): ConfirmPromptConfig {
    return { ...config, type: 'confirm' }
  }

  async ask<T = unknown>(config: PromptConfig): Promise<T> {
    const engine = await this.initEngine()
    const prompt = await this.createPrompt(config, engine)
    const result = await prompt.prompt()

    if (result.cancelled) {
      await engine.stop()
      const { gracefulShutdown } = await import(
        '../../utils/graceful-shutdown.ts'
      )
      await gracefulShutdown.shutdown(false, 130)
      return result.value as T
    }

    if (config.name) {
      this.results.set(config.name, result.value)
    }

    await engine.stop()
    return result.value as T
  }

  async flow(configs: PromptConfig[]): Promise<Record<string, unknown>> {
    const answers: Record<string, unknown> = {}
    const engine = await this.initEngine()

    const terminal = engine.getTerminal()
    terminal.debug('Prompt.flow() started', {
      configCount: configs.length,
      configTypes: configs.map((c) => c.type),
    })

    await engine.start()

    for (const config of configs) {
      terminal.debug('Prompt.flow() processing config', {
        type: config.type,
        name: config.name,
        message: config.message,
        hasWhen: !!config.when,
      })

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

    const prompt = await this.createPrompt(config, engine)

    terminal.debug('Prompt.askInternal() prompt created', {
      promptType: prompt.constructor.name,
    })

    const result = await prompt.promptInFlow()

    terminal.debug('Prompt.askInternal() result received', {
      cancelled: result.cancelled,
      hasValue: result.value !== undefined,
    })

    if (result.cancelled) {
      const { gracefulShutdown } = await import(
        '../../utils/graceful-shutdown.ts'
      )
      await gracefulShutdown.shutdown(false, 130)
      return result.value as T
    }

    if (config.name) {
      this.results.set(config.name, result.value)
    }

    return result.value as T
  }

  getAnswers(): Record<string, unknown> {
    return Object.fromEntries(this.results)
  }

  private async createPrompt(
    config: PromptConfig,
    engine: PromptEngine,
  ): Promise<BasePrompt> {
    switch (config.type) {
      case 'select':
      case 'multiselect': {
        const { SelectPrompt } = await import('./select-prompt.ts')
        return new SelectPrompt(config as SelectPromptConfig, engine)
      }
      case 'text':
      case 'password': {
        const { TextPrompt } = await import('./text-prompt.ts')
        return new TextPrompt(config as TextPromptConfig, engine)
      }
      case 'confirm': {
        const { ConfirmPrompt } = await import('./confirm-prompt.ts')
        return new ConfirmPrompt(config as ConfirmPromptConfig, engine)
      }
      default:
        throw new Error(
          `Unsupported prompt type: ${(config as PromptConfig).type}`,
        )
    }
  }
}

const prompt = new Prompt()

export {
  BasePrompt,
  DEFAULT_THEME,
  Prompt,
  prompt,
  PromptEngine,
  PromptEventEmitter,
}
export type {
  BaseOption,
  ConfirmPromptConfig,
  KeyEvent,
  MouseEvent,
  PromptConfig,
  PromptResult,
  PromptState,
  PromptTheme,
  SelectPromptConfig,
  TextPromptConfig,
}
