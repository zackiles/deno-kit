#!/usr/bin/env -S deno run --allow-all
import { parse } from '@std/jsonc'

const packageConfig = parse(Deno.readTextFileSync('deno.jsonc'))

if (
  packageConfig && typeof packageConfig === 'object' &&
  'version' in packageConfig
) {
  while (true) {
    const { terminal } = await import(
      `../src/utils/terminal.ts?v=${Date.now()}`
    )
    await terminal.printBanner(packageConfig.version as string)
    // Dynamic import with cache busting to ensure fresh module load
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
} else {
  console.error('Config version is not available.')
}
