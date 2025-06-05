// Advanced mouse input handling with modern terminal protocol support
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

interface MouseEvent {
  x: number
  y: number
  button:
    | 'left'
    | 'right'
    | 'middle'
    | 'wheel-up'
    | 'wheel-down'
    | 'wheel-left'
    | 'wheel-right'
    | 'none'
  modifiers: {
    ctrl: boolean
    alt: boolean
    shift: boolean
    meta: boolean
  }
  type: 'press' | 'release' | 'drag' | 'move'
  timestamp: number
}

interface MouseCapabilities {
  supportsBasicMouse: boolean
  supportsWheelMouse: boolean
  supportsSGRMouse: boolean
  supportsUrxvtMouse: boolean
  supportsPixelMouse: boolean
  maxCoordinates: { x: number; y: number }
}

export class MouseInput {
  private capabilities: MouseCapabilities | null = null
  private listeners: ((event: MouseEvent) => void)[] = []
  private isEnabled = false
  private lastMouseState: Partial<MouseEvent> | null = null
  private dragThreshold = 3 // pixels
  private isDragging = false
  private cleanupRegistered = false

  // Detect mouse capabilities
  detectCapabilities(): MouseCapabilities {
    if (this.capabilities) return this.capabilities

    const capabilities: MouseCapabilities = {
      supportsBasicMouse: true, // Most terminals support basic mouse
      supportsWheelMouse: true,
      supportsSGRMouse: false,
      supportsUrxvtMouse: false,
      supportsPixelMouse: false,
      maxCoordinates: { x: 223, y: 223 }, // Basic mode limit
    }

    try {
      // Check terminal type
      const term = Deno.env.get('TERM')
      const kittyWindow = Deno.env.get('KITTY_WINDOW_ID')

      if (term === 'xterm-kitty' || kittyWindow) {
        capabilities.supportsSGRMouse = true
        capabilities.supportsPixelMouse = true
        capabilities.maxCoordinates = { x: 65535, y: 65535 }
      }

      if (term?.includes('xterm') || term?.includes('screen')) {
        capabilities.supportsSGRMouse = true
        capabilities.maxCoordinates = { x: 2047, y: 2047 }
      }

      if (term?.includes('rxvt') || term?.includes('urxvt')) {
        capabilities.supportsUrxvtMouse = true
        capabilities.maxCoordinates = { x: 2047, y: 2047 }
      }

      this.capabilities = capabilities
      return capabilities
    } catch (error) {
      getTerminal().then((terminal) => {
        terminal.warn(
          'MouseInput',
          'Error detecting mouse capabilities',
          error,
        )
      })
      this.capabilities = capabilities
      return capabilities
    }
  }

  // Enable mouse input
  async enableMouse(): Promise<boolean> {
    if (this.isEnabled) return true

    const caps = this.detectCapabilities()
    const terminal = await getTerminal()

    try {
      // Enable mouse tracking in order of preference
      if (caps.supportsSGRMouse) {
        // SGR mouse mode (1006) - supports large coordinates
        await terminal.write('\x1b[?1006h')

        // Enable all mouse events
        await terminal.write('\x1b[?1000h') // Basic mouse
        await terminal.write('\x1b[?1002h') // Button events and drag
        await terminal.write('\x1b[?1003h') // Any mouse movement
      } else if (caps.supportsUrxvtMouse) {
        // Urxvt mouse mode (1015)
        await terminal.write('\x1b[?1015h')
        await terminal.write('\x1b[?1000h')
      } else {
        // Basic mouse mode
        await terminal.write('\x1b[?1000h')
      }

      // Enable wheel mouse if supported
      if (caps.supportsWheelMouse) {
        await terminal.write('\x1b[?1002h')
      }

      this.isEnabled = true

      if (!this.cleanupRegistered) {
        terminalCleanup.addExternalCleanupHandler(this.cleanup.bind(this))
        this.cleanupRegistered = true
      }

      return true
    } catch (error) {
      terminal.error('MouseInput', 'Error enabling mouse input', error)
      return false
    }
  }

  // Disable mouse input
  async disableMouse(): Promise<void> {
    if (!this.isEnabled) return

    const terminal = await getTerminal()

    try {
      // Disable all mouse modes
      await terminal.write('\x1b[?1003l') // Any movement
      await terminal.write('\x1b[?1002l') // Button events and drag
      await terminal.write('\x1b[?1000l') // Basic mouse
      await terminal.write('\x1b[?1006l') // SGR mode
      await terminal.write('\x1b[?1015l') // Urxvt mode

      this.isEnabled = false
    } catch (error) {
      terminal.error('MouseInput', 'Error disabling mouse input', error)
    }
  }

  async cleanup(): Promise<void> {
    await this.disableMouse()
    const terminal = await getTerminal()
    terminal.debug('MouseInput', 'Mouse cleanup complete')
  }

  // Parse mouse input sequence
  parseMouseSequence(sequence: string): MouseEvent | null {
    // Try SGR format first: \x1b[<button;x;y;M or \x1b[<button;x;y;m
    // deno-lint-ignore no-control-regex
    // biome-ignore lint/suspicious/noControlCharactersInRegex: <explanation>
    const sgrMatch = sequence.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])/)
    if (sgrMatch) {
      return this.parseSGRMouse(sgrMatch)
    }

    // Try Urxvt format: \x1b[button;x;y;M
    // biome-ignore lint/suspicious/noControlCharactersInRegex: No explanation needed
    const urxvtMatch = sequence.match(/^\x1b\[(\d+);(\d+);(\d+)M/)
    if (urxvtMatch) {
      return this.parseUrxvtMouse(urxvtMatch)
    }

    // Try basic format: \x1b[Mbxy
    // biome-ignore lint/suspicious/noControlCharactersInRegex: No explanation needed
    const basicMatch = sequence.match(/^\x1b\[M([\s\S])([\s\S])([\s\S])/)
    if (basicMatch) {
      return this.parseBasicMouse(basicMatch)
    }

    return null
  }

  // Parse SGR mouse format
  private parseSGRMouse(match: RegExpMatchArray): MouseEvent {
    const buttonData = Number.parseInt(match[1])
    const x = Number.parseInt(match[2])
    const y = Number.parseInt(match[3])
    const isRelease = match[4] === 'm'

    const button = this.decodeMouseButton(buttonData)
    const modifiers = this.decodeModifiers(buttonData)
    const type = this.determineEventType(button, isRelease, x, y)

    const event: MouseEvent = {
      x,
      y,
      button,
      modifiers,
      type,
      timestamp: Date.now(),
    }

    this.updateMouseState(event)
    return event
  }

  // Parse Urxvt mouse format
  private parseUrxvtMouse(match: RegExpMatchArray): MouseEvent {
    const buttonData = Number.parseInt(match[1])
    const x = Number.parseInt(match[2])
    const y = Number.parseInt(match[3])

    const button = this.decodeMouseButton(buttonData)
    const modifiers = this.decodeModifiers(buttonData)
    const type = this.determineEventType(button, false, x, y)

    const event: MouseEvent = {
      x,
      y,
      button,
      modifiers,
      type,
      timestamp: Date.now(),
    }

    this.updateMouseState(event)
    return event
  }

  // Parse basic mouse format
  private parseBasicMouse(match: RegExpMatchArray): MouseEvent {
    const buttonData = match[1].charCodeAt(0) - 32
    const x = match[2].charCodeAt(0) - 32
    const y = match[3].charCodeAt(0) - 32

    const button = this.decodeMouseButton(buttonData)
    const modifiers = this.decodeModifiers(buttonData)
    const type = this.determineEventType(button, false, x, y)

    const event: MouseEvent = {
      x,
      y,
      button,
      modifiers,
      type,
      timestamp: Date.now(),
    }

    this.updateMouseState(event)
    return event
  }

  // Decode mouse button from button data
  private decodeMouseButton(buttonData: number): MouseEvent['button'] {
    const button = buttonData & 0b11
    const wheelFlag = buttonData & 0b01000000

    if (wheelFlag) {
      // Wheel events
      if (button === 0) return 'wheel-up'
      if (button === 1) return 'wheel-down'
      if (button === 2) return 'wheel-left'
      if (button === 3) return 'wheel-right'
    }

    // Regular buttons
    if (button === 0) return 'left'
    if (button === 1) return 'middle'
    if (button === 2) return 'right'
    if (button === 3) return 'none' // Release or move

    return 'none'
  }

  // Decode modifier keys from button data
  private decodeModifiers(buttonData: number): MouseEvent['modifiers'] {
    return {
      shift: (buttonData & 0b00000100) !== 0,
      alt: (buttonData & 0b00001000) !== 0,
      ctrl: (buttonData & 0b00010000) !== 0,
      meta: false, // Not typically available in mouse events
    }
  }

  // Determine event type based on context
  private determineEventType(
    button: MouseEvent['button'],
    isRelease: boolean,
    x: number,
    y: number,
  ): MouseEvent['type'] {
    if (button.startsWith('wheel-')) {
      return 'press' // Wheel events are always presses
    }

    if (isRelease || button === 'none') {
      this.isDragging = false
      return 'release'
    }

    // Check if this is a drag event
    if (this.lastMouseState && this.lastMouseState.type === 'press') {
      const deltaX = Math.abs(x - (this.lastMouseState.x || 0))
      const deltaY = Math.abs(y - (this.lastMouseState.y || 0))

      if (deltaX > this.dragThreshold || deltaY > this.dragThreshold) {
        this.isDragging = true
        return 'drag'
      }
    }

    if (this.isDragging) {
      return 'drag'
    }

    // Check if this is a move event (no button pressed)
    if (button === 'none' as MouseEvent['button']) {
      return 'move'
    }

    return 'press'
  }

  // Update internal mouse state
  private updateMouseState(event: MouseEvent): void {
    this.lastMouseState = { ...event }
  }

  // Process mouse input sequence
  processMouseInput(sequence: string): boolean {
    const event = this.parseMouseSequence(sequence)
    if (!event) return false

    this.dispatchMouseEvent(event)
    return true
  }

  // Dispatch mouse event to listeners
  private dispatchMouseEvent(event: MouseEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        getTerminal().then((terminal) => {
          terminal.error(
            'MouseInput',
            'Error in mouse event listener',
            error,
          )
        })
      }
    }
  }

  // Add event listener
  addEventListener(listener: (event: MouseEvent) => void): () => void {
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
  removeEventListener(listener: (event: MouseEvent) => void): void {
    const index = this.listeners.indexOf(listener)
    if (index >= 0) {
      this.listeners.splice(index, 1)
    }
  }

  // Set drag threshold
  setDragThreshold(threshold: number): void {
    this.dragThreshold = Math.max(1, threshold)
  }

  // Get drag threshold
  getDragThreshold(): number {
    return this.dragThreshold
  }

  // Check if mouse is enabled
  isMouseEnabled(): boolean {
    return this.isEnabled
  }

  // Get current capabilities
  getCapabilities(): MouseCapabilities | null {
    return this.capabilities
  }

  // Get last mouse position
  getLastMousePosition(): { x: number; y: number } | null {
    if (!this.lastMouseState) return null
    return { x: this.lastMouseState.x || 0, y: this.lastMouseState.y || 0 }
  }

  // Check if currently dragging
  isDragInProgress(): boolean {
    return this.isDragging
  }
}

// Export singleton instance
export const mouse = new MouseInput()

export type { MouseCapabilities, MouseEvent }
