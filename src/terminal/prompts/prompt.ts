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
    inputText: (text: string) => string
    text: (text: string) => string
  }
}

interface PartialPromptTheme {
  prefix?: string
  suffix?: string
  pointer?: string
  checkbox?: Partial<PromptTheme['checkbox']>
  colors?: Partial<PromptTheme['colors']>
}

interface BasePromptConfig {
  message: string
  name?: string
  required?: boolean
  validate?: (value: unknown) => boolean | string | Promise<boolean | string>
  when?: (answers: Record<string, unknown>) => boolean | Promise<boolean>
  theme?: PartialPromptTheme
  maxWidth?: number
  pagination?: {
    pageSize: number
    showNumbers: boolean
  }
  clearBefore?: boolean
  resetAfter?: boolean
  clearAfter?: boolean
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
  isDone: boolean
  cursorPosition: number
  cursorVisible: boolean
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
    inputText: colors.dim,
    text: colors.white,
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
  private isAlternateScreenActive = false

  constructor(terminal: Terminal) {
    this.terminal = terminal
  }

  async start(
    options: { useAlternateScreen: boolean } = { useAlternateScreen: true },
  ): Promise<void> {
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
    if (options.useAlternateScreen) {
      await this.terminal.write(ANSI_CODES.ALTERNATE_SCREEN_ENTER)
      this.isAlternateScreenActive = true
    }

    this.terminal.debug('PromptEngine.start() completed')
  }

  async stop(): Promise<void> {
    if (!this.isActive) return

    this.isActive = false

    await this.terminal.write(ANSI_CODES.CURSOR_SHOW)
    if (this.isAlternateScreenActive) {
      await this.terminal.write(ANSI_CODES.ALTERNATE_SCREEN_EXIT)
      this.isAlternateScreenActive = false
    }

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

  public getIsAlternateScreenActive(): boolean {
    return this.isAlternateScreenActive
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
  protected renderedLineCount = 0
  private isFirstRender = true
  private cursorBlinkInterval: number | null = null
  private readonly CURSOR_BLINK_RATE = 500
  private lastRenderTime = 0
  private readonly RENDER_DEBOUNCE_MS = 16
  private userInputActive = false
  private inputActivityTimeout: number | null = null
  private isReadyForInput = false

  protected getFilteredOptionsLength(): number {
    return 0
  }

  constructor(config: PromptConfig, engine: PromptEngine) {
    super(engine.getTerminal())
    this.config = {
      clearBefore: true,
      resetAfter: true,
      clearAfter: true,
      ...config,
    }
    this.engine = engine
    const globalTheme = Prompt.getTheme()
    const localTheme = config.theme || {}

    this.theme = {
      ...DEFAULT_THEME,
      ...globalTheme,
      ...localTheme,
      colors: {
        ...DEFAULT_THEME.colors,
        ...globalTheme.colors,
        ...localTheme.colors,
      },
      checkbox: {
        ...DEFAULT_THEME.checkbox,
        ...globalTheme.checkbox,
        ...localTheme.checkbox,
      },
    }
    this.state = this.initializeState()
    this.startCursorBlink()
  }

  public getConfig(): PromptConfig {
    return this.config
  }

  protected abstract initializeState(): PromptState
  protected abstract render(): string[]
  protected abstract handleKeyEvent(event: KeyEvent): void
  protected abstract handleMouseEvent(event: MouseEvent): void
  protected abstract getValue(): unknown

  public onKeyEvent(event: KeyEvent): void {
    if (!this.isReadyForInput) return
    this.handleKeyEvent(event)
  }

  public onMouseEvent(event: MouseEvent): void {
    if (!this.isReadyForInput) return
    this.handleMouseEvent(event)
  }

  async prompt(): Promise<PromptResult> {
    const useAlternateScreen = (this.config.clearBefore ?? true) &&
      (this.config.resetAfter ?? true) &&
      (this.config.clearAfter ?? true)

    await this.engine.start({ useAlternateScreen })

    if (
      (this.config.clearBefore ?? true) && !(this.config.resetAfter ?? true) &&
      !useAlternateScreen
    ) {
      await this.engine.getTerminal().write(
        ANSI_CODES.CLEAR_SCREEN + ANSI_CODES.CURSOR_HOME,
      )
    }

    const result = await this.promptInFlow()

    await this.engine.stop()
    return result
  }

  async promptInFlow(): Promise<PromptResult> {
    const terminal = this.engine.getTerminal()
    terminal.debug('BasePrompt.promptInFlow() called', {
      promptType: this.constructor.name,
      configType: this.config.type,
      message: this.config.message,
      filteredOptionsLength: this.getFilteredOptionsLength(),
    })

    await this.renderScreen()

    terminal.debug('BasePrompt.promptInFlow() about to setCurrentPrompt')
    this.engine.setCurrentPrompt(this)
    this.isReadyForInput = true
    terminal.debug('BasePrompt.promptInFlow() setCurrentPrompt completed', {
      filteredOptionsLength: this.getFilteredOptionsLength(),
    })

    return new Promise<PromptResult>((resolve) => {
      const cleanupAndResolve = async (
        event: 'submit' | 'cancel',
        value?: unknown,
      ) => {
        this.state.isDone = true
        this.stopCursorBlink()

        if (!this.engine.getIsAlternateScreenActive()) {
          if (this.config.clearAfter) {
            await this.clearRenderedOutput()
          } else {
            await this.renderScreen()
            await this.terminal.write('\n')
          }
        }

        submitOff()
        cancelOff()

        resolve({
          name: this.config.name || '',
          value: event === 'submit' ? value : this.state.value,
          cancelled: event === 'cancel',
        })
      }

      const submitOff = this.on(
        'submit',
        (value) => cleanupAndResolve('submit', value),
      )
      const cancelOff = this.on('cancel', () => cleanupAndResolve('cancel'))
    })
  }

  protected async renderScreen(): Promise<void> {
    const now = performance.now()
    if (now - this.lastRenderTime < this.RENDER_DEBOUNCE_MS) {
      if (!this.pendingRender) {
        this.pendingRender = true
        setTimeout(() => this.renderScreen(), this.RENDER_DEBOUNCE_MS)
      }
      return
    }

    if (this.renderingInProgress) {
      this.pendingRender = true
      return
    }

    this.renderingInProgress = true
    this.pendingRender = false
    this.lastRenderTime = now

    try {
      const lines = this.render()
      const output = lines.join('\n')
      const terminal = this.engine.getTerminal()

      if (this.engine.getIsAlternateScreenActive()) {
        await terminal.write(ANSI_CODES.CURSOR_HOME)
        await terminal.write(ANSI_CODES.CLEAR_SCREEN)
        await terminal.write(output)
      } else {
        if (this.isFirstRender) {
          await terminal.write(ANSI_CODES.CURSOR_SAVE)
          await terminal.write(output)
          this.isFirstRender = false
        } else {
          await terminal.write(ANSI_CODES.CURSOR_RESTORE)
          await terminal.write(ANSI_CODES.CLEAR_FROM_CURSOR_DOWN)
          await terminal.write(output)
        }
      }

      this.renderedLineCount = lines.length
    } finally {
      this.renderingInProgress = false

      if (this.pendingRender) {
        this.pendingRender = false
        queueMicrotask(() => this.renderScreen())
      }
    }
  }

  private async clearRenderedOutput(): Promise<void> {
    if (!this.isFirstRender) {
      await this.terminal.write(ANSI_CODES.CURSOR_RESTORE)
      await this.terminal.write(ANSI_CODES.CLEAR_FROM_CURSOR_DOWN)
      this.renderedLineCount = 0
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
    const message = this.theme.colors.primary(this.config.message)
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

  protected insertCursorInText(text: string, position: number): string {
    if (this.state.isDone) return text

    const cursor = this.state.cursorVisible ? '│' : ' '
    const beforeCursor = text.slice(0, position)
    const afterCursor = text.slice(position)

    return beforeCursor + cursor + afterCursor
  }

  protected stopCursorBlinkOnDone(): void {
    if (this.state.isDone) {
      this.stopCursorBlink()
    }
  }

  protected signalUserInput(): void {
    this.userInputActive = true
    this.state.cursorVisible = true

    if (this.inputActivityTimeout) {
      clearTimeout(this.inputActivityTimeout)
    }

    this.inputActivityTimeout = setTimeout(() => {
      this.userInputActive = false
      this.restartCursorBlink()
    }, 1000)
  }

  private startCursorBlink(): void {
    this.cursorBlinkInterval = setInterval(() => {
      if (!this.userInputActive && !this.state.isDone) {
        this.state.cursorVisible = !this.state.cursorVisible
        this.renderScreen()
      }
    }, this.CURSOR_BLINK_RATE)
  }

  private restartCursorBlink(): void {
    if (!this.userInputActive && !this.state.isDone) {
      this.startCursorBlink()
    }
  }

  private stopCursorBlink(): void {
    if (this.cursorBlinkInterval) {
      clearInterval(this.cursorBlinkInterval)
      this.cursorBlinkInterval = null
    }
    if (this.inputActivityTimeout) {
      clearTimeout(this.inputActivityTimeout)
      this.inputActivityTimeout = null
    }
  }
}

class Prompt {
  private engine: PromptEngine | null = null
  private results = new Map<string, unknown>()
  private static globalTheme: PartialPromptTheme = {}

  public setTheme(theme: PartialPromptTheme): void {
    Prompt.globalTheme = theme
  }

  public static getTheme(): PartialPromptTheme {
    return Prompt.globalTheme
  }

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
    const useAlternateScreen = (config.clearBefore ?? true) &&
      (config.resetAfter ?? true) &&
      (config.clearAfter ?? true)

    await engine.start({ useAlternateScreen })

    if (
      (config.clearBefore ?? true) && !(config.resetAfter ?? true) &&
      !useAlternateScreen
    ) {
      await engine.getTerminal().write(
        ANSI_CODES.CLEAR_SCREEN + ANSI_CODES.CURSOR_HOME,
      )
    }

    const prompt = await this.createPrompt(config, engine)
    const result = await prompt.promptInFlow()

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

    const useAlternateScreenForFlow = configs.every(
      (c) =>
        (c.clearBefore ?? true) &&
        (c.resetAfter ?? true) &&
        (c.clearAfter ?? true),
    )

    await engine.start({ useAlternateScreen: useAlternateScreenForFlow })

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

      const prompt = await this.createPrompt(config, engine)
      const result = await prompt.promptInFlow()

      if (result.cancelled) {
        const { gracefulShutdown } = await import(
          '../../utils/graceful-shutdown.ts'
        )
        await gracefulShutdown.shutdown(false, 130)
        break
      }

      if (config.name) {
        answers[config.name] = result.value
        terminal.debug('Prompt.flow() answer recorded', {
          name: config.name,
          value: result.value,
        })
      }
    }

    await engine.stop()
    terminal.debug('Prompt.flow() completed', { answers })
    return answers
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
  PartialPromptTheme,
  PromptConfig,
  PromptResult,
  PromptState,
  PromptTheme,
  SelectPromptConfig,
  TextPromptConfig,
}
