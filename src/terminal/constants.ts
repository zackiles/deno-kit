export const DEFAULT_TERMINAL_WIDTH = 80
export const DEFAULT_TERMINAL_HEIGHT = 24
export const MIN_TERMINAL_WIDTH = 20
export const MIN_TERMINAL_HEIGHT = 5

// ANSI escape sequences
export const ANSI_CODES = {
  // Cursor control
  CURSOR_HIDE: '\x1b[?25l',
  CURSOR_SHOW: '\x1b[?25h',
  CURSOR_HOME: '\x1b[H',
  CURSOR_SAVE: '\x1b[s',
  CURSOR_RESTORE: '\x1b[u',

  // Screen control
  CLEAR_SCREEN: '\x1b[2J',
  CLEAR_LINE: '\x1b[2K',
  CLEAR_FROM_CURSOR_DOWN: '\x1b[0J',
  ALTERNATE_SCREEN_ENTER: '\x1b[?1049h',
  ALTERNATE_SCREEN_EXIT: '\x1b[?1049l',

  // Mouse support
  MOUSE_ENABLE: '\x1b[?1000h\x1b[?1006h',
  MOUSE_DISABLE: '\x1b[?1000l\x1b[?1006l',
  MOUSE_BASIC_ENABLE: '\x1b[?1000h',
  MOUSE_BASIC_DISABLE: '\x1b[?1000l',
  MOUSE_BUTTON_EVENT_ENABLE: '\x1b[?1002h',
  MOUSE_BUTTON_EVENT_DISABLE: '\x1b[?1002l',
  MOUSE_ANY_EVENT_ENABLE: '\x1b[?1003h',
  MOUSE_ANY_EVENT_DISABLE: '\x1b[?1003l',
  MOUSE_SGR_MODE_ENABLE: '\x1b[?1006h',
  MOUSE_SGR_MODE_DISABLE: '\x1b[?1006l',
  MOUSE_URXVT_MODE_ENABLE: '\x1b[?1015h',
  MOUSE_URXVT_MODE_DISABLE: '\x1b[?1015l',

  // Keyboard protocols
  KITTY_KEYBOARD_ENABLE: '\x1b[>1u',
  KITTY_KEYBOARD_DISABLE: '\x1b[<u',
  BRACKETED_PASTE_ENABLE: '\x1b[?2004h',
  BRACKETED_PASTE_DISABLE: '\x1b[?2004l',
  MODIFY_OTHER_KEYS_ENABLE: '\x1b[>4;2m',

  // Focus events
  FOCUS_TRACKING_ENABLE: '\x1b[?1004h',
  FOCUS_TRACKING_DISABLE: '\x1b[?1004l',
} as const

// Graphics protocol detection
export const GRAPHICS_PROTOCOLS = {
  SIXEL: 'sixel',
  KITTY: 'kitty',
  ITERM2: 'iterm2',
} as const

// Color formats
export const COLOR_FORMATS = {
  RGB_24BIT: 'rgb24',
  RGB_256: 'rgb256',
  RGB_16: 'rgb16',
  RGB_8: 'rgb8',
} as const

// Input event types
export const INPUT_TYPES = {
  KEYBOARD: 'keyboard',
  MOUSE: 'mouse',
  PASTE: 'paste',
  FOCUS: 'focus',
  RESIZE: 'resize',
} as const

// Layout constraint defaults
export const CONSTRAINT_DEFAULTS = {
  MIN_WIDTH: 0,
  MIN_HEIGHT: 0,
  MAX_WIDTH: Number.MAX_SAFE_INTEGER,
  MAX_HEIGHT: Number.MAX_SAFE_INTEGER,
  DEFAULT_PRIORITY: 1000,
} as const

export const RESET_SEQUENCE = [
  // Reset all terminal modes and attributes
  '\x1b[!p', // Soft terminal reset
  '\x1b[?25h', // Show cursor
  '\x1b[?1000l', // Disable mouse tracking
  '\x1b[?1002l', // Disable button event mouse tracking
  '\x1b[?1003l', // Disable any motion mouse tracking
  '\x1b[?1006l', // Disable SGR mouse mode
  '\x1b[?2004l', // Disable bracketed paste
  '\x1b[?1004l', // Disable focus tracking
  '\x1b[?47l', // Exit alternate screen (old method)
  '\x1b[?1049l', // Exit alternate screen (new method)
  '\x1b[0m', // Reset all text attributes
  '\x1b[2J', // Clear entire screen
  '\x1b[H', // Move cursor to home position
].join('')

// Special key mappings for different protocols
export const ANSI_KEY_MAP: Record<string, string> = {
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
} as const

// Control key mappings
export const CTRL_KEY_MAP: Record<string, string> = {
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
} as const
