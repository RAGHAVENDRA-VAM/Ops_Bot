from fastapi import FastAPI, HTTPException, File, UploadFile, Header, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from database import (connect_to_retool,
                      get_candidates_db,
                      get_allocated_resources_db,
                      get_dashboard,
                      get_rrf_details,
                      update_associate_status,
                      update_rrf_status,
                      insert_into_allocation_table,
                      insert_into_bench_table,
                      insert_into_rrf_table,
                      clear_bench_table,
                      clear_rrf_table,
                      get_rrf_by_id,
                      get_allocated_candidates_db,
                      get_associates_db,
                      insert_new_associates,
                      sync_bench_from_powerbi,
                      sync_associates_from_powerbi)
import pandas as pd
from google import genai
import os
import json
from typing import Dict, Any, Optional, List
import io
from datetime import datetime, timedelta

# from openai import AzureOpenAI



app = FastAPI()


# Configure Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("Warning: GEMINI_API_KEY environment variable not set")
    gemini_client = None
else:
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:5173,http://127.0.0.1:5173,"
        "https://ops-bot-backend.onrender.com"
    ).split(",")
    if origin.strip()
]

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def call_gemini_api(df1: pd.DataFrame, df2: pd.DataFrame) -> Dict[str, Any]:
    """
    Call Gemini API to get AI-powered matching between candidates and job requirements.
    
    Args:
        df1: DataFrame with candidate details (vamid, grade, designation, primary skill, secondary skill)
        df2: DataFrame with RRF details (rrf_id, pos_title, role, account)
        
    Returns:
        Dict containing AI analysis and matching recommendations
    """
    try:
        if not GEMINI_API_KEY or not gemini_client:
            return {"error": "Gemini API key not configured"}
        
        # Convert DataFrames to JSON for better API consumption
        candidates_data = df1.to_json(orient='records', indent=2)
        rrf_data = df2.to_json(orient='records', indent=2)
        
        # Create the prompt for Gemini
        prompt = f"""
        You are an HR AI assistant specializing in candidate-to-role matching. 
        
        Given the following candidate data and role requirements, provide detailed matching analysis:
        
        CANDIDATES DATA:
        {candidates_data}
        
        ROLE REQUIREMENTS DATA:
        {rrf_data}
        
        Please analyze and provide:
        1. Top 3 candidate matches for each role requirement
        2. Matching score (0-100) for each candidate-role pair
        3. Reasoning for each match (A single line: skills alignment, experience level, etc.)
        4. Potential skill gaps and recommendations (A single line)
        5. Alternative role suggestions for candidates if primary matches are not ideal
        
        Format the response as a structured JSON with the following structure:
        {{
            "matches": [
                {{
                    "rrf_id": "string",
                    "pos_title": "string",
                    "account": "string",
                    "recommended_candidates": [
                        {{
                            "vamid": "string",
                            "match_score": number,
                            "reasoning": "string",
                            "skill_alignment": "string",
                            "potential_gaps": ["string"]
                        }}
                    ]
                }}
            ],
        }}
        """
        
        # Generate response using new SDK
        response = gemini_client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt
        )
        
        # Parse the response
        try:
            # Try to extract JSON from the response
            response_text = response.text
            
            # Find JSON content (sometimes Gemini wraps JSON in markdown)
            if "```json" in response_text:
                json_start = response_text.find("```json") + 7
                json_end = response_text.find("```", json_start)
                json_content = response_text[json_start:json_end].strip()
            else:
                json_content = response_text
            
            parsed_response = json.loads(json_content)
            
            return {
                "success": True,
                "gemini_analysis": parsed_response,
                # "raw_response": response_text
            }
            
        except json.JSONDecodeError:
            # If JSON parsing fails, return the raw text
            return {
                "success": True,
                "gemini_analysis": {"raw_analysis": response.text},
                "raw_response": response.text,
                "note": "Response was not in JSON format"
            }
            
    except Exception as e:
        print(f"Error calling Gemini API: {e}")
        return {
            "success": False,
            "error": f"Failed to call Gemini API: {str(e)}"
        }


def _prepare_matching_frames(df1: pd.DataFrame, df2: pd.DataFrame):
    df1 = df1.copy()
    df2 = df2.copy()
    if "current_skill" not in df1.columns:
        df1["current_skill"] = None
    if "primary_skill" not in df1.columns:
        df1["primary_skill"] = df1.get("current_skill")
    for column in ["rrf_id", "pos_title", "role", "account"]:
        if column not in df2.columns:
            df2[column] = None
    return df1, df2


def _build_match_download_workbook(matches: List[Dict[str, Any]]) -> io.BytesIO:
    rows = []
    for match in matches:
        rrf = match.get("rrf") or match.get("rrf_details") or {}
        candidates = match.get("candidates") or match.get("recommended_candidates") or []
        if not candidates:
            rows.append({
                "rrf_id": rrf.get("rrf_id"),
                "pos_title": rrf.get("pos_title"),
                "account": rrf.get("account"),
                "candidate_vamid": None,
                "candidate_name": None,
                "match_score": None,
                "reasoning": None,
                "skill_alignment": None,
                "potential_gaps": None,
            })
            continue

        for candidate in candidates:
            employee = candidate.get("employee_details") or {}
            rows.append({
                "rrf_id": rrf.get("rrf_id"),
                "pos_title": rrf.get("pos_title"),
                "account": rrf.get("account"),
                "candidate_vamid": candidate.get("vamid"),
                "candidate_name": employee.get("name") or candidate.get("name"),
                "match_score": candidate.get("match_score") or candidate.get("score"),
                "reasoning": candidate.get("reasoning"),
                "skill_alignment": candidate.get("skill_alignment"),
                "potential_gaps": ", ".join(candidate.get("potential_gaps", [])) if isinstance(candidate.get("potential_gaps"), list) else candidate.get("potential_gaps"),
            })

    df = pd.DataFrame(rows)
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Matches")
    buffer.seek(0)
    return buffer


def _history_rows(limit: int):
    conn = None
    cursor = None
    try:
        conn = connect_to_retool()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT allocated_date, rrf_id, vamid, name, designation, account, pos_title, role
            FROM allocation_table
            ORDER BY allocated_date DESC NULLS LAST
            LIMIT %s;
            """,
            (limit,)
        )
        rows = cursor.fetchall()
        return [
            {
                "date": row[0].isoformat() if row[0] else None,
                "action": f"Allocation completed for RRF {row[1]}",
                "details": " | ".join(filter(None, [
                    f"VAM ID: {row[2]}",
                    f"Name: {row[3]}",
                    f"Designation: {row[4]}",
                    f"Account: {row[5]}",
                    f"Position: {row[6]}",
                    f"Role: {row[7]}",
                ]))
            }
            for row in rows
        ]
    except Exception as e:
        print(f"Error retrieving upload history: {e}")
        return []
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def _trends_summary(days: int):
    conn = None
    cursor = None
    try:
        conn = connect_to_retool()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM allocation_table WHERE allocated_date >= %s;", (datetime.now() - timedelta(days=days),))
        total_matches = cursor.fetchone()[0] or 0
        cursor.execute("SELECT COUNT(DISTINCT rrf_id) FROM allocation_table WHERE allocated_date >= %s;", (datetime.now() - timedelta(days=days),))
        unique_rrfs_matched = cursor.fetchone()[0] or 0
        current = get_dashboard()
        return {
            "current": {
                "rrfCount": current.get("rrf_count", 0),
                "benchCount": current.get("bench_count", 0),
            },
            "matching": {
                "unique_rrfs_matched": unique_rrfs_matched,
                "total_matches": total_matches,
                "avg_match_score": None,
            },
            "window_days": days,
        }
    except Exception as e:
        print(f"Error building trends summary: {e}")
        return {
            "current": {"rrfCount": 0, "benchCount": 0},
            "matching": {"unique_rrfs_matched": 0, "total_matches": 0, "avg_match_score": None},
            "window_days": days,
            "error": str(e),
        }
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@app.post("/admin/migrate")
def run_migration(x_api_key: Optional[str] = Header(None)):
    api_key = os.getenv("X_API_KEY")
    if api_key and x_api_key != api_key:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        conn = connect_to_retool()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'bench' AND column_name = 'bench_days_assigned';
        """)
        exists = cursor.fetchone()
        if exists:
            cursor.close()
            conn.close()
            return {"message": "Column 'bench_days_assigned' already exists. Nothing to do."}
        cursor.execute("ALTER TABLE bench ADD COLUMN bench_days_assigned INTEGER;")
        conn.commit()
        cursor.close()
        conn.close()
        return {"message": "Migration successful: added 'bench_days_assigned' to bench table."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/candidates")
async def get_candidates():
    bench = get_candidates_db()
    allocated = get_allocated_resources_db()
    return {
        "bench_candidates": bench,
        "allocated_resources": allocated,
        "bench_count": len(bench),
        "allocated_count": len(allocated)
    }


@app.get("/dashboard")
async def get_dashboard_data():
    value = get_dashboard()
    return {"value": value}


@app.get("/rrf")
def get_rrf():
    rrf = get_rrf_details()
    return {"rrf": rrf}

@app.get("/grade_count")
def get_grade_count():
    bench = get_candidates_db()
    df_bench = pd.DataFrame(bench)
    grade_count = df_bench['grade'].value_counts().to_dict()
    return {"grade_count": grade_count}
    # return grade_count

@app.get("/trends")
def get_trends():
    rrf_details = get_rrf_details()
    df_rrf = pd.DataFrame(rrf_details)
    # Convert created_on to tz-aware UTC
    df_rrf['created_on'] = pd.to_datetime(
        df_rrf['created_on'],
        errors='coerce',
        utc=True
    )
    # Use tz-aware "now" in UTC
    now_utc = pd.Timestamp.now(tz='UTC')
    # Calculate ageing in days
    df_rrf['ageing'] = (now_utc - df_rrf['created_on']).dt.days
    df_rrf_dict = df_rrf.to_dict(orient='records')
    return {"trends": df_rrf_dict}


@app.get("/upload-history")
def get_upload_history(limit: int = 20):
    history = _history_rows(limit)
    return {"history": history, "limit": limit}


@app.get("/trends/summary")
def get_trends_summary(days: int = 30):
    return _trends_summary(days)


@app.post("/download-matches")
def download_matches(payload: dict):
    matches = payload.get("matches")
    if not isinstance(matches, list) or not matches:
        raise HTTPException(status_code=400, detail="'matches' must be a non-empty list")

    buffer = _build_match_download_workbook(matches)
    filename = f"rrf_matching_results_{datetime.now().strftime('%Y-%m-%d')}.xlsx"
    headers = {"Content-Disposition": f"attachment; filename={filename}"}
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )


@app.get("/get_allocated_candidates")
def get_allocated_candidates():
    allocated_candidates = get_allocated_candidates_db()
    return {"allocated_candidates": allocated_candidates}


@app.get("/associates")
def get_associates():
    associates = get_associates_db()
    accounts = sorted({item.get("account") for item in associates if item.get("account")})
    skills = sorted({
        item.get("skill") or item.get("primary_skill")
        for item in associates
        if item.get("skill") or item.get("primary_skill")
    })
    return {
        "associates": associates,
        "summary": {
            "total_associates": len(associates),
            "total_accounts": len(accounts),
            "total_skills": len(skills)
        },
        "filters": {
            "accounts": accounts,
            "skills": skills
        }
    }


@app.post("/associates/upload")
async def upload_associates_file(associates_file: UploadFile = File(...)):
    try:
        if not associates_file or not associates_file.filename:
            raise HTTPException(status_code=400, detail="Associates file is required")

        if not associates_file.filename.endswith(('.xlsx', '.xls')):
            raise HTTPException(
                status_code=400,
                detail="Associates file must be an Excel file (.xlsx or .xls)"
            )

        file_content = await associates_file.read()
        df_associates = pd.read_excel(io.BytesIO(file_content), header=None)
        result = insert_new_associates(df_associates)

        if result.get("error"):
            raise HTTPException(status_code=500, detail=result["error"])

        return {
            "success": True,
            "message": "Associates file processed successfully",
            "filename": associates_file.filename,
            "inserted": result.get("inserted", 0),
            "updated": result.get("updated", 0),
            "skipped": result.get("skipped", 0),
            "total_rows": result.get("total_rows", 0)
        }
    except HTTPException:
        raise
    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="Uploaded file is empty or corrupted")
    except Exception as e:
        print(f"Error processing associates file: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing associates file: {str(e)}")


@app.post("/sync/powerbi")
async def sync_powerbi(payload: dict, background_tasks: BackgroundTasks, x_api_key: Optional[str] = Header(None)):
    api_key = os.getenv("X_API_KEY")
    if api_key and x_api_key != api_key:
        raise HTTPException(status_code=401, detail="Unauthorized")

    rows = payload.get("rows")
    if not rows or not isinstance(rows, list):
        raise HTTPException(status_code=400, detail="'rows' must be a non-empty list")

    df = pd.DataFrame(rows)
    df.columns = (
        df.columns.str.strip().str.lower()
        .str.replace(r'[^a-z0-9]+', '_', regex=True)
        .str.strip('_')
    )

    def run_sync(dataframe: pd.DataFrame):
        try:
            bench_result = sync_bench_from_powerbi(dataframe)
            associates_result = sync_associates_from_powerbi(dataframe)
            print(f"[sync/powerbi] bench={bench_result} associates={associates_result}")
        except Exception as e:
            print(f"[sync/powerbi] background sync error: {e}")

    background_tasks.add_task(run_sync, df)

    return {
        "success": True,
        "message": f"Sync started for {len(rows)} rows in background",
        "total_rows": len(rows)
    }


@app.get("/get_all_details")
def get_all_details():
    bench_details = get_candidates_db()
    rrf_details = get_rrf_details()
    return {"bench_details": bench_details, "rrf_details": rrf_details}

@app.post("/update_position/{rrf_id}/{vam_id}")
def update_position(rrf_id: str, vam_id: str):
    try:
        rrf_status=update_rrf_status(rrf_id)
        associate_status=update_associate_status(vam_id)

        if rrf_status and associate_status:
            insert_into_allocation_table(rrf_id, vam_id)
            return {"message": f"Position updated for RRF ID: {rrf_id} and VAM ID: {vam_id}"}
    except Exception as e:
        print(f"Error updating position: {e}")
    return {"message": f"Failed to update position for RRF ID: {rrf_id} and VAM ID: {vam_id}"}



@app.post("/upload-files")
async def upload_excel_files(
    bench_file: Optional[UploadFile] = File(None),
    rrf_file: Optional[UploadFile] = File(None)
):
    """
    Upload and process bench and/or RRF Excel files for AI-powered matching.
    """
    try:
        df_bench = None
        df_rrf = None
        response_files = {}

        # ---------- Bench File ----------
        if bench_file and bench_file.filename:  # Check both file exists and has filename
            if not bench_file.filename.endswith(('.xlsx', '.xls')):
                raise HTTPException(
                    status_code=400,
                    detail="Bench file must be an Excel file (.xlsx or .xls)"
                )

            bench_content = await bench_file.read()  # Use await here
            df_bench = pd.read_excel(io.BytesIO(bench_content))

            df_bench.columns = (
                df_bench.columns
                    .str.strip()
                    .str.lower()
                    .str.replace(r'[^a-z0-9]+', '_', regex=True)
            )
            bench_flag = clear_bench_table()
            if bench_flag:
                response = insert_into_bench_table(df_bench)
            response_files["bench_file"] = {
                "filename": bench_file.filename,
                "columns": df_bench.columns.tolist(),
                "insert_response": response
            }

        # ---------- RRF File ----------
        if rrf_file and rrf_file.filename:  # Check both file exists and has filename
            if not rrf_file.filename.endswith(('.xlsx', '.xls')):
                raise HTTPException(
                    status_code=400,
                    detail="RRF file must be an Excel file (.xlsx or .xls)"
                )

            rrf_content = await rrf_file.read()  # Use await here
            df_rrf = pd.read_excel(io.BytesIO(rrf_content))

            df_rrf.columns = (
                df_rrf.columns
                    .str.strip()
                    .str.lower()
                    .str.replace(r'[^a-z0-9]+', '_', regex=True)
            )
            rrf_flag = clear_rrf_table()
            if rrf_flag:
                response = insert_into_rrf_table(df_rrf)
            response_files["rrf_file"] = {
                "filename": rrf_file.filename,
                "insert_response": response
            }

        # ---------- No files uploaded ----------
        if not (bench_file and bench_file.filename) and not (rrf_file and rrf_file.filename):
            raise HTTPException(
                status_code=400,
                detail="At least one file (bench or rrf) must be uploaded"
            )

        return {
            "success": True,
            "message": "File(s) processed successfully",
            "file_info": response_files
        }

    except HTTPException:
        raise
    except pd.errors.EmptyDataError:
        raise HTTPException(
            status_code=400,
            detail="One or more uploaded files are empty or corrupted"
        )
    except Exception as e:
        print(f"Error processing uploaded files: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error processing files: {str(e)}"
        )



def find_matching_candidates(rrf_details):
    try:
        # Fetch data
        bench = get_candidates_db()

        # Create DataFrames
        df1 = pd.DataFrame(bench)
        df2 = pd.DataFrame(rrf_details, index=[0])
        df1, df2 = _prepare_matching_frames(df1, df2)

        # Minimal columns for Gemini
        df1_update = df1[['vamid', 'grade', 'designation', 'current_skill', 'primary_skill']]
        df2_update = df2[['rrf_id', 'pos_title', 'role', 'account']]

        # Call Gemini
        gemini_response = call_gemini_api(df1_update, df2_update)

        # Employee lookup by vamid
        employee_lookup = (
            df1
            .set_index("vamid")
            .to_dict(orient="index")
        )

        # Find the specific RRF match
        for match in gemini_response.get("gemini_analysis", {}).get("matches", []):
            if match.get("rrf_id") == rrf_details.get("rrf_id"):

                # Attach employee details to each recommended candidate
                enriched_candidates = []
                for candidate in match.get("recommended_candidates", []):
                    vamid = candidate.get("vamid")

                    enriched_candidates.append({
                        **candidate,
                        "employee_details": employee_lookup.get(vamid, {})
                    })

                match["recommended_candidates"] = enriched_candidates

                return {
                    "ai_matching": match
                }

    except Exception as e:
        print(f"Error in finding matching candidates: {e}")
        return {
            "error": "An error occurred while processing the request"
        }



@app.get("/matching")
def get_matching_candidates():
    try:
        # Fetch data
        bench = get_candidates_db()
        rrf = get_rrf_details()

        # Create DataFrames
        df1 = pd.DataFrame(bench)
        df2 = pd.DataFrame(rrf)
        df1, df2 = _prepare_matching_frames(df1, df2)

        # Minimal columns for Gemini
        df1_update = df1[['vamid', 'grade', 'designation', 'current_skill', 'primary_skill']]
        df2_update = df2[['rrf_id', 'pos_title', 'role', 'account']]

        # Call Gemini
        gemini_response = call_gemini_api(df1_update, df2_update)

        # Build employee lookup (vamid → full employee details)
        employee_lookup = (
            df1
            .set_index("vamid")
            .to_dict(orient="index")
        )

        # Build RRF lookup (rrf_id → full RRF details)
        rrf_lookup = (
            df2_update
            .set_index("rrf_id")
            .to_dict(orient="index")
        )

        # Enrich Gemini response
        for match in gemini_response.get("gemini_analysis", {}).get("matches", []):
            rrf_id = match.get("rrf_id")

            # Attach RRF details below rrf_id
            match["rrf_details"] = rrf_lookup.get(rrf_id)

            # Attach employee details for each candidate
            for candidate in match.get("recommended_candidates", []):
                vamid = candidate.get("vamid")
                candidate["employee_details"] = employee_lookup.get(vamid)

        return {
            "ai_matching": gemini_response
        }

    except Exception as e:
        print(f"Error in matching: {e}")
        return {
            "error": "An error occurred while processing the request"
        }

"""
    Working code
        """
# @app.get("/match_candidate/{rrf_id}")
# def get_candidate_for_rrf(rrf_id: str):
#     try:
#         rrf_details = get_rrf_by_id(rrf_id)
#         if not rrf_details:
#             return {
#                 "message": f"No matching candidates found for RRF ID: {rrf_id}"
#             }
#         # If RRF details are found, proceed to find matching candidates
#         matching_candidates = find_matching_candidates(rrf_details)
        
#         return {
#             "ai_matching": matching_candidates
#         }

#     except Exception as e:
#         print(f"Error in matching for RRF ID {rrf_id}: {e}")
#         return {
#             "error": "An error occurred while processing the request"
#         }


@app.get("/match_candidate/{rrf_ids}")
def get_candidate_for_multiple_rrfs(rrf_ids: str):
    """
    Get matching candidates for multiple RRF IDs.
    RRF IDs should be comma-separated in the URL.
    Example: /match_candidate/POS-17169,POS-17717,POS-17760
    """
    try:
        # Split the comma-separated RRF IDs
        rrf_id_list = [rrf_id.strip() for rrf_id in rrf_ids.split(',')]
        
        if not rrf_id_list or rrf_id_list == ['']:
            raise HTTPException(status_code=400, detail="No RRF IDs provided")
        
        results = []
        not_found_rrfs = []
        
        for rrf_id in rrf_id_list:
            try:
                rrf_details = get_rrf_by_id(rrf_id)
                if not rrf_details:
                    not_found_rrfs.append(rrf_id)
                    continue
                
                # Find matching candidates for this RRF
                matching_candidates = find_matching_candidates(rrf_details)
                
                results.append({
                    "rrf_id": rrf_id,
                    "rrf_details": rrf_details,
                    "matching_result": matching_candidates
                })
                
            except Exception as e:
                print(f"Error processing RRF ID {rrf_id}: {e}")
                results.append({
                    "rrf_id": rrf_id,
                    "error": f"Error processing RRF ID {rrf_id}: {str(e)}"
                })
        
        return {
            "success": True,
            "total_requested": len(rrf_id_list),
            "total_processed": len(results),
            "not_found_rrfs": not_found_rrfs,
            "results": results
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in matching for RRF IDs {rrf_ids}: {e}")
        raise HTTPException(
            status_code=500,
            detail="An error occurred while processing the request"
        )





# Serve React static files — must be after all API routes
build_dir = os.path.join(os.path.dirname(__file__), "frontend_build")

if os.path.exists(build_dir):
    app.mount("/static", StaticFiles(directory=os.path.join(build_dir, "static")), name="static")

    @app.get("/{full_path:path}")
    async def serve_react(full_path: str):
        index = os.path.join(build_dir, "index.html")
        if os.path.exists(index):
            return FileResponse(index)
        return {"message": "Frontend not built yet"}

# Run the application
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
