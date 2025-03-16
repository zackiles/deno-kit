# **Bin Directory**

## **Purpose**

The `bin/` directory is used to store compiled binaries, vendored files, and executable files that don't meet the criteria for the `scripts/` directory.

## **Rules For Scripts In This Directory**

- **MAY** contain natively-compiled code created using Deno.compile.
- **MAY** contain compiled release builds of {PROJECT_NAME}.
- **MAY** contain vendored files that should not be modified.
- **MAY** contain executable scripts that don't meet the criteria for the `scripts/` directory.
- **MAY** be executed by other files in {PROJECT_NAME} through shell commands or Deno.command.
- **SHOULD** include documentation for any non-obvious executables.

> [!NOTE]\
> For general purpose, self-contained, executable scripts written in Typescript or Javascript that benefit from Deno tooling, use the `scripts/` directory instead.

## **How Files In this Directory are Used**

- Store binaries and executables that don't require or benefit from Deno tooling.
- House compiled output from `deno compile` operations.
- Contain vendored dependencies or tools that should remain unmodified.
- Store executables that are called from {PROJECT_NAME} source files using Deno.command().
- Maintain compiled release builds of {PROJECT_NAME} for distribution.
