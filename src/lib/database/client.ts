import { invoke, isTauri } from '@tauri-apps/api/core';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema';

/**
 * Result of a statement that changed rows, as reported by the Rust side.
 */
type ExecuteResult = {
	rowsAffected: number;
	lastInsertId: number;
};

type ProxyMethod = 'run' | 'all' | 'values' | 'get';

/**
 * One statement in a batch, in the shape the `database_batch` command expects.
 */
type BatchStatement = {
	sql: string;
	parameters: unknown[];
};

class TauriUnavailableError extends Error {
	constructor() {
		super(
			'The database is only reachable inside the Tauri runtime. Start the app with `bun run tauri:dev` rather than `bun run dev`.'
		);
		this.name = 'TauriUnavailableError';
	}
}

function assertTauri() {
	if (!isTauri()) throw new TauriUnavailableError();
}

/**
 * Statements that return rows go to `database_select`; everything else goes to
 * `database_execute`. Drizzle's `values` and `all` both want positional rows, and
 * `get` wants one such row unwrapped.
 */
async function runStatement(sql: string, parameters: unknown[], method: ProxyMethod) {
	assertTauri();

	if (method === 'run') {
		await invoke<ExecuteResult>('database_execute', { sql, parameters });
		return { rows: [] };
	}

	const rows = await invoke<unknown[][]>('database_select', { sql, parameters });
	return { rows: method === 'get' ? (rows[0] ?? []) : rows };
}

/**
 * The control panel's database handle.
 *
 * Queries are built in the web view and executed by the Rust side over Tauri IPC;
 * see `src-tauri/src/database.rs` for why rows cross that boundary positionally.
 */
export const database = drizzle<typeof schema>(
	async (sql, parameters, method) => runStatement(sql, parameters, method as ProxyMethod),
	async (queries) => {
		assertTauri();

		const statements: BatchStatement[] = queries.map(({ sql, params }) => ({
			sql,
			parameters: params
		}));
		await invoke<ExecuteResult[]>('database_batch', { statements });

		// `database_batch` is for atomic writes; it reports row counts rather than
		// rows, so every query in the batch reads back as empty.
		return queries.map(() => ({ rows: [] }));
	},
	{ schema, casing: 'snake_case' }
);

export { schema };
