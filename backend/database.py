import psycopg2
import json
import os
from datetime import datetime
from dotenv import load_dotenv
import pandas as pd
from psycopg2.extras import Json
import re

# Load environment variables from .env file
load_dotenv()

def connect_to_retool():
    return psycopg2.connect(os.getenv("DATABASE_URL"))


ASSOCIATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS associates_directory (
    id SERIAL PRIMARY KEY,
    vamid TEXT UNIQUE,
    name TEXT,
    email TEXT UNIQUE,
    account TEXT,
    skill TEXT,
    primary_skill TEXT,
    secondary_skill TEXT,
    grade TEXT,
    designation TEXT,
    manager TEXT,
    raw_data JSONB,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""


def ensure_associates_table(cursor):
    cursor.execute(ASSOCIATE_TABLE_SQL)


def _normalize_column_name(value):
    return re.sub(r'[^a-z0-9]+', '_', str(value).strip().lower()).strip("_")


def _first_value(row, keys):
    for key in keys:
        if key in row and pd.notna(row[key]) and str(row[key]).strip() != "":
            return str(row[key]).strip()
    return None


def _associate_from_row(row):
    normalized = {_normalize_column_name(key): value for key, value in row.items()}
    return {
        "vamid": _first_value(normalized, [
            "vamid", "vam_id", "associate_id", "employee_id", "emp_id",
            "personnel_number", "personnel_no", "personnel_id"
        ]),
        "name": _first_value(normalized, ["name", "associate_name", "employee_name", "full_name"]),
        "email": _first_value(normalized, ["email", "email_id", "mail", "official_email"]),
        "account": _first_value(normalized, [
            "account", "account_name", "mapped_account", "mapped_accounts",
            "client", "customer"
        ]),
        "skill": _first_value(normalized, [
            "skill", "skills", "current_skill", "skill_category",
            "please_specify_the_skill_category", "mapped_skill"
        ]),
        "primary_skill": _first_value(normalized, ["primary_skill", "primary_skills", "main_skill"]),
        "secondary_skill": _first_value(normalized, ["secondary_skill", "secondary_skills"]),
        "grade": _first_value(normalized, ["grade", "level"]),
        "designation": _first_value(normalized, ["designation", "role", "title"]),
        "manager": _first_value(normalized, ["manager", "first_level_manager", "reporting_manager"]),
        "raw_data": {key: (None if pd.isna(value) else str(value)) for key, value in normalized.items()}
    }


def _looks_like_filter_banner(row):
    values = [str(value).strip().lower() for value in row if pd.notna(value)]
    return any(value.startswith("applied filters:") for value in values)


def _prepare_associates_dataframe(df_associates: pd.DataFrame):
    known_headers = {
        "vamid", "vam_id", "associate_id", "employee_id", "emp_id",
        "personnel_number", "name", "associate_name", "employee_name",
        "email", "email_id", "mapped_account", "account", "account_name",
        "skill", "skills", "primary_skill", "designation", "grade"
    }

    raw_df = df_associates.dropna(how="all").copy()
    if raw_df.empty:
        return raw_df

    header_index = None
    for idx, row in raw_df.iterrows():
        if _looks_like_filter_banner(row):
            continue
        normalized_cells = {_normalize_column_name(value) for value in row if pd.notna(value)}
        if len(normalized_cells.intersection(known_headers)) >= 2:
            header_index = idx
            break

    if header_index is not None:
        header_values = [
            _normalize_column_name(value) if pd.notna(value) and str(value).strip() else f"column_{i}"
            for i, value in enumerate(raw_df.loc[header_index].tolist())
        ]
        prepared = raw_df.loc[header_index + 1:].copy()
        prepared.columns = header_values
    else:
        prepared = raw_df.copy()
        prepared.columns = [_normalize_column_name(column) for column in prepared.columns]

    prepared = prepared.dropna(how="all")
    prepared = prepared[
        ~prepared.apply(lambda row: _looks_like_filter_banner(row.tolist()), axis=1)
    ]
    return prepared


def get_associates_db():
    conn = None
    try:
        conn = connect_to_retool()
        cursor = conn.cursor()
        ensure_associates_table(cursor)
        conn.commit()
        cursor.execute("""
            SELECT vamid, name, email, account, skill, primary_skill, secondary_skill,
                   grade, designation, manager, uploaded_at
            FROM associates_directory
            ORDER BY uploaded_at DESC, name ASC;
        """)
        rows = cursor.fetchall()
        cursor.close()
        return [
            {
                "vamid": row[0],
                "name": row[1],
                "email": row[2],
                "account": row[3],
                "skill": row[4],
                "primary_skill": row[5],
                "secondary_skill": row[6],
                "grade": row[7],
                "designation": row[8],
                "manager": row[9],
                "uploaded_at": row[10]
            }
            for row in rows
        ]
    except Exception as e:
        print(f"Error retrieving associates: {e}")
        return []
    finally:
        if conn:
            conn.close()


def insert_new_associates(df_associates: pd.DataFrame):
    conn = None
    inserted = 0
    skipped = 0
    updated = 0
    try:
        conn = connect_to_retool()
        cursor = conn.cursor()
        ensure_associates_table(cursor)

        df_clean = _prepare_associates_dataframe(df_associates)

        for record in df_clean.to_dict("records"):
            associate = _associate_from_row(record)
            visible_values = [
                associate.get("name"),
                associate.get("email"),
                associate.get("account"),
                associate.get("skill"),
                associate.get("primary_skill")
            ]
            if any(str(value).strip().lower().startswith("applied filters:") for value in visible_values if value):
                skipped += 1
                continue

            if not associate["vamid"] and not associate["email"]:
                skipped += 1
                continue

            cursor.execute(
                """
                SELECT id FROM associates_directory
                WHERE (%s IS NOT NULL AND vamid = %s)
                   OR (%s IS NOT NULL AND email = %s)
                LIMIT 1;
                """,
                (associate["vamid"], associate["vamid"], associate["email"], associate["email"])
            )
            existing = cursor.fetchone()
            if existing:
                cursor.execute(
                    """
                    UPDATE associates_directory
                    SET name = COALESCE(name, %s),
                        email = COALESCE(email, %s),
                        account = COALESCE(account, %s),
                        skill = COALESCE(skill, %s),
                        primary_skill = COALESCE(primary_skill, %s),
                        secondary_skill = COALESCE(secondary_skill, %s),
                        grade = COALESCE(grade, %s),
                        designation = COALESCE(designation, %s),
                        manager = COALESCE(manager, %s)
                    WHERE id = %s;
                    """,
                    (
                        associate["name"],
                        associate["email"],
                        associate["account"],
                        associate["skill"],
                        associate["primary_skill"],
                        associate["secondary_skill"],
                        associate["grade"],
                        associate["designation"],
                        associate["manager"],
                        existing[0]
                    )
                )
                updated += 1
                skipped += 1
                continue

            cursor.execute(
                """
                INSERT INTO associates_directory (
                    vamid, name, email, account, skill, primary_skill,
                    secondary_skill, grade, designation, manager, raw_data
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                """,
                (
                    associate["vamid"],
                    associate["name"],
                    associate["email"],
                    associate["account"],
                    associate["skill"],
                    associate["primary_skill"],
                    associate["secondary_skill"],
                    associate["grade"],
                    associate["designation"],
                    associate["manager"],
                    Json(associate["raw_data"])
                )
            )
            inserted += 1

        conn.commit()
        cursor.close()
        return {
            "inserted": inserted,
            "updated": updated,
            "skipped": skipped,
            "total_rows": inserted + skipped
        }
    except Exception as e:
        print(f"Error inserting associates: {e}")
        if conn:
            conn.rollback()
        return {"inserted": inserted, "updated": updated, "skipped": skipped, "error": str(e)}
    finally:
        if conn:
            conn.close()

def get_allocated_resources_db():
    """
    Returns Platform, App & Infra resources currently allocated to accounts
    i.e. bench_days_assigned IS NULL or 0.
    """
    try:
        conn = connect_to_retool()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT vamid, name, grade, tsc, workspace, currentskill, primary_skill, secondary_skill,
                   third_skill, vam_exp, total_exp, accountsummary, bench_days_assigned
            FROM bench
            WHERE tsc = 'Platform, App & Infra'
              AND (bench_days_assigned IS NULL OR bench_days_assigned = 0)
            ORDER BY name ASC;
        """)
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        return [
            {
                "vamid":               r[0],
                "name":                r[1],
                "grade":               r[2],
                "tsc":                 r[3],
                "workspace":           r[4],
                "current_skill":       r[5],
                "primary_skill":       r[6],
                "secondary_skill":     r[7],
                "third_skill":         r[8],
                "vam_exp":             r[9],
                "total_exp":           r[10],
                "account_summary":     r[11],
                "bench_days_assigned": r[12],
                "allocation_status":   "Allocated"
            }
            for r in rows
        ]
    except Exception as e:
        print(f"Error retrieving allocated resources: {e}")
        if 'conn' in locals():
            conn.close()
        return []


def get_candidates_db():
    try:
        conn = connect_to_retool()
        cursor = conn.cursor()
        # BB = Bench resources: Platform, App & Infra TSC with bench_days_assigned > 0
        cursor.execute("""
            SELECT vamid, name, grade, tsc, workspace, currentskill, primary_skill, secondary_skill,
                   third_skill, vam_exp, total_exp, accountsummary, bench_days_assigned
            FROM bench
            WHERE tsc = 'Platform, App & Infra'
              AND bench_days_assigned > 0
            ORDER BY bench_days_assigned DESC, name ASC;
        """)
        candidates = cursor.fetchall()
        dict_candidates = []
        for c in candidates:
            dict_candidates.append({
                "vamid":               c[0],
                "name":                c[1],
                "grade":               c[2],
                "tsc":                 c[3],
                "workspace":           c[4],
                "current_skill":       c[5],
                "primary_skill":       c[6],
                "secondary_skill":     c[7],
                "third_skill":         c[8],
                "vam_exp":             c[9],
                "total_exp":           c[10],
                "account_summary":     c[11],
                "bench_days_assigned": c[12],
                "allocation_status":   "BB"
            })
        cursor.close()
        conn.close()
        return dict_candidates
    except Exception as e:
        print(f"Error retrieving candidates: {e}")
        if 'conn' in locals():
            conn.close()
        return []

def candidate_by_id(vam_id: str):
    try:
        conn=connect_to_retool()
        cursor=conn.cursor()
        cursor.execute("SELECT * FROM bench WHERE vamid = %s;", (vam_id,))
        candidate = cursor.fetchone()
        cursor.close()
        conn.close()
        if candidate:
            return {
                "vamid": candidate[1],
                "name": candidate[2],
                # "joining_date": candidate[3],
                "grade": candidate[4],
                # "tsc": candidate[5],
                # "account": candidate[6],
                # "project": candidate[7],
                # "allocation_status": candidate[8],
                # "allocation_start_date": candidate[9],
                # "allocation_end_date": candidate[10],
                # "first_level_manager": candidate[11],
                "designation": candidate[12],
                "email": candidate[13],
                # "sub_dept": candidate[14],
                # "relieving_date": candidate[15],
                # "resigned_on": candidate[16],
                # "resignation_status": candidate[17],
                # "second_level_manager": candidate[18],
                # "current_skill": candidate[19],
                # "primary_skill": candidate[20],
                # "vam_exp": candidate[21],
                # "total_exp": candidate[22],
                # "account_summary": candidate[23],
                # "resourcing_unit": candidate[24],
                # "workspace": candidate[25],
            }
        return {}
    except Exception as e:
        print(f"Error retrieving candidate by ID: {e}")
        if 'conn' in locals():
            conn.close()
        return {}
    
def get_rrf_by_id(rrf_id):
    try:
        conn = connect_to_retool()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM rrf WHERE rrf_id = %s;", (rrf_id,))
        rrf = cursor.fetchone()
        cursor.close()
        conn.close()
        if rrf:
            return {
                "account": rrf[1] if len(rrf) > 1 else None,
                "rrf_id": rrf[2] if len(rrf) > 2 else None,
                # "created_on": rrf[3] if len(rrf) > 3 else None,
                # "required_by": rrf[4] if len(rrf) > 4 else None,
                "pos_title": rrf[5] if len(rrf) > 5 else None,
                "role": rrf[6] if len(rrf) > 6 else None,
                # "status": rrf[7] if len(rrf) > 7 else None,
                # "tag_comments": rrf[8] if len(rrf) > 8 else None,
                # "type": rrf[9] if len(rrf) > 9 else None,
                # "project_name": rrf[10] if len(rrf) > 10 else None
            }
        return {}
    except Exception as e:
        print(f"Error retrieving RRF by ID: {e}")
        if 'conn' in locals():
            conn.close()
        return {}

def list_retool_tables():
    try:
        conn = connect_to_retool()
        cursor = conn.cursor()
        cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';")
        tables = [row[0] for row in cursor.fetchall()]
        cursor.close()
        conn.close()
        # print(tables)
        return tables
    except Exception as e:
        print(f"Error listing tables: {e}")
        if 'conn' in locals():
            if 'cursor' in locals():
                cursor.close()
            conn.close()
        return []
    
def get_dashboard():
    conn = None
    try:
        conn = connect_to_retool()
        cursor = conn.cursor()

        # Bench count
        cursor.execute("SELECT COUNT(*) FROM bench WHERE tsc = 'Platform, App & Infra' AND bench_days_assigned > 0;")
        bench_count = cursor.fetchone()[0]
        # print("===")
        # print(f"Bench count: {bench_count}")

        # Distinct RRF count
        cursor.execute("SELECT COUNT(rrf_id) FROM rrf WHERE status = 'Open';")
        rrf_count = cursor.fetchone()[0]
        # print(f"RRF count: {rrf_count}")

        return {
            "bench_count": bench_count,
            "rrf_count": rrf_count
        }

    except Exception as e:
        print(f"Error retrieving dashboard data: {e}")
        return {
            "bench_count": 0,
            "rrf_count": 0,
            "error": str(e)
        }

    finally:
        if conn:
            conn.close()

def get_rrf_details():
    conn = None
    try:
        conn = connect_to_retool()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM rrf WHERE status = 'Open';")
        rrf_details = cursor.fetchall()

        return [
            {
                "account": detail[1] if len(detail) > 1 else None,
                "rrf_id": detail[2] if len(detail) > 2 else None,
                "created_on": detail[3] if len(detail) > 3 else None,
                "required_by": detail[4] if len(detail) > 4 else None,
                "pos_title": detail[5] if len(detail) > 5 else None,
                "role": detail[6] if len(detail) > 6 else None,
                "status": detail[7] if len(detail) > 7 else None,
                "tag_comments": detail[8] if len(detail) > 8 else None,
                "type": detail[9] if len(detail) > 9 else None,
                "project_name": detail[10] if len(detail) > 10 else None
            }
            for detail in rrf_details
        ]

    except Exception as e:
        print(f"Error retrieving RRF details: {e}")
        return []

    finally:
        if conn:
            conn.close()


def update_pos_id(id):
    try:
        conn = connect_to_retool()
        cursor = conn.cursor()
        cursor.execute("UPDATE rrf SET status = 'closed' WHERE rrf_id = %s;", (id,))
        conn.commit()
        cursor.close()
        conn.close()
        print(f"Position ID updated for RRF ID: {id}")
    except Exception as e:
        print(f"Error updating position ID: {e}")
        if 'conn' in locals():
            conn.rollback()
            cursor.close()
            conn.close()


def update_rrf_status(rrf_id: str):
    try:
        conn = connect_to_retool()
        cursor = conn.cursor()
        cursor.execute("UPDATE rrf SET status = 'Closed' WHERE rrf_id = %s;", (rrf_id, ))
        conn.commit()
        cursor.close()
        conn.close()
        print(f"Updated RRF status for RRF ID: {rrf_id}")
        return True
    except Exception as e:
        print(f"Error updating RRF status: {e}")
        if 'conn' in locals():
            conn.rollback()
            cursor.close()
            conn.close()
            return False


def update_associate_status(vamid: str):
    try:
        conn = connect_to_retool()
        cursor = conn.cursor()
        cursor.execute("UPDATE bench SET allocation_status = 'BP' WHERE vamid = %s;", (vamid,))
        conn.commit()
        cursor.close()
        conn.close()
        print(f"Updated associate status for ID: {vamid}")
        return True
    except Exception as e:
        print(f"Error updating associate status: {e}")
        if 'conn' in locals():
            conn.rollback()
            cursor.close()
            conn.close()
        return False

def insert_into_allocation_table(rrf_id: str, vam_id: str):
    try:
        associate_details = candidate_by_id(vam_id)
        rrf_details = get_rrf_by_id(rrf_id)
        # print(rrf_details.get("account"))
        conn = connect_to_retool()
        cursor = conn.cursor()
        cursor.execute("INSERT INTO allocation_table (vamid,name,grade,designation,email,account,rrf_id,pos_title,role,allocated_date) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s);", (
            associate_details.get("vamid"),
            associate_details.get("name"),
            associate_details.get("grade"),
            associate_details.get("designation"),
            associate_details.get("email"),
            rrf_details.get("account"),
            rrf_details.get("rrf_id"),
            rrf_details.get("pos_title"),
            rrf_details.get("role"),
            datetime.now()
        ))
        conn.commit()
        cursor.close()
        conn.close()
        print(f"Inserted into allocation table for RRF ID: {rrf_id} and VAM ID: {vam_id}")
    except Exception as e:
        print(f"Error inserting into allocation table: {e}")
        if 'conn' in locals():
            conn.rollback()
            cursor.close()
            conn.close()




def insert_into_bench_table(df_bench: pd.DataFrame):
    try:
        conn = connect_to_retool()
        cursor = conn.cursor()

        columns = [
            "vamid", "name", "joining_date", "grade", "tsc", "account",
            "project", "allocation_status", "allocation_start_date",
            "allocation_end_date", "first_level_manager", "designation",
            "email", "sub_dept", "relieving_date", "resigned_on",
            "resignation_status", "second_level_manager", "currentskill",
            "primary_skill", "vam_exp", "total_exp", "accountsummary",
            "resourcing_unit", "workspace", "bench_days_assigned",
            "secondary_skill", "third_skill"
        ]

        # Create a clean copy
        df_clean = df_bench.copy()

        # Add missing columns
        for col in columns:
            if col not in df_clean.columns:
                df_clean[col] = None

        # Handle date columns
        date_columns = ["joining_date", "allocation_start_date", "allocation_end_date", 
                       "relieving_date", "resigned_on"]

        for col in date_columns:
            if col in df_clean.columns:
                df_clean[col] = pd.to_datetime(df_clean[col], errors="coerce")
                df_clean[col] = df_clean[col].apply(
                    lambda x: None if pd.isna(x) else x.to_pydatetime()
                )

        # One-step null handling - replace all nulls with None
        df_clean = df_clean.replace({pd.NaT: None, float("nan"): None})

        # Select required columns
        df_insert = df_clean[columns]

        # Convert to records and then to tuples
        records = df_insert.to_dict('records')
        data = [tuple(record[col] for col in columns) for record in records]

        placeholders = ", ".join(["%s"] * len(columns))
        sql = f"INSERT INTO bench ({', '.join(columns)}) VALUES ({placeholders})"

        cursor.executemany(sql, data)
        conn.commit()

        print(f"Inserted {len(data)} records into bench table")
        return True

    except Exception as e:
        print(f"Error inserting into bench table: {e}")
        if 'conn' in locals() and conn:
            conn.rollback()
        return False
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            conn.close()



#function to clear all the data in bench table
def clear_bench_table():
    try:
        conn = connect_to_retool()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM bench;")
        conn.commit()
        cursor.close()
        conn.close()
        print("Cleared all data from bench table.")
        return True
    except Exception as e:
        print(f"Error clearing bench table: {e}")
        if 'conn' in locals():
            conn.rollback()
            cursor.close()
            conn.close()
            return False





def insert_into_rrf_table(df_rrf: pd.DataFrame):
    try:
        conn = connect_to_retool()
        cursor = conn.cursor()

        columns = [
            "account", "rrf_id", "created_on", "required_by", "pos_title", 
            "role", "status", "tag_comments", "type", "project_name"
        ]

        # Create a clean copy
        df_clean = df_rrf.copy()

        # Add missing columns with None values
        for col in columns:
            if col not in df_clean.columns:
                df_clean[col] = None

        # Handle date columns
        date_columns = ["created_on", "required_by"]
        
        for col in date_columns:
            if col in df_clean.columns:
                df_clean[col] = pd.to_datetime(df_clean[col], errors="coerce")
                df_clean[col] = df_clean[col].apply(
                    lambda x: None if pd.isna(x) else x.to_pydatetime()
                )

        # Replace all nulls with None
        df_clean = df_clean.replace({pd.NaT: None, float("nan"): None})
        
        # One-step null handling - replace all nulls with None
        df_clean = df_clean.where(pd.notnull(df_clean), None)

        # Select required columns
        df_insert = df_clean[columns]

        # Convert to records and then to tuples
        records = df_insert.to_dict('records')
        data = [tuple(record[col] for col in columns) for record in records]

        placeholders = ", ".join(["%s"] * len(columns))
        sql = f"INSERT INTO rrf ({', '.join(columns)}) VALUES ({placeholders})"

        cursor.executemany(sql, data)
        conn.commit()

        print(f"Inserted {len(data)} records into RRF table")
        return True

    except Exception as e:
        print(f"Error inserting into RRF table: {e}")
        if 'conn' in locals() and conn:
            conn.rollback()
        return False
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            conn.close()




#function to clear data from rrf
def clear_rrf_table():
    try:
        conn = connect_to_retool()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM rrf;")
        conn.commit()
        cursor.close()
        conn.close()
        print("Cleared all data from rrf table.")
        return True
    except Exception as e:
        print(f"Error clearing rrf table: {e}")
        if 'conn' in locals():
            conn.rollback()
            cursor.close()
            conn.close()
            return False
        


def sync_bench_from_powerbi(df: pd.DataFrame):
    """
    Clears and repopulates the bench table from a Power BI dataframe.
    Filters rows where allocation_status == 'BB'.
    """
    try:
        bench_columns = [
            "vamid", "name", "joining_date", "grade", "tsc", "account",
            "project", "allocation_status", "allocation_start_date",
            "allocation_end_date", "first_level_manager", "designation",
            "email", "sub_dept", "relieving_date", "resigned_on",
            "resignation_status", "second_level_manager", "currentskill",
            "primary_skill", "vam_exp", "total_exp", "accountsummary",
            "resourcing_unit", "workspace", "bench_days_assigned",
            "secondary_skill", "third_skill"
        ]
        # Map Power BI column names to bench column names
        column_map = {
            # normalized PowerBI prefixed names → bench column names
            # (after .str.strip('_') applied in main.py)
            "derived_allocations_vamid": "vamid",
            "derived_allocations_name": "name",
            "derived_allocations_vamexp": "vam_exp",
            "derived_allocations_grade_description": "grade",
            "tsc_description": "tsc",
            "derived_allocations_workspace": "workspace",
            "derived_allocations_account_history_summary": "accountsummary",
            "derived_allocations_currentskill_d": "currentskill",
            "skills_secondary_skill": "secondary_skill",
            "skills_third_skill": "third_skill",
            "sumtotal_exp": "total_exp",
            "sumstatusconcat_with_days_assigned_bb_modified": "bench_days_assigned",
            # fallback for non-prefixed names
            "current_skill": "currentskill",
            "account_summary": "accountsummary",
        }
        df_bench = df.rename(columns=column_map).copy()

        for col in bench_columns:
            if col not in df_bench.columns:
                df_bench[col] = None

        date_cols = ["joining_date", "allocation_start_date", "allocation_end_date",
                     "relieving_date", "resigned_on"]
        for col in date_cols:
            if col in df_bench.columns:
                df_bench[col] = pd.to_datetime(df_bench[col], errors="coerce")
                df_bench[col] = df_bench[col].apply(lambda x: None if pd.isna(x) else x.to_pydatetime())

        df_bench = df_bench.replace({pd.NaT: None, float("nan"): None})
        df_bench = df_bench.where(pd.notnull(df_bench), None)

        clear_bench_table()
        result = insert_into_bench_table(df_bench[bench_columns])
        return {"success": result, "total_rows": len(df_bench)}
    except Exception as e:
        print(f"Error in sync_bench_from_powerbi: {e}")
        return {"success": False, "error": str(e)}


def sync_associates_from_powerbi(df: pd.DataFrame):
    """
    Clears and repopulates associates_directory from a Power BI dataframe.
    Uses bulk insert for performance.
    """
    conn = None
    try:
        conn = connect_to_retool()
        cursor = conn.cursor()
        ensure_associates_table(cursor)
        cursor.execute("DELETE FROM associates_directory;")
        conn.commit()

        df_clean = df.copy()
        df_clean.columns = [_normalize_column_name(c) for c in df_clean.columns]

        # Map PowerBI normalized column names to associate fields
        col_map = {
            "derived_allocations_vamid": "vamid",
            "derived_allocations_name": "name",
            "derived_allocations_grade_description": "grade",
            "derived_allocations_currentskill_d": "skill",
            "derived_allocations_workspace": "workspace",
            "derived_allocations_account_history_summary": "account",
            "tsc_description": "tsc",
        }
        df_clean = df_clean.rename(columns=col_map)

        records = []
        for _, row in df_clean.iterrows():
            normalized = {k: (None if pd.isna(v) else str(v).strip()) for k, v in row.items()}
            vamid = normalized.get("vamid") or None
            name  = normalized.get("name") or None
            if not vamid and not name:
                continue
            records.append((
                vamid,
                name,
                None,                          # email
                normalized.get("account"),
                normalized.get("skill"),
                None,                          # primary_skill
                None,                          # secondary_skill
                normalized.get("grade"),
                None,                          # designation
                None,                          # manager
                Json({k: v for k, v in normalized.items()})
            ))

        if records:
            cursor.executemany(
                """
                INSERT INTO associates_directory
                    (vamid, name, email, account, skill, primary_skill,
                     secondary_skill, grade, designation, manager, raw_data)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (vamid) DO UPDATE SET
                    name        = EXCLUDED.name,
                    account     = EXCLUDED.account,
                    skill       = EXCLUDED.skill,
                    grade       = EXCLUDED.grade,
                    raw_data    = EXCLUDED.raw_data;
                """,
                records
            )
        conn.commit()
        cursor.close()
        conn.close()
        return {"inserted": len(records), "updated": 0, "skipped": len(df) - len(records), "total_rows": len(df)}
    except Exception as e:
        print(f"Error in sync_associates_from_powerbi: {e}")
        if conn:
            conn.rollback()
            conn.close()
        return {"success": False, "error": str(e)}


def get_allocated_candidates_db():
    try:
        conn = connect_to_retool()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM allocation_table;")
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        rows = [
            {
                "vamid": row[1],
                "name": row[2],
                "grade": row[3],
                "designation": row[4],
                "email": row[5],
                "account": row[6],
                "rrf_id": row[7],
                "pos_title": row[8],
                "role": row[9],
                "allocated_date": row[10]
            }
            for row in rows]
        

        return rows
    except Exception as e:
        print(f"Error fetching allocated candidates: {e}")
        return []


if __name__ == "__main__":
    # Only run this when the script is executed directly, not when imported
    get_candidates_db()
