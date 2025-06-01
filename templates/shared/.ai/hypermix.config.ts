import { join } from "jsr:@std/path";

const generateStdLibMix = (name: string) => ({
  remote: "denoland/std",
  include: [`${name}/**/*.ts`, `${name}/**/*.md`],
  ignore: ["*_test.ts", "testdata*"],
  output: join("@std", `${name}.xml`),
});

export default {
  silent: false,
  outputPath: ".ai/state",
  mixes: [
    {
      remote: "denoland/docs",
      include: ["runtime/fundamentals/**/*.md"],
      output: join("denoland", "guides.xml"),
    },
    {
      remote: "denoland/docs",
      include: ["runtime/reference/**/*.md"],
      output: join("denoland", "api-reference.xml"),
    },
    generateStdLibMix("streams"),
    generateStdLibMix("fmt"),
    generateStdLibMix("data_structures"),
    generateStdLibMix("crypto"),
    generateStdLibMix("datetime"),
    generateStdLibMix("msgpack"),
    generateStdLibMix("semver"),
    generateStdLibMix("bytes"),
    generateStdLibMix("assert"),
    generateStdLibMix("tar"),
    generateStdLibMix("path"),
    generateStdLibMix("text"),
    generateStdLibMix("regexp"),
    generateStdLibMix("fs"),
    generateStdLibMix("cli"),
    generateStdLibMix("async"),
    generateStdLibMix("testing"),
    generateStdLibMix("bytes"),
    generateStdLibMix("collections"),
    generateStdLibMix("encoding"),
    generateStdLibMix("fmt"),
    generateStdLibMix("net"),
    generateStdLibMix("http"),
    generateStdLibMix("io"),
    { repomixConfig: join(".ai", "repomix.config.json") },
  ],
};
