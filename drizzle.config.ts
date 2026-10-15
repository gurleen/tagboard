import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit is used only to *generate* migration SQL. Wrangler applies it to
 * D1 — `bun run db:migrate:local` for the database `vite dev` uses, and
 * `bun run db:migrate:remote` for the deployed one — and records what it has
 * applied in D1's own `d1_migrations` table. `push` and `migrate` are
 * deliberately not wired up: drizzle-kit would track migrations separately from
 * Wrangler, and the two would disagree about what has been applied.
 */
export default defineConfig({
	schema: './src/lib/database/schema.ts',
	out: './drizzle',
	dialect: 'sqlite',
	casing: 'snake_case',
	verbose: true,
	strict: true
});
