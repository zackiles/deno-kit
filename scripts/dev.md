**1. Determination of `DENO_KIT_WORKSPACE_PATH` (Primarily in `src/config.ts`)**

The value of `DENO_KIT_WORKSPACE_PATH` is determined by the `initConfig` function within `src/config.ts` (which is called by `getConfig`). The determination follows this order of precedence (highest to lowest):

- **a. Command Line Argument (`--workspace-path`):**
  - If you run the application with the `--workspace-path` argument (e.g., `deno task dev init --workspace-path /custom/path` or `deno run -A src/main.ts init --workspace-path /custom/path`), this value will be used.
  - **How it works:**
    - `src/config.ts` uses `parseArgs(Deno.args, options)` to parse command-line arguments.
    - The `createParseOptions` function dynamically generates the list of recognized string arguments based on keys in the default configuration. For `DENO_KIT_WORKSPACE_PATH`, it generates `workspace-path`.
    - The script then converts `workspace-path` back to `DENO_KIT_WORKSPACE_PATH` to update the configuration.
  - **Important Note on Aliases (`--workspace`, `-w`):**
    - The current implementation in `src/config.ts` specifically looks for `--workspace-path`.
    - If you use `deno task dev init --workspace /custom/path`, the `createParseOptions` function and the subsequent argument processing logic in `config.ts` will interpret `--workspace` as attempting to set a config key `DENO_KIT_WORKSPACE` (not `DENO_KIT_WORKSPACE_PATH`).
    - Therefore, using `--workspace` or `-w` (which is not explicitly defined as an alias in `config.ts`) will **not** correctly set the `DENO_KIT_WORKSPACE_PATH` value. The CLI argument must be `--workspace-path` to be recognized for this specific configuration key.

- **b. Environment Variable (`DENO_KIT_WORKSPACE_PATH`):**
  - If the `--workspace-path` CLI argument is not provided, the system checks for an environment variable named `DENO_KIT_WORKSPACE_PATH`.
  - If `export DENO_KIT_WORKSPACE_PATH=/custom/path/from/env` is set before running the command (e.g., `DENO_KIT_WORKSPACE_PATH=/custom/path/from/env deno task dev init`), its value will be used.
  - **How it works:** `src/config.ts` iterates through `Deno.env.toObject()` and picks up any variables prefixed with `DENO_KIT_`.

- **c. Default Value (`Deno.cwd()`):**
  - If neither the `--workspace-path` CLI argument nor the `DENO_KIT_WORKSPACE_PATH` environment variable is set, the configuration defaults to the current working directory.
  - **How it works:** The `DEFAULT_VALUES` object in `src/config.ts` specifies `DENO_KIT_WORKSPACE_PATH: Deno.cwd()`.

The `getConfig()` function ensures that this initialization logic (`initConfig`) runs only once, and subsequent calls return the already determined configuration.

**2. Access and Usage of `DENO_KIT_WORKSPACE_PATH` in the `init` Command Flow**

- **E2E Entrypoint 1: `deno task dev init` (or with `--workspace-path`)**
  - The `deno task dev` command from `deno.jsonc` executes `deno run -A src/main.ts`. Any arguments like `init` or `--workspace-path /some/path` are passed to `src/main.ts`.

- **E2E Entrypoint 2: `@main.ts` loads config**
  - `src/main.ts` calls `const config = await getConfig()`. At this point, `config.DENO_KIT_WORKSPACE_PATH` holds the value determined by the precedence rules mentioned above.

- **E2E Entrypoint 3: `@main.ts` loads and runs the `init` command from `@src/commands/init.ts`**
  - The `init` command module (`src/commands/init.ts`) also calls `const config = await getConfig()` at its module level. This retrieves the same singleton configuration instance.
  - The `command()` function within `src/commands/init.ts` then **accesses** (reads) `config.DENO_KIT_WORKSPACE_PATH` in several places:
    1. `await ensureDir(config.DENO_KIT_WORKSPACE_PATH)`: To ensure the target directory for the new project exists.
    2. `logger.print(...)`: To inform the user where the project is being created (e.g., `Creating a new Deno-Kit project in workspace: ${config.DENO_KIT_WORKSPACE_PATH}`).
    3. `const configFilePath = join(config.DENO_KIT_WORKSPACE_PATH, config.DENO_KIT_WORKSPACE_CONFIG_FILE_NAME)`: To construct the full path to the workspace's configuration file (e.g., `kit.json`) to check if a project already exists.
    4. `logger.debug(...)`: For logging the workspace path during debugging.
    5. `workspace = await createWorkspace({ ..., workspacePath: config.DENO_KIT_WORKSPACE_PATH, ... })`: This is a critical use. The resolved path is passed to the `createWorkspace` function, which handles the actual scaffolding of the project in this directory.
    6. `logger.info(...)`: In the final success message (e.g., `✅ Setup ... project in ${config.DENO_KIT_WORKSPACE_PATH}`).

**Manipulation:**

Once `DENO_KIT_WORKSPACE_PATH` is determined by `src/config.ts`, its value is **not manipulated or changed further** within the `init` command's flow. It is consistently read and used as the target directory for the new project.

**In summary:**

- `DENO_KIT_WORKSPACE_PATH` is determined once by `src/config.ts` using a clear precedence: CLI argument (`--workspace-path`) > environment variable (`DENO_KIT_WORKSPACE_PATH`) > default (`Deno.cwd()`).
- The aliases `--workspace` or `-w` will **not** correctly set `DENO_KIT_WORKSPACE_PATH` with the current implementation; `--workspace-path` must be used for CLI override.
- The `src/commands/init.ts` module then reads this determined path from the shared configuration and uses it as the location for creating the new Deno-Kit project, for logging, and for path constructions related to the new workspace.
