# Deno-Kit

[![Deno](https://img.shields.io/badge/Deno-000?logo=deno&logoColor=fff)](https://jsr.io/@deno-kit/kit) [![JSR Score](https://jsr.io/badges/@deno-kit/kit/score)](https://jsr.io/@deno-kit/kit) [![JSR](https://jsr.io/badges/@deno-kit/kit)](https://jsr.io/@deno-kit/kit) [![JSR Scope](https://jsr.io/badges/@deno-kit)](https://jsr.io/@deno-kit) [![cd](https://github.com/zackiles/deno-kit/actions/workflows/jsr-publish.yml/badge.svg)](https://github.com/zackiles/deno-kit/actions/workflows/jsr-publish.yml) [![license](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/zackiles/deno-kit/blob/main/LICENSE)

> `deno init` on steroids. The tool-kit for modern, opinionated, and AI-native Deno 2 projects.

## Overview

Supercharge your development workflow with a powerful, intuitive, and unobtrusive approach to scaffolding and managing your project using the latest in Deno best practices and tooling. Deno-Kit is part-scaffolding, part-SDK, and part-reference architecture. You can choose to adopt as little or as much of it as you want without ever being locked-in. Everything in Deno-Kit can be used through a single CLI you can install, bootstrap a project, and remove in seconds.

**Multiple Supported Project Types**: _New projects_, _old projects_, _monorepos_, _CLIs_, _servers_, _libraries_, and supports the following core project types and scaffolding: `Library`, `CLI`, `HTTP-Server`, `Websocket-Server`, and `MCP-Server`.

**Prefer a Github Template?** Try our opinionated [pre-made starter-template](https://github.com/zackiles/deno-kit-starter-template) configured as a Deno library that already has Deno-Kit and a fully configured and publishable package ready to go, OR read below if you'd prefer a hands-on approach using the Deno-Kit CLI.

## **Quick Start**

### Install

Install the Deno-Kit binary globally, instantly, and cross-platform so you can use it to bootstrap and manage all your Deno projects:

```sh
curl -fsSL https://raw.githubusercontent.com/zackiles/deno-kit/main/install.sh | sh
```

### Run

With deno-kit installed globally you can initialize a new project in any folder. Assuming you've created a new folder you can run the init command in it:

```sh
deno-kit init
```

Optionally, you can init a new project even while not in the project folder. It'll even create the folder if it doesn't already exist:

```sh
deno-kit init ~/my-new-project
```

Running `deno-kit init` will:

- **Configure**: from hyper-customized to instant projects, it'll walk you through setting up your project, with all steps skippable and having safe defaults. Library, CLI, HTTP-Server, Websocket-Server, and MCP-Server.

- **Generate**: a ready-to-go project with all the bells and whistles: documentation, workflows for testing and releasing, comprehensive configuration for VSCode/Cursor/Github and more, one-step publishing on JSR, and a handful of battle-tested utilities from the `@deno-kit` standard library that compliment and enhance Deno's.

🚀 **That's it!**. You can continue to use the powerful features of Deno-Kit (see a list of tools `deno-kit --help`), or if you made a mistake configuring the project you can reset using `deno-kit reset`.

> [!NOTE]\
> Done with Deno-Kit? You can remove it completely and any time without harming the project using `deno-kit remove`.

### **Next Steps**

Write your first bit of code, and then try using the powerful auto-generated CLI client to test your new module. Use `deno-kit cli --help` and it will show a full help menu for your module - showing all methods, their descriptions and arguments, and the commands needed to call every method completely through your terminal. You can even instantiate simple classes. We use [@deno-kit/module-to-cli](https://jsr.io/@deno-kit/module-to-cli) to accomplish this (tip: you can use this library in your own projects without having to use Deno-Kit).

> [!NOTE]\
> Deno-Kit receives updates. Running `deno kit update` will attempt to update both the CLI _and_ from time-to-time the project scaffolding or shell. If anything goes wrong during an update, you can use `deno-kit reset` to rollback the recent changes.

## **Features**

🧭 **Guided Setup**: Quickly setup your next package with guided setup and intelligent defaults based on your current working environment.

🧩 **Multiple Project Types**: CLI, Library, HTTP-Server, WebSocket-Server, MCP-Server.

🦖 **Modern Deno 2**: best practices such as safe defaults for lint/fmt/compile/publish and more, as well as out-of-the-box setup for the latest APIs such as OpenTelemetry.

🤖 **AI-Native:** User Cursor? Deno-kit includes a complete set of Deno-optimized AI triggers, meta prompts, a full suite of Cursor rules in `.cursor/rules`, MCP servers for your codebase in `ai/mcp` and a local index of documentation for AI in `ai/docs` to jump-start your project

🔒 **Safe Defaults:** Achieve a 100% [JSR score](https://jsr.io/docs/scoring) with safe defaults and comprehensive TypeScript coverage.

🛠 **Helpful Testing Tools:**
Accelerate development of your next package easily with autogenerated CLI, HTTP, and WebSocket clients to consume and test your package locally.

- 🔹 **CLI:** Automatically test your Library projects as if it was a CLI.
- 🌐 **HTTP Server:** Automatically generates HTTP endpoints for each function your package exports.
- ⚡ **WebSocket Server:** Automatically generates JSON-RPC handlers for each function your package exports.

**Note on Removing**: Removing `deno-kit` wont harm your project, but it WILL remove your ability to use several helpful long-term features such as : automatic publishing github workflows with `deno-kit publish`, hosting your library automatically with and `deno-kit cli` as well as the ability to adopt the latest features and best practices by updating with `deno-kit update`.

## **Updating Your Project With Deno Kit**

Running `deno-kit update` will update the following:

- Cursor rules in `.cursor/` (Rules documented in [CURSOR-RULES](CURSOR-RULES.md)
- MCP servers for AI in `ai/mcp`
- Docs for AI in `ai/docs`
- Docs for humans in `docs/`
- Update `deno-kit` dependencies
- General enhancements and critical fixes to `deno-kit`

## **Prerequisites**

- [Deno](https://deno.com/) v2.0 or newer
- **Note:** if you're building a browser-based library you will have to add additional libraries to `compilerOptions.lib` in `deno.jsonc` such as `dom`. For more info see: [DenoDocs - CompilerOptions](https://docs.deno.com/runtime/reference/ts_config_migration/)

## **License**

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT) — see the [`LICENSE`](LICENSE) file for details.
