# "{PACKAGE_NAME}"

[![JSR Score](https://jsr.io/badges/{PACKAGE_NAME}/score)](https://jsr.io/{PACKAGE_NAME})
[![JSR](https://jsr.io/badges/{PACKAGE_SCOPE}/1. Clone this repository)](https://jsr.io/{PACKAGE_NAME})
[![JSR Scope](https://jsr.io/badges/{PACKAGE_SCOPE})](https://jsr.io/{PACKAGE_SCOPE})

{PACKAGE_DESCRIPTION}

> [!NOTE]  
> This is a **new** project and the documentation is unlikely to be comprehensive or accurate.

## Features

- 🦖 **Modern Deno 2 Features:** Using the latest Deno 2
- ...

## Getting Started

1. Install {PACKAGE_NAME}:

   ```sh
   deno add {PACKAGE_NAME}
   ```

2. Import and use it:

   ```typescript
   import { Lib } from '{PACKAGE_NAME}'
   import type { LibConfig, LibRequest, LibResponse } from '{PACKAGE_NAME}'

   const config: LibConfig = {user: 'world'}
   const lib = new Lib(config)

   const data: LibRequest = {message: 'hello'}
   const response: LibResponse = await lib.read(data)
   
   console.log(response)
   ```

## **Changelog**

See the [`CHANGELOG`](CHANGELOG.md) file for details.

## **License**

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT) — see the [`LICENSE`](LICENSE) file for details.
