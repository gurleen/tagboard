# Tagboard

A web application for putting social media posts on a video board.

An operator collects posts from X and Instagram, reviews them, arranges the approved ones on a
board, and puts that board on air. The board renders at an output URL, which is pasted into an OBS
browser source (or opened full-screen on the machine feeding the wall), where it rotates through the
posts on a grid.

The application is SvelteKit deployed as one [Cloudflare Worker](https://developers.cloudflare.com/workers/).
Posts, boards and settings live in [D1](https://developers.cloudflare.com/d1/), and every image and
video a post carries is copied into [R2](https://developers.cloudflare.com/r2/) when it is added, so
the output never waits on a platform's CDN or loses an image when its link expires.

## Requirements

- [Bun](https://bun.sh)
- A Cloudflare account, to deploy

## Running locally

```sh
bun install
bun run db:migrate:local
bun run dev
```

`bun run dev` gives server code local D1 and R2 bindings through Wrangler, stored under `.wrangler/`.
Under Bun alone, cached media cannot be read back from the local R2 bucket, so outputs show initials
in place of avatars and images; see the end of [`docs/architecture.md`](docs/architecture.md).

## Deploying

```sh
bunx wrangler login
bun run deploy                 # provisions the D1 database and R2 bucket on first deploy
bun run db:migrate:remote
```

Then, in the Cloudflare Zero Trust dashboard, put the Worker's hostname behind
[Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/), with bypass
applications for `/output`, `/media` and `/_app/immutable` so OBS can load an output without
signing in. The exact paths, and why `/_app/remote` must not be bypassed, are in
[`docs/architecture.md`](docs/architecture.md#access).

## Putting a board into OBS

1. In the panel, open **Boards** and put a board on air.
2. Copy the URL from the **Board output** card, or a single board's URL from its card.
3. In OBS, add a **Browser** source, paste the URL, and set its width and height to the canvas —
   1920 × 1080 for a full HD output.

Every output URL carries a key. **Settings → Regenerate output key** revokes every URL issued before.

## Scripts

| Script                      | Purpose                                                |
| --------------------------- | ------------------------------------------------------ |
| `bun run dev`               | Run the panel and outputs against local D1 and R2      |
| `bun run preview`           | Build, then run the Worker itself under `wrangler dev` |
| `bun run deploy`            | Build and deploy the Worker                            |
| `bun run check`             | Type-check the Svelte and TypeScript sources           |
| `bun run lint`              | Prettier and ESLint                                    |
| `bun run format`            | Rewrite sources with Prettier                          |
| `bun run db:generate`       | Generate a migration from a schema change (see below)  |
| `bun run db:migrate:local`  | Apply migrations to the local D1 database              |
| `bun run db:migrate:remote` | Apply migrations to the deployed D1 database           |

## Changing the schema

The schema is declared once, in `src/lib/database/schema.ts`, and migrations are generated from it:

```sh
bun run db:generate --name <precise_name>
```

Always pass `--name`; drizzle-kit otherwise invents a random one, and Wrangler applies migrations in
filename order. Apply the result with `db:migrate:local`, and with `db:migrate:remote` when it
ships.

## Where things live

```
src/lib/remote/            Remote commands the panel calls
src/lib/server/            Repositories, post retrieval, R2 storage, the D1 client
src/lib/database/          Drizzle schema and the record shapes both sides share
src/lib/ingestion/         Permalink parsing
src/lib/board/             Output URLs and the output's endpoint bindings
src/routes/(panel)/        The control panel
src/routes/output/         The rotating grid, for OBS or a wall
src/routes/media/          Cached media, served out of R2
drizzle/                   Generated migrations
wrangler.jsonc             Worker configuration and bindings
docs/                      Architecture, data model, and the interface style guide
```

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — the Worker, outputs, Access, D1 and R2
- [`docs/data-model.md`](docs/data-model.md) — every table and what each column is for
- [`docs/post-retrieval.md`](docs/post-retrieval.md) — how posts get in
- [`docs/blueprint-style-guide.md`](docs/blueprint-style-guide.md) — the interface style the panel follows
- [`docs/blueprint-component-inventory.md`](docs/blueprint-component-inventory.md) — the component library
