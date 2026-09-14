//! SQLite storage for the control panel.
//!
//! The web view drives this module through Drizzle's `sqlite-proxy` driver: the
//! TypeScript side generates SQL text plus bound parameters and hands both to
//! [`database_select`] or [`database_execute`]. Rows are returned **positionally**
//! (an array of values per row, in `SELECT` order) rather than as objects keyed by
//! column name, because Drizzle addresses result columns by index and object keys
//! would collide whenever a join projects two columns of the same name.

use std::sync::Mutex;

use include_dir::{include_dir, Dir};
use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{Connection, ToSql};
use serde::Serialize;
use serde_json::{Number, Value as JsonValue};
use tauri::{AppHandle, Manager, State};

use crate::error::{Error, Result};

/// Migrations emitted by `bun run db:generate` (drizzle-kit), embedded into the
/// binary at compile time so a packaged build carries its own schema history.
static MIGRATIONS: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../drizzle");

/// Separator drizzle-kit writes between statements inside one migration file.
const STATEMENT_BREAKPOINT: &str = "--> statement-breakpoint";

const APPLIED_MIGRATIONS_TABLE: &str = "\
CREATE TABLE IF NOT EXISTS _tagboard_migration (
    name        TEXT PRIMARY KEY,
    applied_at  INTEGER NOT NULL
)";

/// The single process-wide connection, guarded so concurrent commands serialize.
pub struct Database(Mutex<Connection>);

impl Database {
    fn with_connection<T>(&self, f: impl FnOnce(&mut Connection) -> Result<T>) -> Result<T> {
        let mut guard = self.0.lock().map_err(|_| Error::ConnectionPoisoned)?;
        f(&mut guard)
    }
}

/// Outcome of a statement that changes rows rather than returning them.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteResult {
    pub rows_affected: usize,
    pub last_insert_id: i64,
}

/// Opens (creating if absent) the control panel database in the platform app data
/// directory and brings it up to the latest embedded migration.
pub fn initialize(app: &AppHandle) -> Result<Database> {
    let directory = app.path().app_data_dir()?;
    std::fs::create_dir_all(&directory)?;

    let mut connection = Connection::open(directory.join("tagboard.db"))?;
    connection.pragma_update(None, "journal_mode", "WAL")?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    connection.pragma_update(None, "busy_timeout", 5_000)?;

    apply_migrations(&mut connection)?;

    Ok(Database(Mutex::new(connection)))
}

/// Runs every embedded migration that is not yet recorded, in filename order.
///
/// drizzle-kit names files with a zero-padded ordinal (`0000_…sql`), so a plain
/// lexicographic sort reproduces generation order.
fn apply_migrations(connection: &mut Connection) -> Result<()> {
    connection.execute(APPLIED_MIGRATIONS_TABLE, [])?;

    let mut pending: Vec<(&str, &str)> = MIGRATIONS
        .files()
        .filter(|file| file.path().extension().is_some_and(|ext| ext == "sql"))
        .filter_map(|file| {
            let name = file.path().file_name()?.to_str()?;
            Some((name, file.contents_utf8()?))
        })
        .collect();
    pending.sort_by(|(left, _), (right, _)| left.cmp(right));

    for (name, body) in pending {
        let already_applied: bool = connection.query_row(
            "SELECT EXISTS (SELECT 1 FROM _tagboard_migration WHERE name = ?1)",
            [name],
            |row| row.get(0),
        )?;
        if already_applied {
            continue;
        }

        let transaction = connection.transaction()?;
        for statement in body.split(STATEMENT_BREAKPOINT) {
            let statement = statement.trim();
            if !statement.is_empty() {
                transaction.execute_batch(statement)?;
            }
        }
        transaction.execute(
            "INSERT INTO _tagboard_migration (name, applied_at) VALUES (?1, unixepoch())",
            [name],
        )?;
        transaction.commit()?;

        log::info!("applied migration {name}");
    }

    Ok(())
}

/// Executes a query and returns its rows positionally.
#[tauri::command]
pub fn database_select(
    database: State<'_, Database>,
    sql: String,
    parameters: Vec<JsonValue>,
) -> Result<Vec<Vec<JsonValue>>> {
    database.with_connection(|connection| {
        let bindings = to_bindings(&parameters)?;
        let mut statement = connection.prepare(&sql)?;
        let column_count = statement.column_count();

        let mut rows = statement.query(rusqlite::params_from_iter(bindings))?;
        let mut output = Vec::new();
        while let Some(row) = rows.next()? {
            let mut values = Vec::with_capacity(column_count);
            for index in 0..column_count {
                values.push(from_sql(row.get_ref(index)?));
            }
            output.push(values);
        }

        Ok(output)
    })
}

/// Executes a statement that returns no rows.
#[tauri::command]
pub fn database_execute(
    database: State<'_, Database>,
    sql: String,
    parameters: Vec<JsonValue>,
) -> Result<ExecuteResult> {
    database.with_connection(|connection| {
        let bindings = to_bindings(&parameters)?;
        let rows_affected = connection.execute(&sql, rusqlite::params_from_iter(bindings))?;

        Ok(ExecuteResult {
            rows_affected,
            last_insert_id: connection.last_insert_rowid(),
        })
    })
}

/// Executes several statements as one atomic transaction.
///
/// Backs Drizzle's batch API and any multi-write operation that must not be
/// observed half-finished — approving a post while stamping its board slot, say.
#[tauri::command]
pub fn database_batch(
    database: State<'_, Database>,
    statements: Vec<BatchStatement>,
) -> Result<Vec<ExecuteResult>> {
    database.with_connection(|connection| {
        let transaction = connection.transaction()?;
        let mut results = Vec::with_capacity(statements.len());

        for statement in &statements {
            let bindings = to_bindings(&statement.parameters)?;
            let rows_affected =
                transaction.execute(&statement.sql, rusqlite::params_from_iter(bindings))?;
            results.push(ExecuteResult {
                rows_affected,
                last_insert_id: transaction.last_insert_rowid(),
            });
        }

        transaction.commit()?;
        Ok(results)
    })
}

/// One statement inside a [`database_batch`] call.
#[derive(Debug, serde::Deserialize)]
pub struct BatchStatement {
    pub sql: String,
    #[serde(default)]
    pub parameters: Vec<JsonValue>,
}

/// Converts JSON parameters sent by the web view into SQLite bindings.
///
/// SQLite has no boolean or composite types, so booleans bind as 0/1 and objects
/// and arrays bind as their JSON text — matching how Drizzle's `integer` boolean
/// mode and `text({ mode: 'json' })` columns expect to read them back.
fn to_bindings(parameters: &[JsonValue]) -> Result<Vec<Box<dyn ToSql>>> {
    parameters
        .iter()
        .map(|parameter| -> Result<Box<dyn ToSql>> {
            let value = match parameter {
                JsonValue::Null => SqlValue::Null,
                JsonValue::Bool(flag) => SqlValue::Integer(i64::from(*flag)),
                JsonValue::Number(number) => {
                    if let Some(integer) = number.as_i64() {
                        SqlValue::Integer(integer)
                    } else if let Some(float) = number.as_f64() {
                        SqlValue::Real(float)
                    } else {
                        return Err(Error::UnsupportedParameter(number.to_string()));
                    }
                }
                JsonValue::String(text) => SqlValue::Text(text.clone()),
                composite => SqlValue::Text(composite.to_string()),
            };
            Ok(Box::new(value))
        })
        .collect()
}

/// Converts one SQLite column value into the JSON the web view receives.
fn from_sql(value: ValueRef<'_>) -> JsonValue {
    match value {
        ValueRef::Null => JsonValue::Null,
        ValueRef::Integer(integer) => JsonValue::Number(Number::from(integer)),
        ValueRef::Real(float) => Number::from_f64(float)
            .map(JsonValue::Number)
            .unwrap_or(JsonValue::Null),
        ValueRef::Text(bytes) => JsonValue::String(String::from_utf8_lossy(bytes).into_owned()),
        ValueRef::Blob(bytes) => {
            JsonValue::Array(bytes.iter().copied().map(JsonValue::from).collect())
        }
    }
}
