import type { D1Database } from '@cloudflare/workers-types';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '$lib/database/schema';
import { bindings } from './environment';

type Database = DrizzleD1Database<typeof schema>;

/** One Drizzle instance per D1 binding, which the Workers runtime keeps for the life of an isolate. */
const instances = new WeakMap<D1Database, Database>();

/**
 * The application database: Drizzle over the D1 binding declared in
 * `wrangler.jsonc`.
 *
 * `database().batch()` runs its statements as one transaction on D1, which is
 * what anything that must be atomic goes through.
 */
export function database(): Database {
	const binding = bindings().DATABASE;
	let instance = instances.get(binding);
	if (!instance) {
		instance = drizzle(binding, { schema, casing: 'snake_case' });
		instances.set(binding, instance);
	}
	return instance;
}

/**
 * How many identifiers one `IN (…)` list may carry.
 *
 * D1 refuses a statement with more than 100 bound parameters. The batch size
 * leaves room for the other conditions a query binds alongside the list.
 */
const IDENTIFIER_BATCH_SIZE = 90;

/**
 * Splits identifiers into lists short enough to bind in one statement, so a
 * query over an arbitrary number of rows can be issued as several.
 */
export function identifierBatches<T>(identifiers: T[]): T[][] {
	const batches: T[][] = [];
	for (let start = 0; start < identifiers.length; start += IDENTIFIER_BATCH_SIZE) {
		batches.push(identifiers.slice(start, start + IDENTIFIER_BATCH_SIZE));
	}
	return batches;
}

export { schema };
