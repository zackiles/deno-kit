# **Deno-Kit**

[![JSR Score](https://jsr.io/badges/@deno-kit/kit/score)](https://jsr.io/@deno-kit/kit)
[![JSR](https://jsr.io/badges/@deno-kit/kit)](https://jsr.io/@deno-kit/kit)
[![JSR Scope](https://jsr.io/badges/@deno-kit)](https://jsr.io/@deno-kit)
[![cd](https://github.com/zackiles/deno-kit/actions/workflows/jsr-publish.yml/badge.svg)](https://github.com/zackiles/deno-kit/actions/workflows/jsr-publish.yml)
[![license](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/zackiles/deno-kit/blob/main/LICENSE)

> Modern, unopinionated, and AI-native way to quickly scaffold and maintain Deno projects.

Go from an empty directory, to a published package in **seconds**. Deno-Kit is a modern approach to building Deno packages. Supercharge your development workflows with a powerful, intuitive, and unobtrusive approach to scaffolding and code generation using the latest in AI-driven development workflows. It's lightweight design allows you to use as little or as much of Deno-Kit as you want - you can even remove it completely with a single command at any time.

Deno-Kit supports multiple project types including Libraries, CLIs, HTTP Servers, WebSocket Servers, SSE Servers, and MCP Servers. It works with new projects, old projects, monorepos, CLIs, servers, libraries, and even advanced templates like MCP Servers with SSE or stdio (think `deno init` on steroids).

**Prefer a Github Template?** Try our opinionated [pre-made starter-template](https://github.com/zackiles/deno-kit-starter-template) that already has Deno-Kit and a fully configured project ready to go, OR read below if you'd prefer that hands on approach using the Deno-Kit CLI ("kit" as we call it).

## **Quick Start**

Only one command is needed to get started. In a new folder for your project (or an existing project) run:

```sh
deno run -A https://jsr.io/@deno-kit/kit/0.0.13/src/commands/setup.ts
```

This will:

- **Download and install** Deno-Kit into the **current project/directory**
- **Generate** and configure a complete project with only a few simple questions
- **Allow you to select your project type** (Library, CLI, HTTP-Server, etc.)

🚀 **That's it!**. You can continue to use the powerful features of Deno-Kit (see a list of tools `deno task kit --help`), or if you made a mistake configuring the project you can reset using `deno task kit reset`.

> [!NOTE]\
> Done with Deno-Kit? You can remove it completely and any time without harming the project using `deno task kit remove`, you just will no longer be able to access the Deno-Kit CLI.

### **Next Steps**

Write your first bit of code, and then try using the powerful auto-generated CLI client to test your new module. Use `deno task kit cli --help` and it will show a full help menu for your module - showing all methods, their descriptions and arguments, and the commands needed to call every method completely through your terminal. You can even instantiate simple classes. We use [@deno-kit/module-to-cli](https://jsr.io/@deno-kit/module-to-cli) to accomplish this (tip: you can use this library in your own projects without having to use Deno-Kit).

> [!NOTE]\
> Deno-Kit receives updates. Running `deno kit update` will attempt to update both the CLI _and_ from time-to-time the project scaffolding or shell. If anything goes wrong during an update, you can use `deno task kit reset` to rollback the recent changes.

## **Features**

**Guided Setup:** Quickly setup your next package with guided setup and intelligent defaults.

**Multiple Project Types:** Support for Libraries, CLIs, HTTP Servers, WebSocket Servers, SSE Servers, and MCP Servers.

🦖 **Modern Deno 2:** best practices such as safe defaults for lint/fmt/compile/publish and more, as well as out-of-the-box setup for the latest APIs such as OpenTelemetry.

🤖 **AI-Native:** User Cursor? Deno-kit includes a complete set of Deno-optimized AI triggers, meta prompts, a full suite of Cursor rules in `.cursor/rules`, MCP servers for your codebase in `ai/mcp` and a local index of documentation for AI in `docs/ai` to jump-start your project

🔒 **Safe Defaults:** Achieve a 100% [JSR score](https://jsr.io/docs/scoring) with safe defaults and comprehensive TypeScript coverage.

🛠 **Helpful Testing Tools:**
Accelerate development of your next package easily with autogenerated CLI, HTTP, and WebSocket clients to consume and test your package locally.

- 🔹 **CLI:** Automatically generates stdio command handlers for each function your package exports.
- 🌐 **HTTP Server:** Automatically generates HTTP endpoints for each function your package exports.
- ⚡ **WebSocket Server:** Automatically generates JSON-RPC handlers for each function your package exports.

**Note on Removing**: Removing `deno-kit` wont harm your project, but it WILL remove your ability to use several helpful long-term features such as : automatic publishing github workflows with `deno task kit publish`, hosting your library automatically with `deno task kit cli` and `deno task kit server`, as well as the ability to adopt the latest features and best practices by updating with `deno task kit update`.

## **Updating Your Project With Deno Kit**

Running `deno task kit update` will update the following:

- Cursor rules in `.cursor/`
- MCP servers for AI in `.cursor/mcp`
- Docs for AI in `.cursor/docs` (needed for some Cursor rules)
- Docs for humans in `docs/`
- Update `deno-kit` dependencies
- General enhancements and critical fixes to `deno-kit`

## **Prerequisites**

- [Deno](https://deno.com/) v2.0 or newer
- **Note:** if you're building a browser-based library you will have to add additional libraries to `compilerOptions.lib` in `deno.jsonc` such as `dom`. For more info see: [DenoDocs - CompilerOptions](https://docs.deno.com/runtime/reference/ts_config_migration/)

## **License**

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT) — see the [`LICENSE`](LICENSE) file for details.
