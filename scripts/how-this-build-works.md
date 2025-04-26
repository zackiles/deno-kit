# Deno-Kit Build Process Technical Reference

This document provides a comprehensive technical overview of the build process used in the Deno-Kit project, primarily orchestrated by `scripts/build.ts` and verified by `test/build.test.ts`.

## 1. Overview

The core goal of the build process is to compile the Deno-Kit application (`src/main.ts`) into standalone, native executable binaries for multiple target platforms (Windows, macOS, Linux) and package them into distributable `.zip` archives.

## 2. Build Script (`scripts/build.ts`)

The `scripts/build.ts` file is the central script responsible for the entire build workflow.

**Key Steps:**

1. **Resource Verification:** Checks for the existence of essential source files, configuration, and assets defined in the `RESOURCES` constant (e.g., `src/main.ts`, `deno.jsonc`, `templates/`, JSON ban lists, Windows icon).
2. **Output Directory:** Ensures the `bin/` directory exists, creating it if necessary.
3. **Template Zipping:** Compresses the entire `templates/` directory into a single `bin/templates.zip` file. This zip file is a crucial resource that will be embedded into the final binaries.
4. **Multi-Platform Compilation:** Iterates through a predefined list of target platforms (e.g., `x86_64-pc-windows-msvc`, `aarch64-apple-darwin`). For each platform:
   - **Constructs `deno compile` command:** Assembles the arguments for `deno compile`, including:
     - **Source:** `src/main.ts` (relative path from project root).
     - **Flags:** `-A` (all permissions), `--unstable`, `--lock`, `--no-check`, `--config deno.jsonc`.
       - **`--reload`:** Added to ensure the _very latest_ source code (including dependencies of the build script itself) is used during compilation, bypassing potential caching issues, especially when iterating on the build process or its dependencies. The first platform target also includes an _additional_ explicit `--reload` earlier in the argument list for dependency fetching.
     - **Target:** The specific platform identifier (e.g., `x86_64-unknown-linux-gnu`).
     - **Output:** Specifies the path for the raw compiled binary (e.g., `bin/deno-kit-linux-x86_64`).
     - **Resource Embedding (`--include`):** This is critical for bundling necessary files directly into the binary's Virtual File System (VFS). **Relative paths from the project root** are used for:
       - `bin/templates.zip` (The zipped templates created earlier).
       - `src/utils/banned_directories_default.jsonc`
       - `src/utils/banned_directories_custom.jsonc`
       - `deno.jsonc`
     - **Icon (`--icon`):** For Windows builds, includes the specified `.ico` file (`assets/deno-kit.ico`).
   - **Executes `deno compile`:** Runs the command from the project root directory.
   - **Permissions (Non-Windows):** Sets executable permissions (`chmod 0o755`) on the compiled binary for macOS and Linux.
5. **Zip Packaging (`createZipFile`):**
   - Takes the successfully compiled **raw native binary**.
   - Creates a platform-specific `.zip` archive (e.g., `bin/deno-kit-linux-x86_64.zip`).
   - Adds the **raw binary** to the zip archive.
   - Adds a **`.env` file** containing `DENO_ENV=production` to the zip archive. This file is **external** to the binary itself but packaged alongside it.
   - Writes the final `.zip` file to the `bin/` directory.
6. **Cleanup:**
   - **Deletes the raw compiled binary** after it has been successfully added to the `.zip` file.
   - Deletes the temporary `bin/templates.zip` file after all builds are complete.

## 3. Final Output & Binary Details

The final distributable artifacts are the `.zip` files located in the `bin/` directory, one for each target platform.

**Contents of each `.zip` file:**

1. **Native Executable Binary:** The platform-specific compiled application (`deno-kit-platform-arch[.exe]`).
   - **Self-Contained:** Includes the Deno runtime and the application code.
   - **Embedded Resources (VFS):** Contains `templates.zip`, `deno.jsonc`, and the ban list JSON files within its internal virtual file system, accessible via the paths used during the `--include` step.
   - **Permissions:** Pre-set for non-Windows platforms.
   - **Icon:** Embedded for Windows executables.
2. **`.env` File:** A simple text file containing `DENO_ENV=production`. This is crucial for ensuring the application runs in production mode when executed. It needs to be present in the same directory as the binary at runtime (the extraction process handles this).

## 4. Build Testing (`test/build.test.ts`)

The `test/build.test.ts` file provides an end-to-end verification of the build process and the functionality of the resulting binary.

**Test Steps:**

1. **Run Build Script:** Executes `scripts/build.ts` using `Deno.Command`.
2. **Verify Zip Files:** Asserts that all expected platform-specific `.zip` files (e.g., `bin/deno-kit-macos-aarch64.zip`) have been created in the `bin/` directory.
3. **Select Current Platform Zip:** Identifies the correct `.zip` file corresponding to the OS and architecture the test is currently running on.
4. **Extract Zip Contents:** Reads the selected `.zip` file and extracts its contents (the native binary and the `.env` file) into a temporary directory (`tempBinaryDir`).
5. **Set Executable Permissions:** Ensures the extracted binary is executable (for non-Windows).
6. **Run Extracted Binary:** Executes the extracted native binary from the temporary directory using `Deno.Command`, specifically running its `init` command (`<binary_path> init --workspace <temp_workspace_dir>`). Environment variables are set to simulate user input for the `init` process.
   - **Important Note on `cwd`:** The test _does not_ specify a `cwd` (Current Working Directory) when running the extracted binary. Initially, setting `cwd` to the temporary directory containing the binary caused VFS resolution issues within the compiled binary. Allowing Deno to default the `cwd` to the binary's location resolved this specific test environment problem.
7. **Verify `init` Success:** Asserts that the `init` command executed successfully.
8. **Verify Workspace Creation:** Checks that the `init` command correctly created the expected project structure (e.g., `README.md`, `deno.jsonc`, `src/`) within the temporary workspace directory (`tempWorkspaceDir`).

**Implicit Testing:** By successfully running the `init` command and verifying the output, the test implicitly confirms that the binary could:

- Detect the external `.env` file.
- Access the `templates.zip` embedded within its VFS.
- Extract the templates (handled by the `init` command logic, see `src/commands/init.ts`).
- Process and write the template files to the target workspace.

## 5. Resource Handling Flow (Templates Example)

1. **Source:** Raw template files exist in the `templates/` directory.
2. **Build Script (`build.ts`):** Zips the `templates/` directory into `bin/templates.zip`.
3. **Compilation (`deno compile`):** Embeds `bin/templates.zip` into the native binary's VFS using `--include`.
4. **Packaging (`build.ts`):** Packages the binary (with embedded zip) and an external `.env` file into the final platform `.zip`.
5. **Test/Execution (`init` command):**
   - The binary is extracted alongside the `.env` file.
   - The `init` command logic (specifically `extractProductionTemplates` in `src/commands/init.ts`) accesses the embedded `bin/templates.zip` directly from the VFS using `Deno.readFile('bin/templates.zip')`. **Note:** Attempts to calculate this path using `import.meta.url` or `Deno.mainModule` proved unreliable within the compiled binary context.
   - It extracts the _contents_ of the read `templates.zip` data to a temporary OS directory.
   - It uses these extracted templates to generate the project files in the user's workspace.
