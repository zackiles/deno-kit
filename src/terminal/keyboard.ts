// Advanced keyboard input handling with modern terminal protocol support

import { terminalCleanup } from './terminal-cleanup.ts'
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

interface KeyEvent {
  key: string
  code?: string
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
  type: 'press' | 'release' | 'repeat'
  timestamp: number
}

interface KeyboardCapabilities {
  supportsKittyProtocol: boolean
  supportsModifyOtherKeys: boolean
  supportsBracketedPaste: boolean
  supportsKeyRelease: boolean
}

// Special key mappings for different protocols
const ANSI_KEY_MAP: Record<string, string> = {
  '\x1b[A': 'ArrowUp',
  '\x1b[B': 'ArrowDown',
  '\x1b[C': 'ArrowRight',
  '\x1b[D': 'ArrowLeft',
  '\x1b[H': 'Home',
  '\x1b[F': 'End',
  '\x1b[1~': 'Home',
  '\x1b[4~': 'End',
  '\x1b[2~': 'Insert',
  '\x1b[3~': 'Delete',
  '\x1b[5~': 'PageUp',
  '\x1b[6~': 'PageDown',
  '\x1bOP': 'F1',
  '\x1bOQ': 'F2',
  '\x1bOR': 'F3',
  '\x1bOS': 'F4',
  '\x1b[15~': 'F5',
  '\x1b[17~': 'F6',
  '\x1b[18~': 'F7',
  '\x1b[19~': 'F8',
  '\x1b[20~': 'F9',
  '\x1b[21~': 'F10',
  '\x1b[23~': 'F11',
  '\x1b[24~': 'F12',
  '\x7f': 'Backspace',
  '\x08': 'Backspace', // Additional backspace mapping for macOS
  '\x1b\x7f': 'Backspace', // Alt+Backspace on some terminals
  '\x1b': 'Escape',
  '\t': 'Tab',
  '\r': 'Enter',
  '\n': 'Enter',
  ' ': 'Space',
}

// Control key mappings
const CTRL_KEY_MAP: Record<string, string> = {
  '\x01': 'a',
  '\x02': 'b',
  '\x03': 'c',
  '\x04': 'd',
  '\x05': 'e',
  '\x06': 'f',
  '\x07': 'g',
  '\x08': 'h',
  '\x09': 'i',
  '\x0a': 'j',
  '\x0b': 'k',
  '\x0c': 'l',
  '\x0d': 'm',
  '\x0e': 'n',
  '\x0f': 'o',
  '\x10': 'p',
  '\x11': 'q',
  '\x12': 'r',
  '\x13': 's',
  '\x14': 't',
  '\x15': 'u',
  '\x16': 'v',
  '\x17': 'w',
  '\x18': 'x',
  '\x19': 'y',
  '\x1a': 'z',
}

class KeyboardInput {
  private capabilities: KeyboardCapabilities | null = null
  private listeners: ((event: KeyEvent) => void)[] = []
  private isLoopRunning = false
  private decoder = new TextDecoder()
  private buffer = ''
  private bracketedPasteMode = false
  private cleanupRegistered = false
  private lastEventTime = 0
  private lastEventKey = ''

  // Detect terminal keyboard capabilities
  detectCapabilities(): KeyboardCapabilities {
    if (this.capabilities) return this.capabilities

    const capabilities: KeyboardCapabilities = {
      supportsKittyProtocol: false,
      supportsModifyOtherKeys: false,
      supportsBracketedPaste: false,
      supportsKeyRelease: false,
    }

    try {
      // Check environment variables
      const term = Deno.env.get('TERM')
      const kittyWindow = Deno.env.get('KITTY_WINDOW_ID')

      if (term === 'xterm-kitty' || kittyWindow) {
        capabilities.supportsKittyProtocol = true
        capabilities.supportsKeyRelease = true
        capabilities.supportsBracketedPaste = true
      }

      // Check for XTerm
      if (term?.includes('xterm')) {
        capabilities.supportsModifyOtherKeys = true
        capabilities.supportsBracketedPaste = true
      }

      this.capabilities = capabilities
      return capabilities
    } catch (error) {
      getTerminal().then((terminal) => {
        terminal.warn(
          'KeyboardInput',
          'Error detecting keyboard capabilities',
          error,
        )
      })
      this.capabilities = capabilities
      return capabilities
    }
  }

  // Enable Kitty keyboard protocol
  async enableKittyProtocol(): Promise<boolean> {
    const caps = this.detectCapabilities()
    if (!caps.supportsKittyProtocol) return false

    try {
      // Enable Kitty keyboard protocol with all features
      // Flags: report all keys, report repeat, report release, report alternate keys
      const terminal = await getTerminal()
      await terminal.write('\x1b[>1u')
      return true
    } catch (error) {
      const terminal = await getTerminal()
      terminal.error(
        'KeyboardInput',
        'Error enabling Kitty protocol',
        error,
      )
      return false
    }
  }

  // Disable Kitty keyboard protocol
  async disableKittyProtocol(): Promise<void> {
    try {
      const terminal = await getTerminal()
      await terminal.write('\x1b[<1u')
    } catch (error) {
      const terminal = await getTerminal()
      terminal.error(
        'KeyboardInput',
        'Error disabling Kitty protocol',
        error,
      )
    }
  }

  // Enable XTerm modifyOtherKeys
  async enableModifyOtherKeys(): Promise<boolean> {
    const caps = this.detectCapabilities()
    if (!caps.supportsModifyOtherKeys) return false

    try {
      // Level 2: report all modifier combinations
      const terminal = await getTerminal()
      await terminal.write('\x1b[>4;2m')
      return true
    } catch (error) {
      const terminal = await getTerminal()
      terminal.error(
        'KeyboardInput',
        'Error enabling modifyOtherKeys',
        error,
      )
      return false
    }
  }

  // Enable bracketed paste mode
  async enableBracketedPaste(): Promise<boolean> {
    const caps = this.detectCapabilities()
    if (!caps.supportsBracketedPaste) return false

    try {
      const terminal = await getTerminal()
      await terminal.write('\x1b[?2004h')
      this.bracketedPasteMode = true
      return true
    } catch (error) {
      const terminal = await getTerminal()
      terminal.error(
        'KeyboardInput',
        'Error enabling bracketed paste',
        error,
      )
      return false
    }
  }

  // Disable bracketed paste mode
  async disableBracketedPaste(): Promise<void> {
    try {
      const terminal = await getTerminal()
      await terminal.write('\x1b[?2004l')
      this.bracketedPasteMode = false
    } catch (error) {
      const terminal = await getTerminal()
      terminal.error(
        'KeyboardInput',
        'Error disabling bracketed paste',
        error,
      )
    }
  }

  // Enable raw mode for input capture
  async enableRawMode(): Promise<boolean> {
    const terminal = await getTerminal()

    if (terminal.isRaw && this.isLoopRunning) {
      // Already in raw mode with loop running
      return true
    }

    if (terminal.isRaw && !this.isLoopRunning) {
      // We think we're in raw mode but loop isn't running - restart it
      try {
        if (!Deno.stdin.isTerminal()) {
          return false
        }
        this.startInputLoop()
        return true
      } catch (_error) {
        // If we can't work with stdin, reset and try again
        terminal.setRaw(false)
        this.isLoopRunning = false
      }
    }

    try {
      terminal.setRaw(true)

      // Enable modern keyboard protocols
      await this.enableKittyProtocol()
      await this.enableModifyOtherKeys()
      await this.enableBracketedPaste()

      if (!this.cleanupRegistered) {
        terminalCleanup.addExternalCleanupHandler(this.cleanup.bind(this))
        this.cleanupRegistered = true
      }

      this.startInputLoop()
      return true
    } catch (error) {
      terminal.error('KeyboardInput', 'Error enabling raw mode', error)
      return false
    }
  }

  // Disable raw mode
  async disableRawMode(): Promise<void> {
    const terminal = await getTerminal()
    if (!terminal.isRaw) return

    try {
      this.isLoopRunning = false
      terminal.setRaw(false)
    } catch (error) {
      terminal.error('KeyboardInput', 'Error disabling raw mode', error)
    }
  }

  // Start the input processing loop
  private async startInputLoop(): Promise<void> {
    if (this.isLoopRunning) {
      // Loop already running, don't start another
      return
    }

    this.isLoopRunning = true
    const buffer = new Uint8Array(1024)
    const terminal = await getTerminal()

    while (terminal.isRaw && this.isLoopRunning) {
      try {
        const bytesRead = await Deno.stdin.read(buffer)
        if (!bytesRead) continue

        const data = this.decoder.decode(buffer.slice(0, bytesRead))
        this.buffer += data
        this.processInputBuffer()
      } catch (error) {
        if (terminal.isRaw) {
          terminal.error('KeyboardInput', 'Input loop error', error)
        }
        break
      }
    }

    this.isLoopRunning = false
  }

  // Process accumulated input buffer
  private processInputBuffer(): void {
    let iterations = 0
    const maxIterations = 100 // Prevent infinite loops

    while (this.buffer.length > 0 && iterations < maxIterations) {
      iterations++
      const bufferLengthBefore = this.buffer.length
      const event = this.parseNextKeyEvent()

      if (!event) {
        // If buffer didn't change and no event was parsed, we might have garbage
        if (
          this.buffer.length === bufferLengthBefore && this.buffer.length > 0
        ) {
          // Remove first character to prevent infinite loop
          this.buffer = this.buffer.slice(1)
        }
        break
      }

      this.dispatchKeyEvent(event)
    }
  }

  // Parse the next key event from buffer
  private parseNextKeyEvent(): KeyEvent | null {
    if (this.buffer.length === 0) return null

    // Handle bracketed paste
    if (this.buffer.startsWith('\x1b[200~')) {
      const endIndex = this.buffer.indexOf('\x1b[201~')
      if (endIndex === -1) return null // Incomplete paste

      const pasteContent = this.buffer.slice(6, endIndex)
      this.buffer = this.buffer.slice(endIndex + 6)

      return {
        key: pasteContent,
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
        type: 'press',
        timestamp: performance.now(),
      }
    }

    // Check for mouse sequences FIRST before other parsing
    const mouseSequence = this.extractMouseSequence()
    if (mouseSequence) {
      this.handleMouseSequence(mouseSequence)
      return null // Mouse sequence was handled, continue parsing
    }

    // If mouse sequence detection returns null due to incomplete sequence, wait
    if (this.isIncompleteMouseSequence()) {
      return null // Wait for more data
    }

    // Try Kitty protocol first
    const kittyEvent = this.parseKittySequence()
    if (kittyEvent) return kittyEvent

    // Try XTerm sequences
    const xtermEvent = this.parseXTermSequence()
    if (xtermEvent) return xtermEvent

    // Try standard ANSI sequences
    const ansiEvent = this.parseAnsiSequence()
    if (ansiEvent) return ansiEvent

    // Single character
    const char = this.buffer[0]
    this.buffer = this.buffer.slice(1)

    return this.createKeyEvent(char, false, false, false, false)
  }

  // Parse Kitty keyboard protocol sequence
  private parseKittySequence(): KeyEvent | null {
    // Kitty format: \x1b[unicode;modifiers;type;state;alternate_key
    // biome-ignore lint/suspicious/noControlCharactersInRegex: No explanation needed
    const match = this.buffer.match(/^\x1b\[(\d+);(\d+);(\d+);(\d+);(\d+)u/)
    if (!match) return null

    this.buffer = this.buffer.slice(match[0].length)

    const unicode = Number.parseInt(match[1])
    const modifiers = Number.parseInt(match[2])
    const type = Number.parseInt(match[3])

    const ctrl = (modifiers & 4) !== 0
    const alt = (modifiers & 2) !== 0
    const shift = (modifiers & 1) !== 0
    const meta = (modifiers & 8) !== 0

    const eventType = type === 1 ? 'press' : type === 2 ? 'repeat' : 'release'
    const key = String.fromCharCode(unicode)

    return {
      key,
      ctrl,
      alt,
      shift,
      meta,
      type: eventType,
      timestamp: Date.now(),
    }
  }

  // Parse XTerm modifyOtherKeys sequence
  private parseXTermSequence(): KeyEvent | null {
    // XTerm format: \x1b[27;modifiers;unicode~
    // biome-ignore lint/suspicious/noControlCharactersInRegex: No explanation needed`
    const match = this.buffer.match(/^\x1b\[27;(\d+);(\d+)~/)
    if (!match) return null

    this.buffer = this.buffer.slice(match[0].length)

    const modifiers = Number.parseInt(match[1])
    const unicode = Number.parseInt(match[2])

    const ctrl = (modifiers & 4) !== 0
    const alt = (modifiers & 2) !== 0
    const shift = (modifiers & 1) !== 0
    const meta = (modifiers & 8) !== 0

    const key = String.fromCharCode(unicode)

    return {
      key,
      ctrl,
      alt,
      shift,
      meta,
      type: 'press',
      timestamp: Date.now(),
    }
  }

  // Parse standard ANSI escape sequences
  private parseAnsiSequence(): KeyEvent | null {
    // Try longest sequences first
    for (
      const sequence of Object.keys(ANSI_KEY_MAP).sort((a, b) =>
        b.length - a.length
      )
    ) {
      if (this.buffer.startsWith(sequence)) {
        this.buffer = this.buffer.slice(sequence.length)
        const key = ANSI_KEY_MAP[sequence]

        return {
          key,
          ctrl: false,
          alt: false,
          shift: false,
          meta: false,
          type: 'press',
          timestamp: Date.now(),
        }
      }
    }

    return null
  }

  // Extract complete mouse sequence from buffer if present
  private extractMouseSequence(): string | null {
    if (this.buffer.length === 0) return null

    // SGR mouse format: \x1b[<button;x;y;M or \x1b[<button;x;y;m
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Mouse sequence detection
    const sgrMatch = this.buffer.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])/)
    if (sgrMatch) {
      const sequence = sgrMatch[0]
      this.buffer = this.buffer.slice(sequence.length)
      return sequence
    }

    // Urxvt mouse format: \x1b[button;x;y;M
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Mouse sequence detection
    const urxvtMatch = this.buffer.match(/^\x1b\[(\d+);(\d+);(\d+)M/)
    if (urxvtMatch) {
      const sequence = urxvtMatch[0]
      this.buffer = this.buffer.slice(sequence.length)
      return sequence
    }

    // Basic mouse format: \x1b[Mbxy (3 bytes after M)
    if (this.buffer.startsWith('\x1b[M') && this.buffer.length >= 6) {
      const sequence = this.buffer.slice(0, 6)
      this.buffer = this.buffer.slice(6)
      return sequence
    }

    return null
  }

  // Check if buffer contains incomplete mouse sequence that we should wait for
  private isIncompleteMouseSequence(): boolean {
    if (this.buffer.length === 0) return false

    // SGR mouse incomplete: \x1b[< followed by partial digits/semicolons
    if (this.buffer.startsWith('\x1b[<')) {
      // Only wait if we have a partial sequence, not invalid sequences
      // biome-ignore lint/suspicious/noControlCharactersInRegex: Mouse sequence detection
      return /^\x1b\[<(\d*;?\d*;?\d*)?$/.test(this.buffer) &&
        this.buffer.length < 20
    }

    // Basic mouse incomplete: \x1b[M with less than 3 bytes following
    if (this.buffer.startsWith('\x1b[M') && this.buffer.length < 6) {
      return true
    }

    return false
  }

  // External mouse handler (can be set by prompt system)
  private mouseHandler: ((sequence: string) => boolean) | null = null

  setMouseHandler(handler: ((sequence: string) => boolean) | null): void {
    this.mouseHandler = handler
  }

  private handleMouseSequence(sequence: string): void {
    if (this.mouseHandler) {
      const handled = this.mouseHandler(sequence)
      if (handled) {
        return // Mouse sequence was successfully handled
      }
    }
    // If no handler or handler didn't consume it, just discard to prevent printing
    // This prevents mouse sequences from appearing as raw text in terminal
  }

  // Create key event from character
  private createKeyEvent(
    char: string,
    ctrl: boolean,
    alt: boolean,
    shift: boolean,
    meta: boolean,
  ): KeyEvent {
    let key = char
    let isCtrl = ctrl

    // Check for control characters
    if (char.charCodeAt(0) < 32) {
      const ctrlKey = CTRL_KEY_MAP[char]
      if (ctrlKey) {
        key = ctrlKey
        isCtrl = true
      }
    }

    // Handle printable characters
    if (char.length === 1 && char.charCodeAt(0) >= 32) {
      key = char
    }

    return {
      key,
      ctrl: isCtrl,
      alt,
      shift,
      meta,
      type: 'press',
      timestamp: Date.now(),
    }
  }

  // Dispatch key event to listeners
  private dispatchKeyEvent(event: KeyEvent): void {
    // Prevent duplicate events, but be more lenient with text input
    const eventKey =
      `${event.key}-${event.ctrl}-${event.alt}-${event.shift}-${event.meta}`
    const timeDiff = event.timestamp - this.lastEventTime

    // Only deduplicate non-text characters and events that are very close together
    const isTextChar = event.key.length === 1 &&
      event.key.charCodeAt(0) >= 32 && event.key.charCodeAt(0) <= 126

    if (eventKey === this.lastEventKey && timeDiff < (isTextChar ? 10 : 50)) {
      return // Skip duplicate event - shorter window for text, longer for special keys
    }

    this.lastEventTime = event.timestamp
    this.lastEventKey = eventKey

    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        getTerminal().then((terminal) => {
          terminal.error(
            'KeyboardInput',
            'Error in key event listener',
            error,
          )
        })
      }
    }
  }

  // Add event listener
  addEventListener(listener: (event: KeyEvent) => void): () => void {
    this.listeners.push(listener)

    // Return cleanup function
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index >= 0) {
        this.listeners.splice(index, 1)
      }
    }
  }

  // Remove event listener
  removeEventListener(listener: (event: KeyEvent) => void): void {
    const index = this.listeners.indexOf(listener)
    if (index >= 0) {
      this.listeners.splice(index, 1)
    }
  }

  // Get current capabilities
  getCapabilities(): KeyboardCapabilities | null {
    return this.capabilities
  }

  // Check if in raw mode
  async isInRawMode(): Promise<boolean> {
    const terminal = await getTerminal()
    return terminal.isRaw
  }

  async cleanup(): Promise<void> {
    const terminal = await getTerminal()
    if (!terminal.isRaw) return

    try {
      await this.disableKittyProtocol()
      await this.disableBracketedPaste()
      this.isLoopRunning = false
      terminal.setRaw(false)
      terminal.debug('KeyboardInput', 'Keyboard cleanup complete')
    } catch (error) {
      terminal.error('KeyboardInput', 'Error during keyboard cleanup', error)
    }
  }
}

// Export singleton instance
export const keyboard = new KeyboardInput()
export { ANSI_KEY_MAP, CTRL_KEY_MAP, KeyboardInput }
export type { KeyboardCapabilities, KeyEvent }
