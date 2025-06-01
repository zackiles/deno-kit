#!/usr/bin/env -S deno run -A --watch

const command = new Deno.Command("deno", {
  args: ["run", "-A", "src/mod.ts"],
});

const output = await command.output();
if (output.success) {
  console.log(new TextDecoder().decode(output.stdout));
} else {
  console.error(new TextDecoder().decode(output.stderr));
}
