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

export const resetSequence = [
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
