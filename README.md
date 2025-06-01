# <img src="assets/logo.ico" width="20" height="20" style="vertical-align: middle"> Deno-Kit

<div align="center">

<img src="assets/logo.png" height="350"></img>

[![Deno](https://img.shields.io/badge/Deno-000?logo=deno&logoColor=fff)](https://jsr.io/@deno-kit/kit)
[![JSR Score](https://jsr.io/badges/@deno-kit/kit/score)](https://jsr.io/@deno-kit/kit)
[![JSR](https://jsr.io/badges/@deno-kit/kit)](https://jsr.io/@deno-kit/kit)
[![JSR Scope](https://jsr.io/badges/@deno-kit)](https://jsr.io/@deno-kit)

[![cd](https://github.com/zackiles/deno-kit/actions/workflows/publish-github.yml/badge.svg)](https://github.com/zackiles/deno-kit/actions/workflows/publish-github.yml)
[![license](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/zackiles/deno-kit/blob/main/LICENSE)

<em>Opinionated scaffolding for AI-native Typescript projects. An SDK and reference architecture for the next generation of codebases.</em>

</div>

## Overview

Scaffold and publish Deno projects in seconds with the Deno-Kit CLI. From quick **vibe-coding prototypes** to battle-tested patterns being adopted by hybrid human/agent projects at **enterprise scale**. Every design choice has been hyper-optimized with the best practices, defaults, and integrations for agentic-driven codebases, supercharging their development. Deno-kit promotes [Context-first Codebases For Agents](#context-first-codebases-for-agents) and you can read more about [the features](#features) it provides to accomplish that.

**Supported Scaffold Types**:<br> `Library`, `CLI`, `HTTP-Server`, `Websocket-Server`, and `MCP-Server`

> [!TIP]
> **Prefer a Github Template?** Try our opinionated [pre-made starter-template](https://github.com/zackiles/deno-kit-starter-template) configured as a Deno library that already has Deno-Kit and a fully configured and publishable package ready to go, OR read below if you'd prefer a hands-on approach using the Deno-Kit CLI.

## Context-first Codebases For Agents

The scaffolding follows the self-discovery pattern - every design choice is meant to leave breadcrumbs for an agent that leads them to the next. They act like a series of triggers that cascade context incrementally as the agent navigates your codebase through common workflows, helping them maintain coherence and the optimal context-window.

Self-discovery is achieved through three primary ways: context funnels, tools, and intentional AI-friendly information architecture.

### Funneling

Part of the agent's top-level system prompt is automatically injected into every conversation that set up the triggers of incremental context injection.

**Global Prompt**: A light meta-prompt gives your agent a structured set of instructions on further context they should seek when taking certain actions such as working with certain high-level files and folders specified by glob patterns. This sets up the first layer of triggers. <br>

**Glob Hierarchies**: As the agent begins work on certain files, folders, or tries to access their tools, the global prompt kicks in depending on the glob pattern and triggers the agent to use their tools to fetch the context they were instructed to originally. This new context further instructs them to set up a new lower-level of triggers, and so on.<br>

For illustration, imagine an agent tasked with editing tests in a codebase but given no other context besides our system prompt

- First trigger instructs them that before they do anything they should review the README.md
- Agent loads the README.me where instructions for how to run the tests are present
- Agent runs the tests which print the test folder's path to the terminal. The agent then tries to navigate to the test folder to review the files there, and globs for the test folder match instructing the agent to review the documentation on testing, which includes further triggers.
- Prepped with the new context the agent continues, and tries to read a specific test file. Previous triggers from the testing-guide mentioned this specific file requires the agent to fetch documentation specific to that test file, which further points to more documentation on specific libraries to be used, and a deeper trigger that instructs the agent new context to fetch any time it's finished modifying that file.
- The agent finishes writing the test, and then has to fetch the new context which tells them to run the tests using a specific command.
- The agent runs the tests, and the fail. But the test suite was designed to inject another trigger into the error message instructing the agent to fetch a unique set of context purpose-built to make the agent loop continually trying to debug the failing test.

This is a hypothetical, but clearly demonstrates how a series of lazy-loaded context can act as triggers and significantly enhance agent coherence over multi-turns and deep context, continually re-focusing them bit by bit.

### Tools

Deno-kit exposes actual tools to your agent and provides the instructions to use them. They can all be found in the `.ai` folder. One of the main ways, is through automatic repomixing of your codebase and a purpose-built for repomix grep-like tool for the agent to search it. Git-hooks, Deno tasks, and agent workflows automatically maintain the lifecycle of the mixes as well as a knowledge-base of the latest Deno and Typescript references hand-curated (from official documentation, source-code internals, discussions on Github issues and other undocumented sources).

## Information Architecture

Patterns of self-discovery requires thoughtful approaches to naming things and structuring your project early. Strong foundations is the biggest contributor to agent coherence and consistency as the codebase grows. Every piece of information an agent could observe in your codebase and environment should be thought of implied instructions. A great example of this is how an agent working in a Javascript project who comes across "var" is likely to start writing Javascript as it looks in it's sample set from when "var" was popular.

Every file and folder has been specifically named. Every configuration file includes schemas, all options, and inline comments to enable self-discovery and autonomy. Repeating patterns and terms reinforce agent behavior by funneling them through a context window that leverages their training in the best way.

--

## **Quick Start**

### Install

Install the Deno-Kit native binary globally, instantly, and cross-platform so you can use it to bootstrap and manage all your Deno projects:

```sh
curl -fsSL https://raw.githubusercontent.com/zackiles/deno-kit/main/install.sh | sh
```

> [!TIP]
> To uninstall, run: `curl -fsSL https://raw.githubusercontent.com/zackiles/deno-kit/main/install.sh | sh -s -- --uninstall`

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

> [!TIP]
> Done with Deno-Kit? You can remove it completely and any time without harming the project using `deno-kit remove`.

### **Next Steps**

Write your first bit of code, and then try using the powerful auto-generated CLI client to test your new module. Use `deno-kit cli --help` and it will show a full help menu for your module - showing all methods, their descriptions and arguments, and the commands needed to call every method completely through your terminal. You can even instantiate simple classes. We use [@deno-kit/module-to-cli](https://jsr.io/@deno-kit/module-to-cli) to accomplish this (tip: you can use this library in your own projects without having to use Deno-Kit).

> [!NOTE]
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
