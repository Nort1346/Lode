# AGENTS.md - cli/

Setup CLI for Lode (`lode-setup`). Interactive TTY app (TypeScript + @clack/prompts) compiled to standalone native binaries with Bun. The root `setup.sh` / `setup.ps1` are thin bootstraps that download this binary from the latest GitHub release - all installer logic lives here.

## Commands

```bash
bun install --frozen-lockfile
bun run typecheck   # tsc --noEmit
bun run lint        # eslint . (type-checked flat config)
bun run test        # vitest run
# Release build (one of 6 targets: bun-{linux,darwin,windows}-{x64,arm64}):
bun build src/index.ts --compile --minify --target=bun-linux-x64 --define BUILD_VERSION='"1.2.3"' --outfile dist/lode-setup-linux-x64
```

## Structure

```
src/
├── index.ts          # Entry: TTY gate + 15-step pipeline + error handling
├── types.ts          # All shared types (no inline types in implementation files)
├── constants.ts      # Env keys, ports, timeouts, option labels, compose file selection
├── core/             # clack prompt wrappers, docker compose helpers, env/state file
│                     # editing, secret generation, downloads, port waits, clipboard,
│                     # OSC 8/52, platform helpers
└── steps/            # One file per setup step (banner -> summary)
test/                 # Vitest suite mirroring src/
```

## Conventions

- Same code style as the repo root: no semicolons, single quotes, 2-space indent, no trailing commas, 120 char width; comments only where the "why" isn't obvious.
- Strict TS (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`); ESLint is type-checked (`recommendedTypeChecked` with `project`).
- No `any`, no non-null assertions, no floating promises, `eqeqeq: always`.
- UI strings are plain English (local tool, no i18n).
- Steps never use `console.*` - use the `log` / `note` / `intro` / `outro` wrappers from `core/prompt.ts` (the pre-TTY error in `index.ts` is the only exception).
- Esc at any prompt aborts the whole setup: clack's `CANCEL_SYMBOL` -> `cancel()` + `process.exit(0)` (see `guard` in `core/prompt.ts`).
- State file `.lode-setup` is flat `key=value` (see `core/state.ts`); `.env` edits go through `core/env.ts` (replace / uncomment / append - string-based, never sed-style, so values with `&`/`$` survive).
- `askSelect` in `core/prompt.ts` calls `select<string>` and narrows the result: clack's `Option<T>` is a deferred conditional type, so a generic call site cannot be type-checked.
- @clack/prompts 1.x spinner API: `const s = spinner(); s.start(msg); s.message(msg); s.stop(msg)` - it is a factory function, not `spinner.start()`.
- Hard failures throw `SetupFailure(message, detailLines)`; `index.ts` prints them and exits 1.

## Release pipeline

`.github/workflows/cli.yml`:

- `check` (PRs + `v*` tags): `bun install --frozen-lockfile`, typecheck, lint, test
- `build` (tags): cross-compiles all 6 targets from one ubuntu runner
- `publish` (tags): polls for the GitHub release that `docker.yml` creates (the docker build finishes long after this pipeline), then uploads the 6 binaries

Binary names are part of the bootstrap contract (`lode-setup-<os>-<arch>[.exe]`) - `setup.sh` / `setup.ps1` resolve the asset from the `releases/latest/download/<asset>` redirect, so renaming them breaks both.
