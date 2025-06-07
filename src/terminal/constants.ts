/**
 * @module terminal/constants
 *
 * Provides a comprehensive set of constants for raw terminal manipulation.
 *
 * This module exports various constants required for building advanced terminal
 * user interfaces (TUIs), including ANSI escape codes for cursor control,
 * screen clearing, text styling, and mouse/keyboard event handling. It also
 * includes key maps for interpreting input sequences and default values for
 * terminal dimensions and constraints.
 *
 * @note IMPORTANT: ALWAYS U+2022 (•) and U+25A0–25FF (shapes) for maximum compatibility
 *
 * @example
 * ```ts
 * import { ANSI_CODES } from "./constants.ts";
 *
 * // Hide the cursor and clear the screen
 * Deno.stdout.writeSync(new TextEncoder().encode(
 *   ANSI_CODES.CURSOR_HIDE + ANSI_CODES.CLEAR_SCREEN
 * ));
 * ```
 *
 * @see {@link https://en.wikipedia.org/wiki/ANSI_escape_code|ANSI escape code - Wikipedia}
 */
const DEFAULT_TERMINAL_WIDTH = 80
const DEFAULT_TERMINAL_HEIGHT = 24
const MIN_TERMINAL_WIDTH = 20
const MIN_TERMINAL_HEIGHT = 5

const ANSI_CODES = {
  /**
   * Cursor control
   */
  // Makes the terminal cursor invisible.
  CURSOR_HIDE: '\x1b[?25l',
  // Makes the terminal cursor visible.
  CURSOR_SHOW: '\x1b[?25h',
  // Moves the cursor to the top-left corner of the screen (position 1,1).
  CURSOR_HOME: '\x1b[H',
  // Saves the current cursor position, which can be restored later.
  CURSOR_SAVE: '\x1b[s',
  // Restores the cursor to the last saved position.
  CURSOR_RESTORE: '\x1b[u',
  // Moves cursor up `n` lines.
  CURSOR_UP: (n = 1) => `\x1b[${n}A`,
  // Moves cursor down `n` lines.
  CURSOR_DOWN: (n = 1) => `\x1b[${n}B`,
  // Moves cursor forward `n` columns.
  CURSOR_FORWARD: (n = 1) => `\x1b[${n}C`,
  // Moves cursor backward `n` columns.
  CURSOR_BACKWARD: (n = 1) => `\x1b[${n}D`,
  // Moves the cursor to a specific line and column.
  CURSOR_POSITION: (line = 1, column = 1) => `\x1b[${line};${column}H`,

  /**
   * Screen control
   */
  // Clears the entire visible screen content.
  CLEAR_SCREEN: '\x1b[2J',
  // A comprehensive clear: resets styles, clears screen and scrollback, and moves cursor home.
  CLEAR_SCREEN_FULL: '\x1b[0m\x1b[2J\x1b[3J\x1b[H',
  // Clears the entire line where the cursor is currently located.
  CLEAR_LINE: '\x1b[2K',
  // Clears from the cursor to the end of the line.
  CLEAR_LINE_TO_END: '\x1b[0K',
  // Clears from the start of the line to the cursor.
  CLEAR_LINE_TO_START: '\x1b[1K',
  // Clears the screen from the current cursor position to the bottom of the screen.
  CLEAR_FROM_CURSOR_DOWN: '\x1b[0J',
  // Switches to the alternate screen buffer, used by full-screen applications.
  ALTERNATE_SCREEN_ENTER: '\x1b[?1049h',
  // Exits the alternate screen buffer and restores the original screen.
  ALTERNATE_SCREEN_EXIT: '\x1b[?1049l',

  /**
   * Style control
   */
  // Resets all terminal styles and sets the foreground text color to white.
  STYLE_BASE: '\x1b[0m\x1b[38;2;255;255;255m',
  // Resets all text attributes (color, bold, italic, etc.) to their default state.
  STYLE_RESET: '\x1b[0m',
  // Renders text in bold or increased intensity.
  STYLE_BOLD: '\x1b[1m',
  // Renders text in a faint or dimmed style.
  STYLE_DIM: '\x1b[2m',
  // Renders text in italic.
  STYLE_ITALIC: '\x1b[3m',
  // Renders text with an underline.
  STYLE_UNDERLINE: '\x1b[4m',
  // Renders text with a blinking effect.
  STYLE_BLINK: '\x1b[5m',
  // Swaps the foreground and background colors.
  STYLE_INVERSE: '\x1b[7m',
  // Renders text with a strikethrough.
  STYLE_STRIKETHROUGH: '\x1b[9m',
  // Resets bold and dim styles to normal intensity.
  STYLE_NORMAL_INTENSITY: '\x1b[22m',
  // Disables the italic style.
  STYLE_NO_ITALIC: '\x1b[23m',
  // Disables the underline style.
  STYLE_NO_UNDERLINE: '\x1b[24m',
  // Disables the blinking effect.
  STYLE_NO_BLINK: '\x1b[25m',
  // Disables the inverse style.
  STYLE_NO_INVERSE: '\x1b[27m',
  // Disables the strikethrough style.
  STYLE_NO_STRIKETHROUGH: '\x1b[29m',

  /**
   * Mouse support
   */
  // Enables advanced mouse tracking (button, motion, and SGR pixel-level reporting).
  MOUSE_ENABLE: '\x1b[?1000h\x1b[?1006h',
  // Disables all mouse tracking modes.
  MOUSE_DISABLE: '\x1b[?1000l\x1b[?1006l',
  // Enables basic X10-style mouse reporting for button presses.
  MOUSE_BASIC_ENABLE: '\x1b[?1000h',
  // Disables basic X10-style mouse reporting.
  MOUSE_BASIC_DISABLE: '\x1b[?1000l',
  // Enables reporting of mouse movement while a button is pressed.
  MOUSE_BUTTON_EVENT_ENABLE: '\x1b[?1002h',
  // Disables reporting of mouse movement with a button pressed.
  MOUSE_BUTTON_EVENT_DISABLE: '\x1b[?1002l',
  // Enables reporting of all mouse movement, regardless of button state.
  MOUSE_ANY_EVENT_ENABLE: '\x1b[?1003h',
  // Disables reporting of all mouse movement.
  MOUSE_ANY_EVENT_DISABLE: '\x1b[?1003l',
  // Enables SGR (Select Graphic Rendition) pixel-level mouse reporting for precise coordinates.
  MOUSE_SGR_MODE_ENABLE: '\x1b[?1006h',
  // Disables SGR pixel-level mouse reporting.
  MOUSE_SGR_MODE_DISABLE: '\x1b[?1006l',
  // Enables a mouse reporting protocol compatible with urxvt terminals.
  MOUSE_URXVT_MODE_ENABLE: '\x1b[?1015h',
  // Disables the urxvt-compatible mouse reporting protocol.
  MOUSE_URXVT_MODE_DISABLE: '\x1b[?1015l',

  /**
   * Keyboard protocols
   */
  // Enables the Kitty keyboard protocol for advanced key reporting.
  KITTY_KEYBOARD_ENABLE: '\x1b[>1u',
  // Disables the Kitty keyboard protocol.
  KITTY_KEYBOARD_DISABLE: '\x1b[<u',
  // Enables bracketed paste mode to distinguish pasted text from typed input.
  BRACKETED_PASTE_ENABLE: '\x1b[?2004h',
  // Disables bracketed paste mode.
  BRACKETED_PASTE_DISABLE: '\x1b[?2004l',
  // Enables xterm's 'modifyOtherKeys' level 2, for detailed key event reporting.
  MODIFY_OTHER_KEYS_ENABLE: '\x1b[>4;2m',

  /**
   * Focus events
   */
  // Enables terminal focus tracking, reporting when the window gains or loses focus.
  FOCUS_TRACKING_ENABLE: '\x1b[?1004h',
  // Disables terminal focus tracking.
  FOCUS_TRACKING_DISABLE: '\x1b[?1004l',
} as const

/**
 * Available end-of-line (EOL) characters for different operating systems and special formatting.
 * These characters are used to terminate lines in text, with different systems historically
 * using different conventions.
 */
const EOL = {
  /** Unix/Linux/macOS style line ending */
  LF: '\n',
  /** Windows style line ending */
  CRLF: '\r\n',
  /** Classic Mac style line ending (pre-OSX) */
  CR: '\r',
  /** Vertical tab character */
  VT: '\v',
  /** Form feed character */
  FF: '\f',
} as const

/**
 * Box drawing characters for creating borders, tables, trees, and other structured layouts.
 * Includes various styles (single, double, bold) for horizontal and vertical lines, corners, and intersections.
 */
const BOX = {
  HORIZONTAL: {
    /** Single horizontal line ─ */
    SINGLE: '─',
    /** Double horizontal line ═ */
    DOUBLE: '═',
    /** Bold horizontal line ━ */
    BOLD: '━',
    /** Dashed horizontal line ┄ */
    DASHED: '┄',
    /** Dotted horizontal line ┈ */
    DOTTED: '┈',
  },
  VERTICAL: {
    /** Single vertical line │ */
    SINGLE: '│',
    /** Double vertical line ║ */
    DOUBLE: '║',
    /** Bold vertical line ┃ */
    BOLD: '┃',
    /** Dashed vertical line ┆ */
    DASHED: '┆',
    /** Dotted vertical line ┊ */
    DOTTED: '┊',
  },
  CORNER: {
    /** Top-left corner (single) ┌ */
    TOP_LEFT: '┌',
    /** Top-right corner (single) ┐ */
    TOP_RIGHT: '┐',
    /** Bottom-left corner (single) └ */
    BOTTOM_LEFT: '└',
    /** Bottom-right corner (single) ┘ */
    BOTTOM_RIGHT: '┘',
    DOUBLE: {
      /** Top-left corner (double) ╔ */
      TOP_LEFT: '╔',
      /** Top-right corner (double) ╗ */
      TOP_RIGHT: '╗',
      /** Bottom-left corner (double) ╚ */
      BOTTOM_LEFT: '╚',
      /** Bottom-right corner (double) ╝ */
      BOTTOM_RIGHT: '╝',
    },
  },
} as const

/**
 * Whitespace characters for alignment, formatting, and layout control.
 * Different space types have different widths and behaviors across terminals and fonts.
 */
const SPACE = {
  /** Standard space character ' ' */
  NORMAL: ' ',
  /** Non-breaking space (prevents line breaks) \u00A0 */
  NON_BREAKING: '\u00A0',
  /** En space (width of letter 'N') \u2002 */
  EN: '\u2002',
  /** Em space (width of letter 'M') \u2003 */
  EM: '\u2003',
  /** Thin space (narrower than normal) \u2009 */
  THIN: '\u2009',
  /** Hair space (very narrow) \u200A */
  HAIR: '\u200A',
  /** Zero-width space (invisible but allows line breaks) \u200B */
  ZERO_WIDTH: '\u200B',
  /** Ideographic space (for CJK text) \u3000 */
  IDEOGRAPHIC: '\u3000',
  /** Middle dot (centered dot used for spacing) \u00B7 */
  MIDDLE_DOT: '\u00B7',
  /** Figure space (same width as digits) \u2007 */
  FIGURE: '\u2007',
  /** Tab character \t */
  TAB: '\t',
} as const

/**
 * List markers for creating bulleted, numbered, and other types of lists.
 * Useful for menus, options, and hierarchical data display.
 */
const LIST = {
  CHECKBOX: {
    /** Checkbox ☐ */
    UNCHECKED: '☐',
    /** Checkbox ☑ */
    CHECKED: '▪',
    CHECKED_ALTERNATE: '☑',
    /** Checked circle ◉ */
    CHECKED_CIRCLE: '◉',
    /** Unchecked circle ◯ */
    UNCHECKED_CIRCLE: '◯',
    /** Indeterminate circle ◐ */
    INDETERMINATE_CIRCLE: '◐',
  },
  BULLET: {
    /** Round bullet • */
    ROUND: '•',
    /** Filled circle ● */
    CIRCLE: '●',
    /** Hollow circle ○ */
    HOLLOW_CIRCLE: '○',
    /** Square bullet ▪ */
    SQUARE: '▪',
    /** Hollow square □ */
    HOLLOW_SQUARE: '□',
    /** Triangle bullet ‣ */
    TRIANGLE: '‣',
    /** Hollow triangle △ */
    HOLLOW_TRIANGLE: '△',
    /** Diamond bullet ◆ */
    DIAMOND: '◆',
    /** Hollow diamond ◇ */
    HOLLOW_DIAMOND: '◇',
    /** Inverse bullet ◘ */
    INVERSE: '◘',
    /** Asterisk bullet * */
    ASTERISK: '*',
    /** Hyphen bullet - */
    HYPHEN: '-',
  },
  NUMBERED: {
    /** Circled numbers ①②③④⑤⑥⑦⑧⑨⑩ */
    CIRCLE: '①②③④⑤⑥⑦⑧⑨⑩',
    /** Parenthesized numbers ⑴⑵⑶⑷⑸⑹⑺⑻⑼⑽ */
    PARENTHESIS: '⑴⑵⑶⑷⑸⑹⑺⑻⑼⑽',
    /** Numbers with period ⒈⒉⒊⒋⒌⒍⒎⒏⒐⒑ */
    PERIOD: '⒈⒉⒊⒋⒌⒍⒎⒏⒐⒑',
  },
  ARROW: {
    /** Right arrow → */
    RIGHT: '→',
    /** Heavy right arrow ➜ */
    HEAVY_RIGHT: '➜',
    /** Double right arrow ⇒ */
    DOUBLE_RIGHT: '⇒',
    /** Right pointer ▷ */
    POINTER: '▷',
    /** Heavy right pointer ▶ */
    HEAVY_POINTER: '▶',
    /** Right chevron › */
    CHEVRON: '›',
    /** Heavy right chevron ❯ */
    HEAVY_CHEVRON: '❯',
    /** Double right chevron » */
    DOUBLE_CHEVRON: '»',
    /** Squiggle arrow ↝ */
    SQUIGGLE: '↝',
    /** Heavy squiggle arrow ⇝ */
    HEAVY_SQUIGGLE: '⇝',
    /** Dashed arrow ⇢ */
    DASHED: '⇢',
    /** Arrow from bar ↦ */
    FROM_BAR: '↦',
    /** Arrow to bar ⇥ */
    TO_BAR: '⇥',
    /** Arrow with circle ⇨ */
    CIRCLE: '⇨',
  },
} as const

/**
 * Status indicator characters for showing success, error, warning, and progress states.
 * Useful for CLI output, logs, and user feedback.
 */
const STATUS = {
  SUCCESS: {
    /** Check mark ✓ */
    CHECK: '✓',
    /** Heavy check mark ✔ */
    HEAVY_CHECK: '✔',
    /** Filled circle ● */
    CIRCLE: '●',
    /** Filled star ★ */
    STAR: '★',
  },
  ERROR: {
    /** Cross ✕ */
    CROSS: '✕',
    /** Heavy cross ✖ */
    HEAVY_CROSS: '✖',
    /** Empty circle ○ */
    CIRCLE: '○',
    /** Exclamation mark ❗ */
    BANG: '❗',
    /** Prohibited ⛔ */
    PROHIBITED: '⛔',
    /** Heavy ballot X ✘ */
    BALLOT_X: '✘',
    /** Multiplication X ✗ */
    MULTIPLY: '✗',
    /** Banned symbol Ø */
    BANNED: 'Ø',
    /** Square with diagonal crosshatch ⧅ */
    CROSSHATCH: '⧅',
  },
  WARNING: {
    /** Warning triangle ⚠ */
    TRIANGLE: '⚠',
    /** Double exclamation mark ‼ */
    BANG: '‼',
    /** Small star ⭑ */
    DOT: '⭑',
    /** Radioactive sign ☢ */
    RADIOACTIVE: '☢',
    /** Biohazard sign ☣ */
    BIOHAZARD: '☣',
    /** White exclamation mark ❕ */
    LIGHT_BANG: '❕',
    /** High voltage sign ⚡ */
    VOLTAGE: '⚡',
    /** Lightning ↯ */
    LIGHTNING: '↯',
    /** Skull and crossbones ☠ */
    SKULL: '☠',
    /** Warning sign ⚇ */
    CAUTION: '⚇',
    /** Warning beacon ⚠︎ */
    ALT_TRIANGLE: '⚠︎',
  },
  PROGRESS: {
    /** Dot • */
    DOT: '•',
    /** Square ▪ */
    SQUARE: '▪',
    /** Circle ○ */
    CIRCLE: '○',
    /** Diamond ◇ */
    DIAMOND: '◇',
    /** Braille spinner characters */
    SPINNER: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
    /** Line spinner characters */
    SPINNER_LINE: ['-', '\\', '|', '/'],
    /** Arrow spinner characters */
    SPINNER_ARROWS: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
    /** Moon phase spinner characters */
    SPINNER_MOON: ['◐', '◓', '◑', '◒'],
    /** Clock spinner characters */
    SPINNER_CLOCK: [
      '🕐',
      '🕑',
      '🕒',
      '🕓',
      '🕔',
      '🕕',
      '🕖',
      '🕗',
      '🕘',
      '🕙',
      '🕚',
      '🕛',
    ],
    /** Light shade character for bars ░ */
    BAR_LIGHT: '░',
    /** Medium shade character for bars ▒ */
    BAR_MEDIUM: '▒',
    /** Dark shade character for bars ▓ */
    BAR_DARK: '▓',
    /** Solid block character for bars █ */
    BAR_SOLID: '█',
    /** Left half block character ▌ */
    BAR_HALF_LEFT: '▌',
    /** Right half block character ▐ */
    BAR_HALF_RIGHT: '▐',
    /** Lower half block character ▄ */
    BAR_HALF_LOWER: '▄',
    /** Upper half block character ▀ */
    BAR_HALF_UPPER: '▀',
  },
} as const

/**
 * Quote characters for wrapping text in various styles and languages.
 */
const QUOTE = {
  SINGLE: {
    /** Left single quote */
    LEFT: '\u2018',
    /** Right single quote */
    RIGHT: '\u2019',
    /** Straight single quote */
    STRAIGHT: "'",
  },
  DOUBLE: {
    /** Left double quote */
    LEFT: '\u201C',
    /** Right double quote */
    RIGHT: '\u201D',
    /** Straight double quote */
    STRAIGHT: '"',
  },
  ANGLE: {
    SINGLE: {
      /** Left single angle quote */
      LEFT: '\u2039',
      /** Right single angle quote */
      RIGHT: '\u203A',
    },
    DOUBLE: {
      /** Left double angle quote */
      LEFT: '\u00AB',
      /** Right double angle quote */
      RIGHT: '\u00BB',
    },
  },
} as const

/**
 * Ellipsis characters for indicating truncation, continuation, or omission.
 * These can be used in text wrapping, truncation, or to indicate ongoing operations.
 */
const ELLIPSIS = {
  /** Standard horizontal ellipsis ... */
  HORIZONTAL: '...',
  /** Middle ellipsis (centered dots) ⋯ */
  MIDDLE: '⋯',
  /** Vertical ellipsis (vertical dots) ⋮ */
  VERTICAL: '⋮',
  /** Diagonal ellipsis (diagonal dots) ⋰ */
  UP_RIGHT: '⋰',
  /** Diagonal ellipsis (diagonal dots) ⋱ */
  DOWN_RIGHT: '⋱',
  /** Four dot ellipsis .... */
  FOUR_DOT: '....',
  /** Two dot leader .. */
  TWO_DOT: '..',
  /** Single dot leader . */
  ONE_DOT: '.',
} as const

const RESET_SEQUENCE = [
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
} as const

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
} as const

const GRAPHICS_PROTOCOLS = {
  SIXEL: 'sixel',
  KITTY: 'kitty',
  ITERM2: 'iterm2',
} as const

const COLOR_FORMATS = {
  RGB_24BIT: 'rgb24',
  RGB_256: 'rgb256',
  RGB_16: 'rgb16',
  RGB_8: 'rgb8',
} as const

const INPUT_TYPES = {
  KEYBOARD: 'keyboard',
  MOUSE: 'mouse',
  PASTE: 'paste',
  FOCUS: 'focus',
  RESIZE: 'resize',
} as const

const CONSTRAINT_DEFAULTS = {
  MIN_WIDTH: 0,
  MIN_HEIGHT: 0,
  MAX_WIDTH: Number.MAX_SAFE_INTEGER,
  MAX_HEIGHT: Number.MAX_SAFE_INTEGER,
  DEFAULT_PRIORITY: 1000,
} as const

export {
  ANSI_CODES,
  ANSI_KEY_MAP,
  BOX,
  COLOR_FORMATS,
  CONSTRAINT_DEFAULTS,
  CTRL_KEY_MAP,
  DEFAULT_TERMINAL_HEIGHT,
  DEFAULT_TERMINAL_WIDTH,
  ELLIPSIS,
  EOL,
  GRAPHICS_PROTOCOLS,
  INPUT_TYPES,
  LIST,
  MIN_TERMINAL_HEIGHT,
  MIN_TERMINAL_WIDTH,
  QUOTE,
  RESET_SEQUENCE,
  SPACE,
  STATUS,
}
