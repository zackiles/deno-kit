# TODOs

**NOTE**: Along with the following TODOs, there are also code-level TODOs indicated by `TODO:` comments in the code.

## 1) `--force -f` Flag

Since all setup options already have a safe default, introduce this flag to skip all interactive questions. A whole repo + github sync would take place. The only catch is if the gh CLI isn't available we'll have to skip it (or in the unlikely situation where even git itself doesn't exit).

## 2) Refactor workspace modules

This architecture design is way too complicated for the Workspace class's integration with WorkspaceWithGit. You will refactor it for the following requirements which will drastically simplify its usage for consumers

- consumers only want to import the Workspace class from @index.ts . all git or gitHub methods should be on the instance methods or static methods of Workspace.
- the @index.ts file is too big so we have to keep git or github methods in the file @workspace-git.ts .
- implementation doesn't matter, as long as minimal usage of types and code is required to implement the refactored modules.
- consumers should NOT have to do "workspace as WorkspaceWithGit" with instances just to access the method from WorkspaceGit

## 3) Ensure User's PACKAGE_NAME
There is already lots of automation to setup the git repo, push it to Github etc. Since we're getting them to define the full PACKAGE_NAME (which includes "@PROJECT_SCOPE/PROJECT_NAME") we might as well verify that PACKAGE_NAME is available on JSR and NPM. Simple check and validate on project init to warn the user if the name is already taken and suggest they select a different name

## 4) "Set" Commands For Global Config

Add `deno-kit set${configName} ${configValue}` for:

- Name (author's name)
- Email (authors email)
- Always Publish (true/false, for auto-publish to GitHub)
- Always Private (true/false, for auto-publish private GitHub)

Values will beb used in innit command as defaults (that won't be asked for/skipped). We'll additionally need a `deno-kit remove ${configName}`. This will mimic a familiar git CLI config flow.
