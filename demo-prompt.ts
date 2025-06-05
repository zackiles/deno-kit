#!/usr/bin/env deno run --allow-read --allow-write --allow-env

/**
 * 🎨 Demo: The World's Most Advanced Terminal Prompt System
 *
 * This demo showcases the incredible prompt system we've built for Deno 2:
 * - Beautiful gradient colors and themes
 * - Full keyboard and mouse support
 * - Single and multi-select prompts
 * - Search and pagination
 * - Text input with validation
 * - Conditional question flows
 * - Type-safe results
 */

import { prompt, Prompt, terminal } from './src/terminal/mod.ts'

// 🌟 Demo: Single Select with Search
async function demoSingleSelect() {
  terminal.print(terminal.purpleGradient('\n🎯 Single Select Demo'))

  const framework = await prompt.ask(Prompt.select({
    message: 'Choose your favorite frontend framework',
    name: 'framework',
    searchable: true,
    options: [
      { value: 'react', label: 'React', description: 'A JavaScript library for building user interfaces' },
      { value: 'vue', label: 'Vue.js', description: 'The Progressive JavaScript Framework' },
      { value: 'angular', label: 'Angular', description: 'Platform for building mobile and desktop web applications' },
      { value: 'svelte', label: 'Svelte', description: 'Cybernetically enhanced web apps' },
      { value: 'solid', label: 'SolidJS', description: 'Simple and performant reactivity for building user interfaces' },
      { value: 'qwik', label: 'Qwik', description: 'Resumable framework with zero hydration overhead' },
    ],
    pagination: {
      pageSize: 4,
      showNumbers: true
    }
  }))

  terminal.print(terminal.green(`✅ You selected: ${framework}`))
  return framework
}

// 🌟 Demo: Multi-Select with Groups
async function demoMultiSelect() {
  terminal.print(terminal.purpleGradient('\n🎯 Multi-Select Demo with Groups'))

  const features = await prompt.ask(Prompt.multiselect({
    message: 'Which features do you want to enable?',
    name: 'features',
    groupBy: true,
    searchable: true,
    options: [
      // Core Features
      { value: 'typescript', label: 'TypeScript', group: 'Core', description: 'Static type checking' },
      { value: 'eslint', label: 'ESLint', group: 'Core', description: 'Code linting and formatting' },
      { value: 'testing', label: 'Testing', group: 'Core', description: 'Unit and integration tests' },

      // Database
      { value: 'postgres', label: 'PostgreSQL', group: 'Database', description: 'Relational database' },
      { value: 'redis', label: 'Redis', group: 'Database', description: 'In-memory cache' },
      { value: 'mongodb', label: 'MongoDB', group: 'Database', description: 'Document database' },

      // Deployment
      { value: 'docker', label: 'Docker', group: 'Deployment', description: 'Containerization' },
      { value: 'kubernetes', label: 'Kubernetes', group: 'Deployment', description: 'Container orchestration' },
      { value: 'github-actions', label: 'GitHub Actions', group: 'Deployment', description: 'CI/CD pipeline' },

      // Monitoring
      { value: 'prometheus', label: 'Prometheus', group: 'Monitoring', description: 'Metrics collection' },
      { value: 'grafana', label: 'Grafana', group: 'Monitoring', description: 'Dashboards and alerting' },
      { value: 'sentry', label: 'Sentry', group: 'Monitoring', description: 'Error tracking' },
    ],
    pagination: {
      pageSize: 8,
      showNumbers: true
    }
  }))

  terminal.print(terminal.green(`✅ You selected ${(features as string[]).length} features:`))
  for (const feature of features as string[]) {
    terminal.print(terminal.dim(`  • ${feature}`))
  }

  return features
}

// 🌟 Demo: Text Input with Validation
async function demoTextInput() {
  terminal.print(terminal.purpleGradient('\n🎯 Text Input Demo with Validation'))

  const projectName = await prompt.ask(Prompt.text({
    message: 'Enter your project name',
    name: 'projectName',
    placeholder: 'my-awesome-project',
    maxLength: 50,
    required: true,
    validate: (value: unknown) => {
      const str = value as string
      if (!str.trim()) return 'Project name is required'
      if (!/^[a-z0-9-]+$/.test(str)) return 'Project name must contain only lowercase letters, numbers, and hyphens'
      if (str.length < 3) return 'Project name must be at least 3 characters long'
      return true
    }
  }))

  terminal.print(terminal.green(`✅ Project name: ${projectName}`))
  return projectName
}

// 🌟 Demo: Password Input
async function demoPasswordInput() {
  terminal.print(terminal.purpleGradient('\n🎯 Password Input Demo'))

  const password = await prompt.ask(Prompt.password({
    message: 'Enter a secure password',
    name: 'password',
    required: true,
    validate: (value: unknown) => {
      const str = value as string
      if (str.length < 8) return 'Password must be at least 8 characters long'
      if (!/[A-Z]/.test(str)) return 'Password must contain at least one uppercase letter'
      if (!/[a-z]/.test(str)) return 'Password must contain at least one lowercase letter'
      if (!/[0-9]/.test(str)) return 'Password must contain at least one number'
      if (!/[!@#$%^&*]/.test(str)) return 'Password must contain at least one special character (!@#$%^&*)'
      return true
    }
  }))

  terminal.print(terminal.green(`✅ Password length: ${(password as string).length} characters`))
  return password
}

// 🌟 Demo: Confirmation
async function demoConfirm() {
  terminal.print(terminal.purpleGradient('\n🎯 Confirmation Demo'))

  const shouldProceed = await prompt.ask(Prompt.confirm({
    message: 'Are you ready to create your project?',
    name: 'confirm',
    initial: true
  }))

  if (shouldProceed) {
    terminal.print(terminal.green('✅ Great! Let\'s create your project...'))
  } else {
    terminal.print(terminal.yellow('⚠️  Project creation cancelled'))
  }

  return shouldProceed
}

// 🌟 Demo: Complete Question Flow with Conditional Logic
async function demoQuestionFlow() {
  terminal.print(terminal.purpleGradient('\n🎯 Question Flow Demo with Conditional Logic'))

  const answers = await prompt.flow([
    Prompt.select({
      message: 'What type of project are you creating?',
      name: 'projectType',
      options: [
        { value: 'web-app', label: '🌐 Web Application', description: 'Full-stack web application' },
        { value: 'api', label: '🔗 API Service', description: 'RESTful API or GraphQL service' },
        { value: 'cli', label: '⌨️  CLI Tool', description: 'Command-line application' },
        { value: 'library', label: '📦 Library', description: 'Reusable code library' },
      ]
    }),

    Prompt.text({
      message: 'What is the name of your project?',
      name: 'projectName',
      required: true,
      validate: (value) => {
        const str = value as string
        if (!str.trim()) return 'Project name is required'
        if (str.length < 3) return 'Project name must be at least 3 characters'
        return true
      }
    }),

    Prompt.select({
      message: 'Choose your preferred language',
      name: 'language',
      options: [
        { value: 'typescript', label: 'TypeScript', description: 'Typed JavaScript' },
        { value: 'javascript', label: 'JavaScript', description: 'Dynamic scripting language' },
        { value: 'python', label: 'Python', description: 'High-level programming language' },
        { value: 'rust', label: 'Rust', description: 'Systems programming language' },
        { value: 'go', label: 'Go', description: 'Compiled programming language' },
      ],
      when: (answers) => answers.projectType !== 'cli' // Only ask for non-CLI projects
    }),

    Prompt.multiselect({
      message: 'Select testing frameworks',
      name: 'testingFrameworks',
      options: [
        { value: 'jest', label: 'Jest', description: 'JavaScript testing framework' },
        { value: 'vitest', label: 'Vitest', description: 'Fast Vite-native testing framework' },
        { value: 'deno-test', label: 'Deno Test', description: 'Built-in Deno testing' },
        { value: 'playwright', label: 'Playwright', description: 'End-to-end testing' },
      ],
      when: (answers) => answers.language === 'typescript' || answers.language === 'javascript'
    }),

    Prompt.confirm({
      message: 'Do you want to initialize a Git repository?',
      name: 'initGit',
      initial: true
    }),

    Prompt.confirm({
      message: 'Create project with these settings?',
      name: 'finalConfirm',
      initial: true
    })
  ])

  return answers
}

// 🌟 Main Demo Function
async function main() {
  try {
    // Print beautiful header
    await terminal.printBanner({ version: '1.0.0' })

    terminal.print(terminal.greenGradient('\n🚀 Welcome to the World\'s Most Advanced Terminal Prompt System!'))
    terminal.print(terminal.dim('Built with Deno 2, TypeScript, and lots of ❤️\n'))

    // Demo 1: Single Select
    const framework = await demoSingleSelect()

    // Demo 2: Multi-Select
    const features = await demoMultiSelect()

    // Demo 3: Text Input
    const projectName = await demoTextInput()

    // Demo 4: Password Input
    const password = await demoPasswordInput()

    // Demo 5: Confirmation
    const shouldProceed = await demoConfirm()

    if (shouldProceed) {
      // Demo 6: Complete Flow
      const flowAnswers = await demoQuestionFlow()

      // Final Summary
      terminal.print(terminal.purpleGradient('\n🎉 Demo Complete! Here\'s what we collected:'))
      terminal.print(terminal.dim('─'.repeat(60)))

      terminal.print(terminal.green('Framework:'), framework)
      terminal.print(terminal.green('Features:'), (features as string[]).join(', '))
      terminal.print(terminal.green('Project Name:'), projectName)
      terminal.print(terminal.green('Password Length:'), `${(password as string).length} chars`)
      terminal.print(terminal.green('Flow Answers:'))

      for (const [key, value] of Object.entries(flowAnswers)) {
        if (Array.isArray(value)) {
          terminal.print(terminal.dim(`  ${key}:`), value.join(', '))
        } else {
          terminal.print(terminal.dim(`  ${key}:`), String(value))
        }
      }
    }

    terminal.print(terminal.greenGradient('\n✨ Thank you for trying our prompt system!'))
    terminal.print(terminal.dim('This system supports:\n'))
    terminal.print(terminal.dim('• 🎨 Beautiful themes with gradients'))
    terminal.print(terminal.dim('• ⌨️  Full keyboard navigation'))
    terminal.print(terminal.dim('• 🖱️  Mouse support'))
    terminal.print(terminal.dim('• 🔍 Real-time search'))
    terminal.print(terminal.dim('• 📄 Pagination for long lists'))
    terminal.print(terminal.dim('• ✅ Input validation'))
    terminal.print(terminal.dim('• 🔀 Conditional question flows'))
    terminal.print(terminal.dim('• 🔒 Type-safe TypeScript'))
    terminal.print(terminal.dim('• 🌐 Cross-platform terminal support'))

  } catch (error) {
    if (error instanceof Error && error.message === 'Prompt was cancelled') {
      terminal.print(terminal.yellow('\n👋 Demo cancelled by user. Goodbye!'))
    } else {
      terminal.error('Demo error:', error)
    }
  } finally {
    // Ensure cleanup
    Deno.exit(0)
  }
}

// 🚀 Run the demo
if (import.meta.main) {
  await main()
}
