# 🎨 @deno-kit/prompts

> Create stunning terminal prompts with Deno and Typescript

Use modern prompt components for building interactive CLIs with full theming support, real-time validation, and comprehensive keyboard/mouse navigation across all platforms.

```typescript
import { Prompt, prompt } from '@deno-kit/prompts'

const result = await prompt.ask(Prompt.select({
  message: 'Choose your framework',
  options: [
    { value: 'react', label: 'React' },
    { value: 'vue', label: 'Vue.js' },
    { value: 'angular', label: 'Angular' },
  ],
}))
```

## Why?

- **All the prompts!** text, select, multi-select, password, confirm, as well as multi-step chains using any combination thereof (see [Available prompt types](#available-prompt-types))
- **Global and local theming** - set defaults, customize per prompt (see [Theme System](#-theme-system))
- **Modern terminal protocols** - progressive enhancement for Kitty, XTerm, iTerm2 support, with safe fallbacks. MacOS, Windows, and Linux supported
- **Zero dependencies** - built with Deno and the standard library only

## 🚀 Quick Start

> [!TIP]
> **Need multiple prompts in sequence?** Use `prompt.flow()` to chain prompts together with conditional logic. Perfect for complex setup wizards and interactive CLIs. See [Question flows with conditional logic](#question-flows-with-conditional-logic) for detailed examples.

### Single select with search

```typescript
import { Prompt, prompt } from '@deno-kit/prompts'

const framework = await prompt.ask(Prompt.select({
  message: 'Choose your framework',
  searchable: true,
  options: [
    {
      value: 'react',
      label: 'React',
      description: 'A JavaScript library for building user interfaces',
    },
    {
      value: 'vue',
      label: 'Vue.js',
      description: 'The Progressive JavaScript Framework',
    },
    {
      value: 'angular',
      label: 'Angular',
      description: 'Platform for building mobile and desktop apps',
    },
  ],
}))
```

### Multi-select with groups

```typescript
const features = await prompt.ask(Prompt.multiselect({
  message: 'Select project features',
  searchable: true,
  groupBy: true,
  options: [
    { value: 'typescript', label: 'TypeScript', group: 'Language' },
    { value: 'javascript', label: 'JavaScript', group: 'Language' },
    { value: 'jest', label: 'Jest', group: 'Testing' },
    { value: 'vitest', label: 'Vitest', group: 'Testing' },
  ],
}))
```

### Text input with validation

```typescript
const projectName = await prompt.ask(Prompt.text({
  message: 'Project name',
  placeholder: 'my-awesome-project',
  defaultValue: 'new-project',
  validate: (value) => {
    if (!value?.trim()) return 'Project name is required'
    if (!/^[a-z0-9-]+$/.test(value)) {
      return 'Use lowercase letters, numbers, and hyphens only'
    }
    return true
  },
}))
```

### Password input

```typescript
const password = await prompt.ask(Prompt.password({
  message: 'Enter password',
  validate: (value) => {
    if (typeof value !== 'string' || value.length < 8) {
      return 'Password must be at least 8 characters'
    }
    return true
  },
}))
```

### Confirmation prompt

```typescript
const confirmed = await prompt.ask(Prompt.confirm({
  message: 'Do you want to continue?',
  defaultValue: true,
}))
```

## 🎨 Theme System

### Global theme configuration

Set a default theme that applies to all prompts:

```typescript
import { bold, greenGradient, prompt } from '@deno-kit/prompts'

// Set global theme - applies to all prompts
prompt.setTheme({
  prefix: '🚀',
  pointer: '▶',
  colors: {
    primary: (text: string) => bold(greenGradient(text)),
    highlight: greenGradient,
  },
})

// All subsequent prompts use the global theme
const result = await prompt.ask(Prompt.select({
  message: 'Choose option',
  options: [/* options */],
}))
```

### Per-prompt theme override

Override the global theme for individual prompts:

```typescript
import { blueGradient, redGradient } from '@deno-kit/prompts'

const result = await prompt.ask(Prompt.select({
  message: 'Choose option',
  options: [/* options */],
  theme: {
    prefix: '⚡',
    colors: {
      primary: redGradient,
      error: blueGradient,
    },
  },
}))
```

### Available color functions

```typescript
import {
  blue,
  blueGradient,
  gradient,
  green,
  greenGradient,
  purple,
  purpleGradient,
  red,
  redGradient,
  whiteGradient,
} from '@deno-kit/prompts'

// Use built-in gradients
const customTheme = {
  colors: {
    primary: purpleGradient,
    success: greenGradient,
    error: redGradient,
    warning: gradient(['#FFA500', '#FF6347']),
  },
}
```

## 📖 API Reference

### Core Classes

#### `prompt` (instance)

The main prompt instance with methods for asking questions and managing flows.

```typescript
const prompt: Prompt

// Ask a single question
await prompt.ask<T>(config: PromptConfig): Promise<T>

// Ask multiple questions in sequence
await prompt.flow(configs: PromptConfig[]): Promise<Record<string, unknown>>

// Get previous answers (from named prompts)
prompt.getAnswers(): Record<string, unknown>

// Set global theme
prompt.setTheme(theme: PartialPromptTheme): void
```

#### `Prompt` (class)

Static factory methods for creating prompt configurations.

```typescript
class Prompt {
  static select(config: Omit<SelectPromptConfig, 'type'>): SelectPromptConfig
  static multiselect(
    config: Omit<SelectPromptConfig, 'type'>,
  ): SelectPromptConfig
  static text(config: Omit<TextPromptConfig, 'type'>): TextPromptConfig
  static password(config: Omit<TextPromptConfig, 'type'>): TextPromptConfig
  static confirm(config: Omit<ConfirmPromptConfig, 'type'>): ConfirmPromptConfig

  // Global theme management
  static getTheme(): PartialPromptTheme
}
```

### Configuration Interfaces

#### `BasePromptConfig`

Common configuration for all prompt types:

```typescript
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
  clearBefore?: boolean // Clear screen before prompt
  resetAfter?: boolean // Reset terminal after prompt
  clearAfter?: boolean // Clear prompt output after completion
}
```

#### `SelectPromptConfig`

Configuration for select and multiselect prompts:

```typescript
interface SelectPromptConfig extends BasePromptConfig {
  type: 'select' | 'multiselect'
  options: BaseOption[]
  searchable?: boolean // Enable search functionality
  groupBy?: boolean // Group options by the 'group' property
  multiple?: boolean // Enable multiple selection (set automatically for multiselect)
  defaultValue?: string | string[] // Default selected value(s)
}
```

#### `TextPromptConfig`

Configuration for text and password prompts:

```typescript
interface TextPromptConfig extends BasePromptConfig {
  type: 'text' | 'password'
  placeholder?: string // Placeholder text
  maxLength?: number // Maximum input length
  defaultValue?: string // Default input value
}
```

#### `ConfirmPromptConfig`

Configuration for confirmation prompts:

```typescript
interface ConfirmPromptConfig extends BasePromptConfig {
  type: 'confirm'
  initial?: boolean // Initial selection state
  defaultValue?: boolean // Default value when Enter is pressed
}
```

#### `BaseOption`

Option configuration for select prompts:

```typescript
interface BaseOption<T = string> {
  value: T // The value returned when selected
  label: string // Display text
  description?: string // Additional description text
  disabled?: boolean // Whether the option can be selected
  group?: string // Group name for grouping options
}
```

### Theme Interfaces

#### `PromptTheme` (complete theme)

Full theme configuration with all required properties:

```typescript
interface PromptTheme {
  prefix: string // Prompt prefix (default: '❯')
  suffix: string // Prompt suffix (default: '')
  pointer: string // Selection pointer (default: '›')
  checkbox: {
    checked: string // Checked checkbox (default: '◉')
    unchecked: string // Unchecked checkbox (default: '◯')
    indeterminate: string // Indeterminate state (default: '◐')
  }
  colors: {
    primary: (text: string) => string // Primary accent color
    secondary: (text: string) => string // Secondary color
    success: (text: string) => string // Success messages
    error: (text: string) => string // Error messages
    warning: (text: string) => string // Warning messages
    disabled: (text: string) => string // Disabled text
    highlight: (text: string) => string // Highlighted text
    inputText: (text: string) => string // Input text color
    text: (text: string) => string // Default text color
  }
}
```

#### `PartialPromptTheme` (partial theme)

Partial theme for overriding specific properties:

```typescript
interface PartialPromptTheme {
  prefix?: string
  suffix?: string
  pointer?: string
  checkbox?: Partial<PromptTheme['checkbox']>
  colors?: Partial<PromptTheme['colors']> // Override only specific colors
}
```

## 🔧 Advanced Usage

### Question flows with conditional logic

```typescript
const answers = await prompt.flow([
  Prompt.select({
    message: 'Project type',
    name: 'type',
    options: [
      { value: 'web', label: 'Web Application' },
      { value: 'cli', label: 'CLI Tool' },
      { value: 'api', label: 'REST API' },
    ],
  }),

  Prompt.multiselect({
    message: 'Frontend frameworks',
    name: 'frameworks',
    options: [
      { value: 'react', label: 'React' },
      { value: 'vue', label: 'Vue.js' },
      { value: 'angular', label: 'Angular' },
    ],
    when: (answers) => answers.type === 'web', // Only show for web apps
  }),

  Prompt.text({
    message: 'API endpoint',
    name: 'endpoint',
    defaultValue: '/api/v1',
    when: (answers) => answers.type === 'api',
  }),
])

console.log(answers) // { type: 'web', frameworks: ['react', 'vue'] }
```

### Complex validation with async checks

```typescript
const email = await prompt.ask(Prompt.text({
  message: 'Enter your email',
  validate: async (value) => {
    const email = value as string

    // Basic format check
    if (!email?.includes('@')) return 'Invalid email format'

    // Async validation (e.g., check if email exists)
    try {
      const response = await fetch(`/api/check-email?email=${email}`)
      const data = await response.json()
      if (data.exists) return 'Email already registered'
    } catch {
      return 'Unable to verify email'
    }

    return true
  },
}))
```

### Large option lists with search and pagination

```typescript
const country = await prompt.ask(Prompt.select({
  message: 'Select your country',
  searchable: true,
  groupBy: true,
  pagination: {
    pageSize: 10,
    showNumbers: true,
  },
  options: [
    { value: 'us', label: 'United States', group: 'North America' },
    { value: 'ca', label: 'Canada', group: 'North America' },
    { value: 'mx', label: 'Mexico', group: 'North America' },
    { value: 'uk', label: 'United Kingdom', group: 'Europe' },
    { value: 'fr', label: 'France', group: 'Europe' },
    { value: 'de', label: 'Germany', group: 'Europe' },
    // ... hundreds more countries
  ],
}))
```

### Screen management options

```typescript
// Control screen clearing behavior
await prompt.ask(Prompt.select({
  message: 'Choose option',
  options: [/* options */],
  clearBefore: true, // Clear screen before showing prompt
  resetAfter: true, // Reset terminal state after
  clearAfter: false, // Keep prompt output visible
}))
```

## 🎯 Keyboard Navigation

### Universal shortcuts

- **↑/↓ Arrow keys**: Navigate options
- **Enter**: Submit selection
- **Escape**: Cancel prompt
- **Ctrl+C**: Exit application

### Select prompts

- **Type to search**: Filter options (when `searchable: true`)
- **Page Up/Down**: Navigate pages (when pagination enabled)
- **Home/End**: Jump to first/last option
- **Numbers 1-9**: Quick select by number

### Text prompts

- **←/→ Arrow keys**: Move cursor
- **Ctrl+A**: Move to beginning
- **Ctrl+E**: Move to end
- **Backspace/Delete**: Remove characters
- **Ctrl+U**: Clear entire input

### Multiselect prompts

- **Space**: Toggle selection
- **A**: Select all options
- **I**: Invert selection

## 🛠️ Architecture

### Component hierarchy

```
PromptEngine
├── Keyboard Input (raw mode, escape sequences)
├── Mouse Input (click, scroll, position tracking)
└── BasePrompt (abstract base class)
    ├── SelectPrompt (single & multi-select)
    ├── TextPrompt (text & password input)
    └── ConfirmPrompt (yes/no confirmation)
```

### Available prompt types

| Type          | Class           | Factory Method         | Description                         |
| ------------- | --------------- | ---------------------- | ----------------------------------- |
| `select`      | `SelectPrompt`  | `Prompt.select()`      | Single selection from options       |
| `multiselect` | `SelectPrompt`  | `Prompt.multiselect()` | Multiple selections with checkboxes |
| `text`        | `TextPrompt`    | `Prompt.text()`        | Text input with validation          |
| `password`    | `TextPrompt`    | `Prompt.password()`    | Masked password input               |
| `confirm`     | `ConfirmPrompt` | `Prompt.confirm()`     | Yes/no confirmation                 |

### Event system

All prompts extend `PromptEventEmitter` for handling user interactions:

```typescript
class PromptEventEmitter {
  on(event: string, listener: (...args: unknown[]) => void): () => void
  off(event: string, listener: (...args: unknown[]) => void): void
  emit(event: string, ...args: unknown[]): void
}
```

## 🚀 Performance Features

- **Zero dependencies**: Built entirely with Deno standard library
- **Efficient rendering**: Only re-render changed screen regions
- **Memory optimized**: Minimal footprint for large option lists
- **Fast search**: Optimized text filtering algorithms
- **Smooth animations**: 60fps gradient effects where supported

## 🧪 Testing

```bash
# Run prompt system tests
deno test src/terminal/prompts/

# Test specific prompt types
deno test src/terminal/prompts/select-prompt.test.ts
deno test src/terminal/prompts/text-prompt.test.ts
```

## 🤝 Contributing

### Add new prompt types

Extend `BasePrompt` to create custom prompt types:

```typescript
import { BasePrompt, PromptEngine } from './prompt.ts'

class CustomPrompt extends BasePrompt {
  protected initializeState(): PromptState {
    // Initialize prompt state
  }

  protected render(): string[] {
    // Return array of lines to render
  }

  public onKeyEvent(event: KeyEvent): void {
    // Handle keyboard input
  }

  public onMouseEvent(event: MouseEvent): void {
    // Handle mouse input
  }

  protected getValue(): unknown {
    // Return the prompt value
  }
}
```

### Create custom themes

```typescript
import { PartialPromptTheme } from '@deno-kit/prompts'

const customTheme: PartialPromptTheme = {
  prefix: '🔥',
  pointer: '→',
  colors: {
    primary: (text) => `\x1b[35m${text}\x1b[0m`, // Purple
    success: (text) => `\x1b[32m${text}\x1b[0m`, // Green
  },
}
```

## 📄 License

MIT License - feel free to use this in your projects!
