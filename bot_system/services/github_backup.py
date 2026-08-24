import os
import json
import base64
import logging
import datetime
import urllib.request
import urllib.error
from bot_system.config import GH_PAT, GH_REPO
from bot_system.db.connection import get_db_connection

logger = logging.getLogger(__name__)

def json_serializer(obj):
    if isinstance(obj, (datetime.datetime, datetime.date)):
        return obj.isoformat()
    if hasattr(obj, '__str__'):
        return str(obj)
    raise TypeError(f"Type {type(obj)} not serializable")

def get_current_ist_time():
    """Returns current date & time in Indian Standard Time (UTC+5:30)."""
    utc_now = datetime.datetime.now(datetime.timezone.utc)
    ist_tz = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
    return utc_now.astimezone(ist_tz)

def upload_file_to_github(repo: str, path: str, content_str: str, commit_message: str, token: str) -> bool:
    """Uploads or updates a file in GitHub private repository using GitHub REST API."""
    if not token:
        logger.error("GitHub Personal Access Token (gh) is missing.")
        return False

    url = f"https://api.github.com/repos/{repo}/contents/{path}"
    encoded_content = base64.b64encode(content_str.encode('utf-8')).decode('utf-8')
    
    payload = {
        "message": commit_message,
        "content": encoded_content
    }

    # Check if file already exists to get its sha (if updating)
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "GCVX-Backup-Bot",
        "X-GitHub-Api-Version": "2022-11-28"
    }

    try:
        check_req = urllib.request.Request(url, headers=headers, method="GET")
        with urllib.request.urlopen(check_req) as response:
            if response.status == 200:
                existing_data = json.loads(response.read().decode('utf-8'))
                payload["sha"] = existing_data.get("sha")
    except urllib.error.HTTPError as e:
        if e.code != 404:
            logger.warning(f"Unexpected error checking existing file on GitHub: {e}")

    req_data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=req_data, headers=headers, method="PUT")

    try:
        with urllib.request.urlopen(req) as response:
            if response.status in (200, 201):
                logger.info(f"Successfully uploaded {path} to GitHub repo {repo}")
                return True
            else:
                logger.error(f"Failed to upload {path}: Status {response.status}")
                return False
    except Exception as e:
        logger.error(f"Error uploading {path} to GitHub: {e}")
        return False

def perform_github_backup() -> dict:
    """
    Dumps submissions, scammers, and app_config tables and uploads them to
    GitHub private repository (na0911830-spec/gcvx_backup) under a timestamped folder.
    """
    now_ist = get_current_ist_time()
    timestamp_folder = now_ist.strftime("%Y-%m-%d_%H-%M-%S")
    date_str = now_ist.strftime("%Y-%m-%d %H:%M:%S IST")
    
    logger.info(f"Starting GitHub database backup at {date_str}...")
    
    tables_to_backup = ["submissions", "scammers", "app_config"]
    backup_summary = {}

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            for table in tables_to_backup:
                try:
                    cursor.execute(f"SELECT * FROM `{table}`;")
                    rows = cursor.fetchall()
                    backup_summary[table] = len(rows)
                    
                    json_data = json.dumps(rows, indent=2, default=json_serializer)
                    github_path = f"backups/{timestamp_folder}/{table}.json"
                    commit_msg = f"Automated Backup: {table} ({len(rows)} records) at {date_str}"
                    
                    upload_file_to_github(
                        repo=GH_REPO,
                        path=github_path,
                        content_str=json_data,
                        commit_message=commit_msg,
                        token=GH_PAT
                    )
                except Exception as tbl_err:
                    logger.error(f"Error dumping table '{table}': {tbl_err}")
                    backup_summary[table] = f"Error: {tbl_err}"
            
            # Upload summary file
            summary_info = {
                "timestamp_ist": date_str,
                "folder": timestamp_folder,
                "tables": backup_summary
            }
            summary_json = json.dumps(summary_info, indent=2)
            upload_file_to_github(
                repo=GH_REPO,
                path=f"backups/{timestamp_folder}/summary.json",
                content_str=summary_json,
                commit_message=f"Automated Backup Summary at {date_str}",
                token=GH_PAT
            )
            
            logger.info(f"GitHub backup completed for folder backups/{timestamp_folder}")
            return summary_info
    finally:
        conn.close()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    perform_github_backup()
