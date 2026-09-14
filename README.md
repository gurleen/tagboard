# Tagboard

A desktop application for putting social media posts on a video board.

An operator collects posts from X and Instagram, reviews them, arranges the approved ones on a
board, and puts that board on air. The board renders in a second window that is pushed fullscreen
onto whichever display feeds the video wall, where it rotates through the posts on a grid.

The application is a SvelteKit front end packaged with [Tauri](https://tauri.app). All state —
posts, boards, and downloaded media — lives in a local SQLite database and a local media cache, so
the board keeps rendering after the network goes away and everything survives a restart.

## Requirements

- [Bun](https://bun.sh)
- A Rust toolchain (1.77.2 or later) and the platform prerequisites listed in
  [Tauri's setup guide](https://tauri.app/start/prerequisites/)

## Running

```sh
bun install
bun run tauri:dev
```

`tauri:dev` starts the Vite dev server and the Rust host together. Running `bun run dev` alone opens
the front end in a browser, where the database and media cache do not exist; every page detects this
and says so rather than failing.

## Scripts

| Script                | Purpose                                                 |
| --------------------- | ------------------------------------------------------- |
| `bun run tauri:dev`   | Run the desktop application against the Vite dev server |
| `bun run tauri:build` | Produce a distributable application bundle              |
| `bun run check`       | Type-check the Svelte and TypeScript sources            |
| `bun run lint`        | Prettier and ESLint                                     |
| `bun run format`      | Rewrite sources with Prettier                           |
| `bun run db:generate` | Generate a migration from a schema change (see below)   |
| `bun run db:studio`   | Browse the database with Drizzle Studio                 |

## Changing the schema

The schema is declared once, in `src/lib/database/schema.ts`, and migrations are generated from it:

```sh
bun run db:generate --name <precise_name>
```

Always pass `--name`; drizzle-kit otherwise invents a random one. The generated file lands in
`drizzle/`, which is compiled into the Rust binary and applied at startup. `db:push` and `db:migrate`
are deliberately not wired to the application database — see the note in `drizzle.config.ts`.

## Where things live

```
src/lib/database/     Drizzle schema and the client that talks to Rust
src/lib/ingestion/    Permalink parsing and the post-retrieval interface
src/lib/media/        Media cache bindings
src/lib/board/        Board-window bindings
src/lib/repository/   Every query the panel makes, by subject
src/routes/(panel)/   The control panel (main window)
src/routes/board/     The rotating grid (board window)
src-tauri/src/        SQLite host, media downloader, window management
drizzle/              Generated migrations, embedded in the binary
docs/                 Architecture, data model, and the interface style guide
```

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — the two windows, the database bridge, the media cache
- [`docs/data-model.md`](docs/data-model.md) — every table and what each column is for
- [`docs/post-retrieval.md`](docs/post-retrieval.md) — how posts get in, and the provider decision still open
- [`docs/blueprint-style-guide.md`](docs/blueprint-style-guide.md) — the interface style the panel follows
- [`docs/blueprint-component-inventory.md`](docs/blueprint-component-inventory.md) — the component library
