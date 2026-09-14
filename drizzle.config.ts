import { defineConfig } from 'drizzle-kit';

/**
 * The live database is created by the Rust side inside the platform app data
 * directory, so drizzle-kit is used only to *generate* migration SQL, which the
 * app then applies itself at startup. `push` and `migrate` are deliberately not
 * wired up: they would write to a different file than the one the app opens.
 *
 * `studio` needs a real file. Point DATABASE_URL at the app's database to inspect
 * live data — on macOS that is:
 *
 *   file:$HOME/Library/Application Support/net.gurleen.tagboard/tagboard.db
 */
export default defineConfig({
	schema: './src/lib/database/schema.ts',
	out: './drizzle',
	dialect: 'sqlite',
	dbCredentials: { url: process.env.DATABASE_URL ?? 'file:local.db' },
	casing: 'snake_case',
	verbose: true,
	strict: true
});
