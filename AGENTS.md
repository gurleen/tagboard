# Working in this repository

Tagboard is a SvelteKit application deployed as one Cloudflare Worker: a control panel for
collecting and reviewing social media posts, and output pages, loaded into OBS or onto a video wall,
that rotate approved posts across a grid.

Read [`docs/architecture.md`](docs/architecture.md) before changing anything structural, and
[`docs/data-model.md`](docs/data-model.md) before touching the schema.

## Toolchain

- **Bun** for everything: `bun install`, `bun run <script>`, `bun test`. Never npm, yarn or pnpm.
- **Svelte 5 runes.** `$state`, `$derived`, `$props`, `$effect`. Runes are forced on for sources
  outside `node_modules`; the older store and `export let` idioms will not compile.
- **SvelteKit on `@sveltejs/adapter-cloudflare`.** `ssr = false` and `prerender = false` in the root
  layout: pages render in the browser, and server code runs in the Worker. The adapter is pinned to
  the major version that supports SvelteKit 2; version 8 requires SvelteKit 3.
- SvelteKit's configuration is **inline in `vite.config.ts`**. There is no `svelte.config.js`.
- **Wrangler** owns the Worker configuration (`wrangler.jsonc`), D1 migrations and deployment.

## Naming

Every identifier — file, directory, function, variable, type, commit, branch — uses precise
professional vocabulary: the word an engineer would write in a specification. No slang, no
abbreviations that are not already standard, no clever names.

This applies to generated files too. Always run `bun run db:generate --name <precise_name>`;
drizzle-kit otherwise invents a random name, and migration filenames determine apply order.

## Layering

Pages do not query. Every query lives in `src/lib/server/repository/`, grouped by subject, and pages
call those functions through the remote commands in `src/lib/remote/` — one `command` per repository
function, validating its argument with valibot and doing nothing else. Reads are commands too, not
`query` functions; `docs/architecture.md` explains why.

Code that must never reach the browser — repositories, fetchers, storage, the database client —
lives under `src/lib/server/`. Shapes and pure helpers both sides need live outside it:
`$lib/database/records.ts`, `$lib/ingestion/permalink.ts`, `$lib/media/asset.ts`,
`$lib/board/output.ts`.

Repositories read entities and their children with separate queries and group in memory rather than
joining. This is deliberate; see the note on `attachMediaToAll` in
`src/lib/server/repository/posts.ts`.

## Working with the database

- The schema is declared once, in `src/lib/database/schema.ts`. Change it there, then generate a
  migration. Never hand-edit a file in `drizzle/`.
- Wrangler applies `drizzle/` to D1: `bun run db:migrate:local`, then `bun run db:migrate:remote`
  before deploying a schema change. drizzle-kit's own `push` and `migrate` are not wired up.
- Anything that must be atomic goes through `database().batch()`, which is one transaction on D1.
- D1 refuses a statement with more than 100 bound parameters. Bind identifier lists through
  `identifierBatches`, and insert rows one statement apiece in a batch rather than in one multi-row
  insert.

## Working with the Worker

- Bindings are declared in `wrangler.jsonc` and typed in `App.Platform` in `src/app.d.ts`. Server
  code reads them with `bindings()` from `$lib/server/environment`.
- The `nodejs_als` compatibility flag is what lets `getRequestEvent()` find the bindings after an
  `await`. Do not remove it.
- `/output` and `/media` are public, guarded by the output key rather than Cloudflare Access. Anything
  added under them is reachable by anyone who has an output URL.

## Interface

The panel follows the Palantir Blueprint style, implemented over shadcn-svelte. See
[`docs/blueprint-style-guide.md`](docs/blueprint-style-guide.md) and the component inventory beside
it, and read a component's source before using a prop — the variant and size vocabularies are
specific to this library.

A failed command rejects with SvelteKit's `HttpError`, which is not an `Error`. Show it to the
operator with `describeError` from `$lib/utils`.

The output's styling is intentionally plain CSS driven by custom properties from the board's
`theme`, not Tailwind utilities. It is a different medium — a wall seen from across a room — and its
look is data the operator edits, not classes in the source.

## Before finishing

```sh
bun run check      # svelte-check; must be clean
bun run format
bun run build      # must succeed; it is what Wrangler deploys
```

`bun run lint` reports pre-existing errors in the vendored `src/lib/components/ui/**` components and
the showcase route. Do not let new ones accumulate in code you write.
