"""
Migration: Retool DB -> Azure Postgres
Copies schema + data for all app tables.
"""
import os
import sys
import psycopg2
from psycopg2.extras import Json
from dotenv import load_dotenv

load_dotenv()

# Source: Retool
RETOOL_URL = os.getenv("DATABASE_URL", "").strip()

# Target: Azure Postgres
AZURE_URL = (
    "postgresql://azureuser:Valuemomentum123"
    "@agent-marketplace.postgres.database.azure.com:5432/ops-bot"
    "?sslmode=require"
)

SCHEMAS = {
    "bench": """
        CREATE TABLE IF NOT EXISTS bench (
            id                    SERIAL PRIMARY KEY,
            vamid                 TEXT,
            name                  TEXT,
            joining_date          TEXT,
            grade                 TEXT,
            tsc                   TEXT,
            account               TEXT,
            project               TEXT,
            allocation_status     TEXT,
            allocation_start_date TEXT,
            allocation_end_date   TEXT,
            first_level_manager   TEXT,
            designation           TEXT,
            email                 TEXT,
            sub_dept              TEXT,
            relieving_date        DATE,
            resigned_on           DATE,
            resignation_status    TEXT,
            second_level_manager  TEXT,
            currentskill          TEXT,
            primary_skill         TEXT,
            vam_exp               REAL,
            total_exp             REAL,
            accountsummary        TEXT,
            resourcing_unit       TEXT,
            workspace             TEXT,
            bench_days_assigned   INTEGER,
            secondary_skill       TEXT,
            third_skill           TEXT
        );
    """,
    "rrf": """
        CREATE TABLE IF NOT EXISTS rrf (
            id           SERIAL PRIMARY KEY,
            account      TEXT,
            rrf_id       TEXT,
            created_on   TIMESTAMP,
            required_by  TIMESTAMP,
            pos_title    TEXT,
            role         TEXT,
            status       TEXT,
            tag_comments TEXT,
            type         TEXT,
            project_name TEXT
        );
    """,
    "allocation_table": """
        CREATE TABLE IF NOT EXISTS allocation_table (
            id             SERIAL PRIMARY KEY,
            vamid          TEXT,
            name           TEXT,
            grade          TEXT,
            designation    TEXT,
            email          TEXT,
            account        TEXT,
            rrf_id         TEXT,
            pos_title      TEXT,
            role           TEXT,
            allocated_date TIMESTAMP
        );
    """,
    "associates_directory": """
        CREATE TABLE IF NOT EXISTS associates_directory (
            id              SERIAL PRIMARY KEY,
            vamid           TEXT UNIQUE,
            name            TEXT,
            email           TEXT UNIQUE,
            account         TEXT,
            skill           TEXT,
            primary_skill   TEXT,
            secondary_skill TEXT,
            grade           TEXT,
            designation     TEXT,
            manager         TEXT,
            raw_data        JSONB,
            uploaded_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """
}


def log(msg):
    sys.stdout.write(msg + "\n")
    sys.stdout.flush()


def migrate():
    log("Connecting to Retool...")
    src = psycopg2.connect(RETOOL_URL)
    log("Connecting to Azure Postgres...")
    tgt = psycopg2.connect(AZURE_URL)
    src_cur = src.cursor()
    tgt_cur = tgt.cursor()

    for table, ddl in SCHEMAS.items():
        log(f"\n[{table}]")

        tgt_cur.execute(ddl)
        tgt.commit()
        log("  Schema created/verified on Azure.")

        tgt_cur.execute(f"DELETE FROM {table};")
        tgt.commit()
        log("  Cleared existing data on Azure.")

        src_cur.execute(f"SELECT * FROM {table};")
        rows = src_cur.fetchall()
        col_names = [desc[0] for desc in src_cur.description]
        log(f"  Fetched {len(rows)} rows from Retool.")

        if not rows:
            log("  No data to migrate.")
            continue

        # Skip id (col 0), let Azure auto-generate
        data_cols = col_names[1:]
        placeholders = ", ".join(["%s"] * len(data_cols))
        col_list = ", ".join(data_cols)
        insert_sql = f"INSERT INTO {table} ({col_list}) VALUES ({placeholders})"

        # Wrap any dict/list values as Json() for JSONB columns
        def wrap(val):
            if isinstance(val, (dict, list)):
                return Json(val)
            return val

        data = [tuple(wrap(v) for v in row[1:]) for row in rows]
        tgt_cur.executemany(insert_sql, data)
        tgt.commit()
        log(f"  Migrated {len(data)} rows to Azure.")

    src_cur.close()
    src.close()
    tgt_cur.close()
    tgt.close()
    log("\nMigration complete.")


if __name__ == "__main__":
    migrate()
