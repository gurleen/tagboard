# Architecture

## One Worker, two audiences

The application is one SvelteKit app, built with `@sveltejs/adapter-cloudflare` into a single
Cloudflare Worker that serves the client assets and runs every server route.

| Audience | Routes                                  | Reached by                       | Guarded by               |
| -------- | --------------------------------------- | -------------------------------- | ------------------------ |
| Operator | `/`, `/library`, `/boards`, `/settings` | A browser                        | Cloudflare Access        |
| Output   | `/output/[target]`, `/media/[name]`     | An OBS browser source, or a wall | The output key (`?key=`) |

The route group `(panel)` carries the sidebar and menu bar. `/output` sits outside that group, so an
output loads no panel chrome at all.

### Outputs

An output is a page that renders one board's rotating grid, full-window, for OBS or any other
player that renders a web page. It replaces the separate board window of the desktop application:
OBS decides which display and which scene it lands on, so window placement and fullscreen are no
longer the application's concern.

`[target]` is either `live`, which follows whichever board is on air, or a board's identifier, which
always shows that board whether it is on air or not. Both carry the same output key. The panel shows
the on-air URL in the Board output card, on the Boards and Settings pages, and each board card has a
button that copies its own URL.

The panel and the outputs share one database rather than messaging each other. An output polls
`/output/[target]/state` every three seconds (`REVISION_POLL_INTERVAL_MS` in
`src/routes/output/[target]/+page.svelte`) and replaces what it is rendering only when the content
actually changed, so an operator's edit reaches the wall without a channel between the two and
without tearing down tiles on every poll. A poll that fails changes nothing: a network blip does not
blank the wall. It then reports what it put on screen to `/output/[target]/aired`.

The state is serialised with devalue rather than JSON so timestamps arrive as `Date`, as they do in
the panel.

### Access

Cloudflare Access is configured in the Zero Trust dashboard, not in this repository. The panel needs
an Access application covering the whole hostname, plus a more specific application for each path
an output needs, with a Bypass policy, since OBS cannot sign in. Access applies the most specific
path that matches:

| Path              | Why it must bypass Access                                     |
| ----------------- | ------------------------------------------------------------- |
| `/output`         | The output page and its two endpoints                         |
| `/media`          | The cached images and video a board shows                     |
| `/_app/immutable` | The JavaScript and CSS bundles every page, outputs too, loads |

`/_app/remote`, where the panel's commands are served, must stay behind Access. A bypass on all of
`/_app` would expose every command to anyone who found the URL.

The output endpoints check the key themselves (`$lib/server/output.ts`); `/media` does not, because
its assets are copies of public posts named by unguessable identifiers.

## The panel reaches the server through remote commands

Pages call functions in `src/lib/remote/*.remote.ts`, SvelteKit's experimental remote functions,
enabled in `vite.config.ts`. Each is one `command` per repository function: it validates its
argument with valibot, since anything arriving over the network is untrusted, and hands it on. There
is no logic in them.

Reads are commands too, not `query` functions. The panel loads data imperatively — on mount, and
again after every write — and a client-side `query` is cached by argument: calling it a second time
with the same filter can return the earlier result rather than asking the server again. A command is
never cached, so a reload is always a reload.

A command that throws reaches the client as SvelteKit's `HttpError`, which is not an `Error`.
`describeError` in `$lib/utils` reads the message off either. `handleError` in `hooks.server.ts`
passes an unexpected error's own message through for remote requests, so the operator sees "No post
with id …" rather than "Internal Error"; the public output routes keep the generic message.

## Drizzle over D1

The database is D1, Cloudflare's SQLite, reached through Drizzle's `d1` driver in
`src/lib/server/database.ts`. The binding is read from `platform.env` on the current request,
through `getRequestEvent()`. That works several `await`s deep only because the `nodejs_als`
compatibility flag in `wrangler.jsonc` gives the Worker `AsyncLocalStorage`; do not remove it.

```
page  →  remote command  →  repository  →  drizzle(d1)  →  D1
```

`database().batch()` runs its statements in a single transaction. That is what makes `setLiveBoard`
safe: an output can never observe two live boards, or none, mid-change.

D1 refuses any statement with more than 100 bound parameters. Two consequences run through the
repositories:

- An `IN (…)` list over an arbitrary number of rows is split with `identifierBatches`.
- Rows are inserted one statement apiece, in one batch, rather than in a multi-row insert, which
  binds every column of every row.

Each statement is also a network round trip, so an output's poll reads a board's posts in one query
rather than one per entry.

### Migrations

drizzle-kit generates SQL into `drizzle/`, and Wrangler applies it: `bun run db:migrate:local` for
the database `vite dev` uses, `bun run db:migrate:remote` for the deployed one. Wrangler records what
it has applied in D1's `d1_migrations` table and applies files in filename order, which is why
migrations must be named explicitly rather than left to drizzle-kit's random names.

## Media storage

Posts reference media by URL, but an output never fetches from a platform at air time. After a post
is ingested, `cacheMediaForPost` downloads each asset into the `MEDIA` R2 bucket under the media
row's own identifier, and the row records the object key, byte length and content type. The output
renders only assets whose `cache_state` is `cached`, served out of R2 by `/media/[name]`, which
honours byte ranges so video plays and loops.

A download whose length is declared is streamed into R2 and capped at 256 MiB. One whose length is
not declared has to be read into memory first, because R2 needs a stream's length in advance, and is
capped at 64 MiB to stay well inside a Worker's 128 MB.

Downloads are never awaited on the operator's critical path: the add-post dialog starts them once
the post row is written, so a post appears in the queue immediately and its media fills in behind
it.

## Layers

```
routes/                    pages and endpoints; no queries of their own
lib/remote/                remote commands, one per repository function
lib/server/repository/     every query, grouped by subject (posts, boards, settings)
lib/server/ingestion/      post retrieval from X and Instagram
lib/server/media/          R2 storage
lib/server/database.ts     the Drizzle client
lib/database/              schema, and the record shapes the client and server share
lib/ingestion/             permalink parsing, used on both sides
lib/media/                 media URLs and formatting
lib/board/                 output URLs and the output's endpoint bindings
```

Everything under `lib/server` is server-only, and SvelteKit refuses to bundle it into the client.

Repositories read entities and their children with separate queries and group them in memory rather
than joining. This keeps every projection unambiguous, and it is cheap: the working set is a
handful of posts an operator is looking at, not a table scan.

## Front-end shape

`ssr = false` and `prerender = false` in the root layout: the panel and the outputs both render in
the browser, so there is nothing for the server to render ahead of time. SvelteKit's configuration
is inline in `vite.config.ts` — there is no `svelte.config.js`.

## Running locally

`bun run dev` runs Vite, and the adapter gives server code the D1 and R2 bindings through Wrangler's
local platform proxy, stored under `.wrangler/`. `bun run preview` builds and runs the Worker itself
under `wrangler dev`.

Wrangler supports Node.js, not Bun, as its host runtime. With Bun alone, two things fail locally
that work on Cloudflare: `wrangler dev` accepts connections but never answers them, and the platform
proxy cannot return an R2 object's body, so `/media` answers 500 and outputs fall back to initials in
place of avatars. Writes to R2 work. Both are incompatibilities between Bun and Wrangler's local
tooling, not in the application, and running Wrangler under Node.js is expected to avoid them.
