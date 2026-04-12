---
name: Use nvm without version
description: Project has an .nvmrc file — always use `nvm use` without a version argument
type: feedback
---

Always run `nvm use` (no version argument) in this repo. There is an `.nvmrc` file that specifies the correct Node version automatically.

**Why:** Specifying a version explicitly (e.g. `nvm use 24`) is redundant and annoying when the project already pins the version in `.nvmrc`.

**How to apply:** Any time you prefix a command with a Node version switch, write `nvm use &&` not `nvm use 24 &&`.
