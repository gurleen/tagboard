# Working in this repository

Tagboard is a Tauri desktop application: a SvelteKit control panel for collecting and reviewing
social media posts, plus a second window that rotates approved posts across a grid on a video wall.

Read [`docs/architecture.md`](docs/architecture.md) before changing anything structural, and
[`docs/data-model.md`](docs/data-model.md) before touching the schema.

## Toolchain

- **Bun** for everything: `bun install`, `bun run <script>`, `bun test`. Never npm, yarn or pnpm.
- **Svelte 5 runes.** `$state`, `$derived`, `$props`, `$effect`. Runes are forced on for sources
  outside `node_modules`; the older store and `export let` idioms will not compile.
- **SvelteKit as a single-page application.** `ssr = false`, `prerender = false`, static adapter
  with an `index.html` fallback. There is no server: do not add `+page.server.ts`, `+layout.server.ts`
  or anything under `$lib/server`.
- SvelteKit's configuration is **inline in `vite.config.ts`**. There is no `svelte.config.js`.

## Naming

Every identifier — file, directory, function, variable, type, commit, branch — uses precise
professional vocabulary: the word an engineer would write in a specification. No slang, no
abbreviations that are not already standard, no clever names.

This applies to generated files too. Always run `bun run db:generate --name <precise_name>`;
drizzle-kit otherwise invents a random name, and migration filenames determine apply order.

## Layering

Pages do not query. Every query lives in `src/lib/repository/`, grouped by subject, and pages call
those functions. Bindings to Rust commands live beside the concern they serve — `lib/media`,
`lib/board`, `lib/database` — and are thin: one function per command, no logic.

Repositories read entities and their children with separate queries and group in memory rather than
joining. This is deliberate; see the note on `attachMediaToAll` in `src/lib/repository/posts.ts`.

## Working with the database

- The schema is declared once, in `src/lib/database/schema.ts`. Change it there, then generate a
  migration. Never hand-edit a file in `drizzle/`.
- `drizzle/` is compiled into the Rust binary with `include_dir!`, so it must exist before
  `cargo build` and must be committed.
- `db:push` and `db:migrate` are not wired to the application database on purpose. They would
  operate on a different file from the one the application opens. See `drizzle.config.ts`.
- Anything that must be atomic goes through `database.batch()`, which is one transaction on the
  Rust side.

## Working with the Rust side

- `src-tauri/src/` is organised by concern: `database`, `media`, `board`, `error`. A new command
  goes in the matching module and must be added to `invoke_handler` in `lib.rs`.
- Errors return `crate::error::Result`; the `Error` enum serialises as its `Display` text, which is
  what the front end shows.
- Enabling a Tauri feature in `tauri.conf.json` requires the matching cargo feature on the `tauri`
  dependency, or the build script fails with an allowlist mismatch.

## Interface

The panel follows the Palantir Blueprint style, implemented over shadcn-svelte. See
[`docs/blueprint-style-guide.md`](docs/blueprint-style-guide.md) and the component inventory beside
it, and read a component's source before using a prop — the variant and size vocabularies are
specific to this library.

Every page that reads the database must handle running outside the Tauri runtime, where the
database does not exist. The established pattern is a `NonIdealState` explaining that the desktop
application is required.

The board window's styling is intentionally plain CSS driven by custom properties from the board's
`theme`, not Tailwind utilities. It is a different medium — a wall seen from across a room — and its
look is data the operator edits, not classes in the source.

## Before finishing

```sh
bun run check      # svelte-check; must be clean
bun run format
cd src-tauri && cargo check
```

`bun run lint` reports pre-existing errors in the vendored `src/lib/components/ui/**` components and
the showcase route. Do not let new ones accumulate in code you write.
