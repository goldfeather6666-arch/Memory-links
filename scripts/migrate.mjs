#!/usr/bin/env node
/**
 * Minimal, order-preserving migration runner.
 *
 * Applies every .sql file in migrations/ in name order exactly once, recording
 * applied files in the schema_migrations table. Safe to re-run: already-applied
 * files are skipped. Uses DATABASE_URL from the environment.
 *
 * Usage:  node scripts/migrate.mjs
 */
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "..", "migrations");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

async function ensureTrackingTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function appliedFiles() {
  const { rows } = await pool.query("SELECT filename FROM schema_migrations");
  return new Set(rows.map((r) => r.filename));
}

async function run() {
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("No migration files found.");
    return;
  }

  await ensureTrackingTable();
  const applied = await appliedFiles();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip  ${file}`);
      continue;
    }
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    console.log(`apply ${file}`);
    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await pool.query("COMMIT");
    } catch (err) {
      await pool.query("ROLLBACK");
      throw err;
    }
  }

  console.log("Migrations up to date.");
}

run()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
