# Architecture

## Two windows, one process

The application runs one Tauri process with two web views.

| Window  | Label   | Route                                   | Purpose                                   |
| ------- | ------- | --------------------------------------- | ----------------------------------------- |
| Control | `main`  | `/`, `/library`, `/boards`, `/settings` | What the operator works in                |
| Board   | `board` | `/board`                                | The rotating grid shown on the video wall |

The board window is created on demand by `board_window_open` and can be moved to any attached
display and pushed fullscreen. It is a separate window rather than a panel inside the control
window so it can occupy a second display outright, with no chrome, while the operator keeps
working.

The route group `(panel)` carries the sidebar and menu bar. `/board` sits outside that group, so
the board window loads no panel chrome at all.

The two windows share one database rather than messaging each other. The board polls the live board
every three seconds (`REVISION_POLL_INTERVAL_MS` in `src/routes/board/+page.svelte`) and replaces
what it is rendering only when the content actually changed, so an operator's edit reaches the wall
without a cross-window channel and without tearing down tiles on every poll.

## Drizzle over SQLite, through Tauri

Drizzle does work against SQLite inside Tauri, but not through `tauri-plugin-sql`. The plugin uses
sqlx underneath, which returns each row as an object keyed by column name. Drizzle's `sqlite-proxy`
driver addresses columns **positionally**: it expects `all` and `values` to return arrays of arrays.
A query that projects two columns with the same name — which any join over tables that both have an
`id` does — collapses to a single key, and Drizzle silently reads the wrong values.

So the SQLite host is written directly against `rusqlite` (bundled, so no system SQLite is
required), in `src-tauri/src/database.rs`, and returns rows as `Vec<Vec<JsonValue>>`.

```
Svelte  →  drizzle(sqlite-proxy)  →  invoke()  →  Rust command  →  rusqlite
```

Three commands back the driver:

| Command            | Drizzle method         | Returns                                      |
| ------------------ | ---------------------- | -------------------------------------------- |
| `database_select`  | `all`, `values`, `get` | rows as positional arrays                    |
| `database_execute` | `run`                  | `{ rowsAffected, lastInsertId }`             |
| `database_batch`   | `batch`                | one result per statement, in one transaction |

`src/lib/database/client.ts` wires these to `drizzle()` and throws a clear error when it is loaded
outside the Tauri runtime, which is what every page's "running outside the desktop application"
state comes from.

`database_batch` runs its statements in a single transaction. That is what makes
`setLiveBoard` safe: the board window can never observe two live boards, or none, mid-change.

### Migrations

drizzle-kit generates SQL into `drizzle/`. That directory is compiled into the binary with
`include_dir!` and applied at startup: each `.sql` file is split on `--> statement-breakpoint`, run
inside a transaction, and recorded in `_tagboard_migration`. Files are applied in filename order,
which is why migrations must be named explicitly rather than left to drizzle-kit's random names.

Because the directory is embedded at compile time, **`drizzle/` must exist before `cargo build`**.

The database file is `tagboard.db` in the platform application data directory, opened with WAL
journalling, foreign keys on, and a five-second busy timeout.

## Media cache

Posts reference media by URL, but the board never fetches at air time. When a post is ingested,
`media_cache_store` downloads each asset into `<app data>/media/` under the media row's own
identifier, and the row records the relative path, byte length and content type. The board renders
only assets whose `cache_state` is `cached`.

The web view cannot read arbitrary files, so cached assets are served through Tauri's asset
protocol, scoped in `tauri.conf.json` to `$APPDATA/media/**`. `resolveAsset` turns a stored relative
path into an absolute one and `assetUrl` (`convertFileSrc`) makes it loadable. Anything outside that
directory will not load, by design.

Downloads are capped at 256 MiB per asset and are never awaited on the operator's critical path: a
post appears in the queue immediately and its media fills in behind it.

## Layers

```
routes/            pages; no queries of their own
lib/repository/    every query, grouped by subject (posts, boards)
lib/database/      schema and the Drizzle client
lib/ingestion/     permalink parsing, post retrieval
lib/media/         cache bindings
lib/board/         board-window bindings
```

Repositories read entities and their children with separate queries and group them in memory rather
than joining. This keeps every projection unambiguous, and it is cheap: the working set is a
handful of posts an operator is looking at, not a table scan.

## Front-end shape

SvelteKit runs as a single-page application: `adapter-static` with an `index.html` fallback, and
`ssr = false` / `prerender = false` in the root layout. There is no server; `$lib/server` does not
exist. SvelteKit's configuration is inline in `vite.config.ts` — there is no `svelte.config.js`.
