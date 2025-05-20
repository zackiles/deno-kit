# Improving Developer Experience for Deno-Kit Template Development

## Problem Statement

The Deno-Kit project faces several significant challenges in template development:

1. **Template Placeholders**: Templates contain placeholders (e.g., `{PACKAGE_NAME}`) that get replaced when scaffolding projects, making local development difficult as IDE tools can't properly process these files.

2. **Path Resolution Problems**: Templates reference files with paths that only exist once compiled on a user's machine, breaking intellisense and type checking during development.

3. **Configuration Files Don't Work Locally**: Template `deno.jsonc` config files can't properly resolve entry points and dependencies during local development.

4. **Code Duplication**: Utility files are duplicated between the CLI codebase (`@src`) and the templates (`@templates`), creating maintenance issues when changes are made to one copy but not the other.

## Proposed Solution: Deno Workspace-Based Development

I propose restructuring the project as a Deno workspace using Deno's monorepo capabilities, which will allow shared code, proper template testing, and improved developer experience.

### Research Basis

Deno 2.0 has robust support for workspaces and monorepos, as detailed in the [Deno workspace documentation](https://docs.deno.com/runtime/fundamentals/workspaces/). This feature allows for managing interdependent packages with proper import resolution, shared configuration, and dependency management.

### Implementation Steps

1. **Create a Workspace Configuration**:
   
   Create a workspace configuration in the root `deno.jsonc` file that includes both the CLI source and template directories:

   ```jsonc
   {
     "workspace": [
       "src/",
       "templates/shared/",
       "templates/cli/",
       "templates/http-server/",
       "templates/library/",
       "templates/mcp-server/",
       "templates/sse-server/",
       "templates/websocket-server/"
     ],
     "imports": {
       "@deno-kit/cli/": "./src/",
       "@deno-kit/templates/": "./templates/",
       "@deno-kit/shared/": "./templates/shared/",
       "@std/fs": "jsr:@std/fs@1",
       "@std/path": "jsr:@std/path@1",
       // ... other shared dependencies
     }
   }
   ```

2. **Create Package Configurations**:
   
   Add `name` and `exports` fields to each workspace member's `deno.jsonc`:

   ```jsonc
   // src/deno.jsonc
   {
     "name": "@deno-kit/cli",
     "exports": {
       ".": "./main.ts",
       "./utils": "./utils/mod.ts",
       "./commands": "./commands/mod.ts"
     }
   }

   // templates/shared/deno.jsonc
   {
     "name": "@deno-kit/shared",
     "exports": {
       "./utils": "./src/utils/mod.ts"
     }
   }
   ```

3. **Create Development Environment for Template Testing**:
   
   Create a specialized development environment that can substitute placeholders during development:

   ```ts
   // devtools/template-dev.ts
   import { compileTemplate } from "../src/workspace/template-compiler.ts";
   
   const DEV_VALUES = {
     PACKAGE_NAME: "dev-package",
     PACKAGE_VERSION: "0.0.0-dev",
     // ... other placeholder values for development
   };
   
   export async function setupDevTemplate(templatePath: string): Promise<string> {
     const devOutputPath = join(Deno.makeTempDir({ prefix: "deno-kit-dev-" }), "output");
     await compileTemplate(templatePath, devOutputPath, DEV_VALUES);
     return devOutputPath;
   }
   ```

4. **Refactor Shared Utilities into a Common Package**:

   Move shared utilities to the `templates/shared` directory and update imports in all workspace members:

   ```ts
   // Old import in CLI
   import logger from '../utils/logger.ts';
   
   // New import after refactoring
   import logger from '@deno-kit/shared/utils/logger.ts';
   ```

5. **Create Template Test Framework**:

   Implement a testing framework that validates templates compile properly:

   ```ts
   // test/template-tests.ts
   import { assertEquals } from "@std/testing/assert.ts";
   import { setupDevTemplate } from "../devtools/template-dev.ts";
   
   Deno.test("CLI template compiles correctly", async () => {
     const devPath = await setupDevTemplate("./templates/cli");
     // Run tests against the compiled template
     const process = new Deno.Command("deno", {
       args: ["test"],
       cwd: devPath,
     });
     const output = await process.output();
     assertEquals(output.code, 0);
   });
   ```

6. **Update Init Command for Production**:

   The `init.ts` command needs minor modifications to work with the new structure, but the core functionality remains the same:

   ```ts
   // Only change how templateValues are used and where templates are loaded from
   async function prepareTemplates(templatesDir: string): Promise<void> {
     // ...existing code with adjustment for workspace paths...
   }
   ```

### Benefits

1. **IDE Support**: With a workspace structure, IDEs can properly recognize and provide intellisense for imports between packages.

2. **Shared Code**: Utilities can be properly shared between CLI and templates, eliminating duplication.

3. **Type Checking**: Template files can be type-checked during development with placeholder values.

4. **Testing**: Templates can be tested in a development environment before release.

5. **Better Developer Experience**: Developers can run and test changes across both CLI code and templates, getting immediate feedback.

## Sample Implementation Code

The key to making this work is setting up a proper development environment that can simulate the compiled templates. Here's pseudocode for the development workflow:

```typescript
// devtools/develop-template.ts
import { compileTemplateWithDevValues } from "./template-dev.ts";

async function main() {
  const templateName = Deno.args[0]; // e.g., "cli"
  if (!templateName) {
    console.error("Template name required");
    Deno.exit(1);
  }
  
  const devPath = await compileTemplateWithDevValues(`./templates/${templateName}`);
  console.log(`Development environment set up at ${devPath}`);
  
  // Watch for changes and recompile
  const watcher = Deno.watchFs([`./templates/${templateName}`, "./templates/shared"]);
  for await (const event of watcher) {
    if (event.kind === "modify") {
      console.log(`File changed: ${event.paths[0]}, recompiling...`);
      await compileTemplateWithDevValues(`./templates/${templateName}`, devPath);
    }
  }
}

main();
```

This approach transforms the project from having difficult-to-maintain templates to a properly structured monorepo with better developer experience and proper code sharing.
