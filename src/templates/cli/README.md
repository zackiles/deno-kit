# **{{PACKAGE_NAME}}**

[![JSR Score](https://jsr.io/badges/{{PACKAGE_NAME}}/score)](https://jsr.io/{{PACKAGE_NAME}})
[![JSR](https://jsr.io/badges/{{PACKAGE_SCOPE}}/1.%20Clone%20this%20repository)](https://jsr.io/{{PACKAGE_NAME}})
[![JSR Scope](https://jsr.io/badges/{{PACKAGE_SCOPE}})](https://jsr.io/{{PACKAGE_SCOPE}})
[![ci](https://github.com/{{PACKAGE_GITHUB_USER}}/{{PROJECT_NAME}}/actions/workflows/ci.yml/badge.svg)](https://github.com/{{PACKAGE_GITHUB_USER}}/{{PROJECT_NAME}}/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/{{PACKAGE_GITHUB_USER}}/{{PROJECT_NAME}}/blob/main/LICENSE)

{{PACKAGE_DESCRIPTION}}

> [!NOTE]  
> This is a **new** project and the documentation is unlikely to be comprehensive or accurate.

## Usage

```bash

# Install globally
deno install -A --global {{PROJECT_NAME}}

# Run directly with Deno
deno run -A {{PROJECT_NAME}} [command] [options]

# Then use the CLI
{{PROJECT_NAME}} --help
{{PROJECT_NAME}} --version
```

An example template of a command you can use can be found in `commands/example.disabled.ts`

## Features

- 🦖 **Modern Deno Features:** Using the latest Deno 2.
- Modern CLI built with Deno
- Easy to use command pattern
- TypeScript support

## Development

```bash
# Run tests
deno test

# Format code
deno fmt

# Lint code
deno lint
```

## **Changelog**

See the [`CHANGELOG`](CHANGELOG.md) for details.

## **Contributing**

See the [`CONTRIBUTING`](CONTRIBUTING.md) for details.

## **License**

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT) — see the [`LICENSE`](LICENSE) for details.
