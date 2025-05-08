## Comprehensive JSDoc Comment Style Guide for Modern JavaScript/TypeScript

This rule provides comprehensive guidance for writing JSDoc comments in modern TypeScript/JavaScript projects, ensuring they work correctly with advanced linting tools, type checkers, and documentation generators.

### Essential Linting Configuration and Best Practices for JSDoc Comments

#### Ensuring JSDoc Compatibility with Project-Specific Linting Tools (ESLint, Biome, Deno Lint)

Before writing JSDoc comments, ALWAYS check for and respect the project's linting configuration in:

- `deno.json` or `deno.jsonc`
- `package.json` (eslint configuration)
- `.eslintrc.js`, `.eslintrc.json`, or `.eslintrc.yaml`
- `biome.json`
- `.vscode/settings.json`
- Any other project-specific linting configuration files

#### Utilizing Inline Comments for Fine-Grained Linting Rule Control in JSDoc

Use inline linting controls when necessary to prevent false positives:

```typescript
// For file-level ignores:
// @ts-nocheck
// deno-lint-ignore-file
// biome-ignore-file
// eslint-disable

// For line-level ignores:
// @ts-ignore
// deno-lint-ignore <rule-name>
// biome-ignore <rule-name>
// eslint-disable-next-line <rule-name>
```

#### Mandating Valid, Compilable, and Lint-Free Code Examples in JSDoc

Code examples in JSDoc comments MUST:

- Be valid, compilable code that matches the codebase's style
- Include all necessary imports
- Use proper types that exist in the codebase
- Follow the project's linting rules
- Be properly escaped to prevent breaking documentation parsers

### Core JSDoc Authoring Guidelines and Standards

#### Section 1: JSDoc Syntax, Escaping, and General Formatting Rules

##### Properly Escaping Special Characters like Asterisks in JSDoc Comments

When documenting patterns containing double asterisks (`**`), use HTML entity `&ast;` to escape each asterisk.

Example:

```typescript
/**
 * @example
 * ```
 * // BAD - Will break JSDoc parsers and linters
 * glob('src/**/*.ts')
 * 
 * // GOOD - Properly escaped
 * glob('src/&ast;&ast;/&ast;.ts')
 * ```
 */
```

#### Section 2: Essential JSDoc Decorators (Tags) for Comprehensive Documentation

The following decorators should be used when applicable:

##### Decorators for Documenting Modules: @module, @see, @deprecated, @internal

- `@module` - Document module purpose and behavior
- `@see` - Reference related documentation or resources
- `@deprecated` - Mark deprecated modules with migration notes
- `@internal` - Mark internal modules not meant for public use

##### Decorators for Documenting Functions: @param, @returns, @throws, @async, @example, @private, @beta, @deprecated

- `@param` - Document function parameters with proper types
- `@returns` - Document return value and type
- `@throws` - Document exceptions that may be thrown
- `@async` - Mark async functions
- `@example` - Provide type-checked usage examples
- `@private` - Mark private functions
- `@beta` - Mark beta/experimental features
- `@deprecated` - Mark deprecated functions with migration notes

##### Decorators for Documenting Types: @typedef, @property, @template, @extends, @implements

- `@typedef` - Document custom types
- `@property` - Document object properties with types
- `@template` - Document generic type parameters
- `@extends` - Document inheritance
- `@implements` - Document interface implementations

##### Decorators for Testing and Development Context: @test, @ignore, @todo, @version

- `@test` - Mark test functions
- `@ignore` - Exclude from documentation generation
- `@todo` - Document planned changes
- `@version` - Specify version compatibility

#### Section 3: Structuring JSDoc Comments for Clarity and Readability

- **Summary Line:** Start every JSDoc block with a concise single-sentence summary.
- **Description:** Follow the summary with a blank line, then provide more detailed explanations if needed.
- **Decorator Order:** Group decorators logically (e.g., `@param`, `@returns`, `@throws`, `@example`, `@see`, `@deprecated`).
- **Line Length:** Keep lines within a reasonable length (e.g., 80-100 characters) for readability.
- **Single-Line Comments:** Use `/** ... */` for single-line comments only when documenting simple constants or properties where a detailed explanation isn't necessary.

```typescript
/**
 * Calculates the sum of two numbers. // Summary line
 *
 * This function takes two numeric inputs and returns their sum. // Optional detailed description
 * It handles both integers and floating-point numbers.
 *
 * @param {number} a - The first number. // Parameter description
 * @param {number} b - The second number.
 * @returns {number} The sum of a and b. // Return description
 * @example // Example usage
 * ```ts
 * const result = add(5, 3); // result is 8
 * ```
 */
function add(a: number, b: number): number {
  return a + b;
}

/** Maximum allowed connections. */
const MAX_CONNECTIONS = 100;
```

#### Section 4: Crafting Effective and Valid Code Examples within JSDoc

- **Context:** Examples should be self-contained and demonstrate typical usage.
- **Clarity:** Use clear variable names and minimal logic unrelated to the feature being documented.
- **Code Blocks:** Use markdown code fences (```) with language identifiers (e.g., ```ts) for syntax highlighting.
- **Multiple Scenarios:** Provide multiple `@example` blocks for different use cases or edge cases if necessary. Ensure each example has a clear preceding explanation or title within the JSDoc comment.
- **Validation:** As mentioned in "Mandating Valid, Compilable, and Lint-Free Code Examples in JSDoc", examples MUST be valid, runnable code.

```typescript
/**
 * Fetches data from a specified URL.
 *
 * @param {string} url - The URL to fetch data from.
 * @param {RequestInit} [options] - Optional fetch options.
 * @returns {Promise<Response>} The fetch Response object.
 * @throws {TypeError} If the URL is invalid.
 *
 * @example Basic Usage
 * ```ts
 * const response = await fetchData('https://api.example.com/users');
 * const data = await response.json();
 * console.log(data);
 * ```
 *
 * @example With Options
 * ```ts
 * const response = await fetchData('https://api.example.com/posts', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ title: 'New Post' })
 * });
 * console.log(response.status);
 * ```
 */
async function fetchData(url: string, options?: RequestInit): Promise<Response> {
  // Implementation...
  return await fetch(url, options);
}
```

#### Section 5: Advanced JSDoc Techniques for Documenting Complex Types and Generics

- **Complex Types:** Use `@typedef` for complex object shapes or reusable types. Import types using `import(...)` within the `{}` braces for TypeScript compatibility.
- **Generics:** Use `@template` to document generic type parameters, including constraints if applicable.
- **Unions/Intersections:** Document union (`|`) and intersection (`&`) types clearly using standard TypeScript syntax within the type definition (`{type}`).

```typescript
/**
 * @typedef {import("./types.ts").User} User - Represents a user object.
 * Use this type for consistency across the application.
 */

/**
 * @typedef {object} ApiResponse - Describes the standard API response structure.
 * @property {boolean} success - Indicates if the request was successful.
 * @property {T} data - The response payload (generic).
 * @property {string} [message] - Optional status message.
 * @template T - The type of the data payload.
 */

/**
 * Processes an item which can be a string or number, or null.
 * @param {string | number | null} item - The item to process.
 * @returns {string} A description of the item type.
 */
function processItem(item: string | number | null): string {
  if (typeof item === 'string') return 'String';
  if (typeof item === 'number') return 'Number';
  return 'Null';
}

/**
 * @template {HTMLElement} TElement - Must be an HTMLElement or subclass.
 * @param {TElement} element - The element to manipulate.
 * @returns {TElement} The manipulated element.
 */
function manipulateElement<TElement extends HTMLElement>(element: TElement): TElement {
  // ... manipulation logic
  return element;
}
```

#### Section 6: Documenting Error Conditions and Exceptions with @throws

- **`@throws`:** Use `@throws` for documented, expected exceptions. Specify the type of error and the condition under which it's thrown.
- **Specificity:** Be specific about the error type (e.g., `{TypeError}`, `{RangeError}`, `{CustomError}`).
- **Conditions:** Clearly state *why* or *when* the error is thrown.
- **Error Handling:** If relevant, include an `@example` showing how to handle potential errors.

```typescript
/**
 * Gets the user ID from a user object.
 *
 * @param {User} user - The user object.
 * @returns {string} The user's ID.
 * @throws {TypeError} If the input is not a valid User object or lacks an ID.
 * @throws {Error} If the user ID is in an invalid format.
 *
 * @example Handling potential errors
 * ```ts
 * try {
 *   const userId = getUserId(potentialUserData); // Assume potentialUserData is defined
 *   console.log('User ID:', userId);
 * } catch (error) {
 *   if (error instanceof TypeError) {
 *     console.error('Invalid user data provided:', error.message);
 *   } else {
 *     console.error('Failed to get user ID:', error);
 *   }
 * }
 * ```
 */
function getUserId(user: User): string { // Assume User type and isValidIdFormat are defined
  if (!user || typeof user.id !== 'string') {
    throw new TypeError('Invalid user object or missing ID.');
  }
  if (!isValidIdFormat(user.id)) { // Assume isValidIdFormat is defined
     throw new Error('Invalid user ID format.');
  }
  return user.id;
}
```

#### Section 7: Managing API Evolution with @deprecated and Versioning Tags

- **`@deprecated`:** Mark deprecated functions, methods, properties, or modules. Provide a reason and suggest alternatives or migration paths. Include the version number when it was deprecated if possible.
- **`@since`:** Use `@since` (or `@version` if standard) to indicate the version in which a feature was introduced.
- **Clarity:** Make deprecation messages clear and actionable for developers needing to update their code.

```typescript
/**
 * Old method to process data. Use `processDataV2` instead.
 *
 * @deprecated Since version 2.0.0. Use {@link processDataV2} for improved performance.
 * @param {any} data - The data to process.
 * @returns {any} Processed data.
 */
function processData(data: any): any {
  // ... old implementation
  return data;
}

/**
 * New, improved method to process data.
 * @since 2.0.0
 * @param {any} data - The data to process.
 * @returns {Promise<any>} Processed data.
 */
async function processDataV2(data: any): Promise<any> {
  // ... new implementation
  return data;
}
```

#### Section 8: Guidelines for JSDoc Compatibility with Documentation Generators like TypeDoc

- **TypeDoc Awareness:** Write comments with TypeDoc (or the project's chosen generator) in mind. Use standard decorators that TypeDoc recognizes.
- **`@module` and Exports:** Ensure modules and key exports are clearly documented for API reference generation. Use `@module` at the top of files for module-level documentation.
- **`@private` / `@internal`:** Use `@private` or `@internal` consistently to hide implementation details from public documentation. TypeDoc respects these tags.
- **Markdown:** Leverage markdown within descriptions for formatting (lists, links, bolding, etc.).

#### Section 9: General Best Practices for Writing High-Quality JSDoc Comments

- **Be Concise:** Document *why* something exists or *why* it's done a certain way, not just *what* it does (the code itself often shows the 'what'). Avoid overly verbose comments.
- **Keep Docs Updated:** Documentation is code. Treat it with the same importance. Update JSDoc comments whenever the corresponding code changes. Stale documentation is misleading.
- **Document Exports:** Prioritize documenting publicly exported functions, classes, types, and constants. Internal implementation details may require less documentation.
- **Consistency:** Follow the established style and conventions within the project.

#### Section 10: Enforcing JSDoc Standards with Linters and Automated Validation

- **Integrate Linting:** Use JSDoc linters (like `eslint-plugin-jsdoc` or Biome's built-in rules) integrated into the development workflow (IDE, pre-commit hooks, CI).
- **Strict Rules:** Enable strict JSDoc linting rules to enforce consistency and completeness (e.g., require `@param` descriptions, check type validity).
- **Automated Checks:** Include documentation generation and validation steps in CI/CD pipelines to catch errors early.
- **Coverage:** While 100% coverage isn't always practical, strive for high documentation coverage for the public API surface.

### Illustrative JSDoc Examples with Linting Considerations

#### Example: Module-Level JSDoc with Inline Linting Directives

```typescript
// deno-lint-ignore-file no-explicit-any
/**
 * @module config_loader
 *
 * Loads and validates configuration files for the application.
 * Supports multiple formats including JSON, YAML, and TOML.
 *
 * @example
 * ```ts
 * import { type Config, loadConfig } from "./config.ts"; // Assume Config and loadConfig are defined
 *
 * const config: Config = await loadConfig("app.config.json");
 * ```
 *
 * @see {@link Config} for type definition
 * @see {@link validateConfig} for validation utilities // Assume validateConfig is defined
 * @beta
 */
// Placeholder for module content to make example self-contained for linters
export type Config = { setting: string };
export async function loadConfig(path: string): Promise<Config> { return { setting: path }; }
export function validateConfig(config: Config): boolean { return !!config.setting; }

```

### Guidance on Applying and Maintaining These JSDoc Rules

- This rule should be applied to all new code and documentation
- Existing documentation should be updated to follow these guidelines during regular maintenance
- Documentation coverage should be monitored and maintained
- Always verify JSDoc comments pass all configured linters before committing

### Cross-References to Other Relevant Cursor Coding Rules

- `with-typescript` - TypeScript documentation specifics
- `with-javascript` - JavaScript documentation specifics
- `with-tests` - Test documentation specifics 
