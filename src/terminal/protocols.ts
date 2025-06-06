// Unified input protocol management system

import {
  keyboard,
  type KeyboardCapabilities,
  type KeyEvent,
} from './keyboard.ts'
import { mouse, type MouseCapabilities, type MouseEvent } from './mouse.ts'
import { ANSI_CODES } from './constants.ts'
import { terminal } from './mod.ts'
// import { terminalCleanup } from './terminal-cleanup.ts'  // Commented out to avoid circular dependency

interface InputEvent {
  type: 'keyboard' | 'mouse' | 'resize' | 'focus' | 'paste'
  timestamp: number
  data: KeyEvent | MouseEvent | ResizeEvent | FocusEvent | PasteEvent
}

interface ResizeEvent {
  width: number
  height: number
  pixelWidth?: number | undefined
  pixelHeight?: number | undefined
}

interface FocusEvent {
  focused: boolean
}

interface PasteEvent {
  content: string
  formatted: boolean
}

interface InputCapabilities {
  keyboard: KeyboardCapabilities
  mouse: MouseCapabilities
  supportsResize: boolean
  supportsFocus: boolean
  supportsOSC52: boolean // Clipboard support
}

class InputProtocolManager {
  private listeners: ((event: InputEvent) => void)[] = []
  private isActive = false
  private capabilities: InputCapabilities | null = null
  private resizeHandler: (() => void) | null = null

  // constructor() {
  //   // Register cleanup handler
  //   // terminalCleanup.addCleanupHandler(async () => {
  //   //   await this.shutdown()
  //   // })
  // }

  // Initialize all input protocols
  async initialize(): Promise<boolean> {
    if (this.isActive) return true

    try {
      // Detect capabilities
      await this.detectCapabilities()

      // Enable keyboard input
      const keyboardEnabled = await keyboard.enableRawMode()
      if (!keyboardEnabled) {
        terminal.warn('InputProtocolManager', 'Failed to enable keyboard input')
        return false
      }

      // Enable mouse input
      const mouseEnabled = await mouse.enableMouse()
      if (!mouseEnabled) {
        terminal.warn('InputProtocolManager', 'Mouse input not available')
      }

      // Set up event forwarding
      this.setupEventForwarding()

      // Set up resize detection
      this.setupResizeDetection()

      // Set up focus detection
      this.setupFocusDetection()

      this.isActive = true
      return true
    } catch (error) {
      terminal.error(
        'InputProtocolManager',
        'Failed to initialize input protocols',
        error,
      )
      return false
    }
  }

  // Shutdown all input protocols
  async shutdown(): Promise<void> {
    if (!this.isActive) return

    try {
      // Disable input systems
      keyboard.disableRawMode()
      await mouse.disableMouse()

      // Clean up resize handler
      if (this.resizeHandler) {
        removeEventListener('resize', this.resizeHandler)
        this.resizeHandler = null
      }

      this.isActive = false
    } catch (error) {
      terminal.error(
        'InputProtocolManager',
        'Error shutting down input protocols',
        error,
      )
    }
  }

  // Detect all input capabilities
  private async detectCapabilities(): Promise<void> {
    const keyboardCaps = await keyboard.detectCapabilities()
    const mouseCaps = await mouse.detectCapabilities()

    this.capabilities = {
      keyboard: keyboardCaps,
      mouse: mouseCaps,
      supportsResize: true, // Most terminals support resize
      supportsFocus: this.detectFocusSupport(),
      supportsOSC52: this.detectClipboardSupport(),
    }
  }

  // Set up event forwarding from individual input systems
  private setupEventForwarding(): void {
    // Forward keyboard events
    keyboard.addEventListener((keyEvent) => {
      const inputEvent: InputEvent = {
        type: 'keyboard',
        timestamp: keyEvent.timestamp,
        data: keyEvent,
      }
      this.dispatchEvent(inputEvent)
    })

    // Forward mouse events
    mouse.addEventListener((mouseEvent) => {
      const inputEvent: InputEvent = {
        type: 'mouse',
        timestamp: mouseEvent.timestamp,
        data: mouseEvent,
      }
      this.dispatchEvent(inputEvent)
    })
  }

  // Set up terminal resize detection
  private setupResizeDetection(): void {
    // Modern terminals send SIGWINCH signal
    Deno.addSignalListener('SIGWINCH', () => {
      const size = this.getTerminalSize()
      const resizeEvent: ResizeEvent = {
        width: size.columns,
        height: size.rows,
        pixelWidth: size.pixelWidth,
        pixelHeight: size.pixelHeight,
      }

      const inputEvent: InputEvent = {
        type: 'resize',
        timestamp: Date.now(),
        data: resizeEvent,
      }

      this.dispatchEvent(inputEvent)
    })
  }

  // Set up focus detection using ANSI sequences
  private setupFocusDetection(): void {
    if (!this.capabilities?.supportsFocus) return

    // Enable focus reporting
    terminal.write(ANSI_CODES.FOCUS_TRACKING_ENABLE)

    // Focus events are handled as part of keyboard input stream
    // Focus in: \x1b[I, Focus out: \x1b[O
  }

  // Detect focus support
  private detectFocusSupport(): boolean {
    const term = Deno.env.get('TERM')
    return term?.includes('xterm') ||
      term?.includes('screen') ||
      term === 'xterm-kitty' ||
      !!Deno.env.get('KITTY_WINDOW_ID')
  }

  // Detect clipboard support (OSC 52)
  private detectClipboardSupport(): boolean {
    const term = Deno.env.get('TERM')
    return term?.includes('xterm') ||
      term === 'xterm-kitty' ||
      term?.includes('screen') ||
      !!Deno.env.get('KITTY_WINDOW_ID')
  }

  // Get current terminal size
  private getTerminalSize(): {
    columns: number
    rows: number
    pixelWidth?: number
    pixelHeight?: number
  } {
    try {
      const size = Deno.consoleSize()
      return {
        columns: size.columns,
        rows: size.rows,
      }
    } catch {
      return {
        columns: 80,
        rows: 24,
      }
    }
  }

  // Process raw input sequence and route to appropriate handler
  processRawInput(sequence: string): boolean {
    // Try mouse input first
    if (mouse.processMouseInput(sequence)) {
      return true
    }

    // Check for focus events
    if (sequence === '\x1b[I') {
      const focusEvent: FocusEvent = { focused: true }
      const inputEvent: InputEvent = {
        type: 'focus',
        timestamp: Date.now(),
        data: focusEvent,
      }
      this.dispatchEvent(inputEvent)
      return true
    }

    if (sequence === '\x1b[O') {
      const focusEvent: FocusEvent = { focused: false }
      const inputEvent: InputEvent = {
        type: 'focus',
        timestamp: Date.now(),
        data: focusEvent,
      }
      this.dispatchEvent(inputEvent)
      return true
    }

    // Check for bracketed paste
    if (sequence.startsWith('\x1b[200~')) {
      const endIndex = sequence.indexOf('\x1b[201~')
      if (endIndex !== -1) {
        const content = sequence.slice(6, endIndex)
        const pasteEvent: PasteEvent = {
          content,
          formatted: true,
        }
        const inputEvent: InputEvent = {
          type: 'paste',
          timestamp: Date.now(),
          data: pasteEvent,
        }
        this.dispatchEvent(inputEvent)
        return true
      }
    }

    // Keyboard events are handled by the keyboard input system
    return false
  }

  // Set clipboard content using OSC 52
  async setClipboard(content: string): Promise<boolean> {
    if (!this.capabilities?.supportsOSC52) return false

    try {
      const encoded = btoa(content)
      const sequence = `\x1b]52;c;${encoded}\x1b\\`
      await terminal.write(sequence)
      return true
    } catch (error) {
      terminal.error('InputProtocolManager', 'Failed to set clipboard', error)
      return false
    }
  }

  // Request clipboard content using OSC 52
  async getClipboard(): Promise<string | null> {
    if (!this.capabilities?.supportsOSC52) return null

    try {
      // Request clipboard content
      await terminal.write('\x1b]52;c;?\x1b\\')

      // In a real implementation, you'd wait for the response
      // This is a simplified version
      return null
    } catch (error) {
      terminal.error('InputProtocolManager', 'Failed to get clipboard', error)
      return null
    }
  }

  // Dispatch input event to all listeners
  private dispatchEvent(event: InputEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        terminal.error(
          'InputProtocolManager',
          'Error in input event listener',
          error,
        )
      }
    }
  }

  // Add event listener
  addEventListener(listener: (event: InputEvent) => void): () => void {
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
  removeEventListener(listener: (event: InputEvent) => void): void {
    const index = this.listeners.indexOf(listener)
    if (index >= 0) {
      this.listeners.splice(index, 1)
    }
  }

  // Filter events by type
  addKeyboardListener(listener: (event: KeyEvent) => void): () => void {
    return this.addEventListener((event) => {
      if (event.type === 'keyboard') {
        listener(event.data as KeyEvent)
      }
    })
  }

  addMouseListener(listener: (event: MouseEvent) => void): () => void {
    return this.addEventListener((event) => {
      if (event.type === 'mouse') {
        listener(event.data as MouseEvent)
      }
    })
  }

  addResizeListener(listener: (event: ResizeEvent) => void): () => void {
    return this.addEventListener((event) => {
      if (event.type === 'resize') {
        listener(event.data as ResizeEvent)
      }
    })
  }

  addFocusListener(listener: (event: FocusEvent) => void): () => void {
    return this.addEventListener((event) => {
      if (event.type === 'focus') {
        listener(event.data as FocusEvent)
      }
    })
  }

  addPasteListener(listener: (event: PasteEvent) => void): () => void {
    return this.addEventListener((event) => {
      if (event.type === 'paste') {
        listener(event.data as PasteEvent)
      }
    })
  }

  // Get current capabilities
  getCapabilities(): InputCapabilities | null {
    return this.capabilities
  }

  // Check if active
  isInputActive(): boolean {
    return this.isActive
  }

  // Get keyboard instance
  getKeyboard() {
    return keyboard
  }

  // Get mouse instance
  getMouse() {
    return mouse
  }
}

// Export singleton instance
export const inputManager = new InputProtocolManager()
export type {
  FocusEvent,
  InputCapabilities,
  InputEvent,
  PasteEvent,
  ResizeEvent,
}
