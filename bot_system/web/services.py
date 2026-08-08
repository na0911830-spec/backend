import io
import pandas as pd
from datetime import datetime, timedelta
from bot_system.db.connection import get_db_connection

def get_dashboard_metrics():
    """Requirement 5: Dashboard metrics (Today's count, payout due totals for 6-day & 1-day, unique UPI count). Any status except 'paid' and 'rejected' is considered due."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # 1. Today's incoming codes count & list
            cursor.execute("""
                SELECT id, phone_number, gift_card_name, gift_card_code, payment_details, total_amount, status, created_at
                FROM submissions 
                WHERE DATE(created_at) = CURRENT_DATE()
                ORDER BY created_at DESC
            """)
            today_list = list(cursor.fetchall())
            for t in today_list:
                t["created_at_str"] = t["created_at"].strftime("%H:%M")
            today_codes = len(today_list)

            # 2. Payout Due Totals (status != 'paid' AND status != 'rejected')
            cursor.execute("""
                SELECT 
                    SUM(CASE WHEN payout_term_days = 6 THEN total_amount ELSE 0 END) as term_6_total,
                    SUM(CASE WHEN payout_term_days = 1 THEN total_amount ELSE 0 END) as term_1_total,
                    SUM(total_amount) as total_payout,
                    COUNT(DISTINCT payment_details) as unique_upis,
                    COUNT(DISTINCT phone_number) as unique_suppliers
                FROM submissions 
                WHERE status NOT IN ('paid', 'rejected')
            """)
            payouts = cursor.fetchone()

            # 3. Code Status Summary
            cursor.execute("""
                SELECT 
                    SUM(CASE WHEN status NOT IN ('paid', 'rejected') THEN 1 ELSE 0 END) as total_unpaid,
                    SUM(CASE WHEN status = 'listed' THEN 1 ELSE 0 END) as total_listed,
                    SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as total_sold
                FROM submissions
            """)
            status_summary = cursor.fetchone()

            return {
                "today_codes": today_codes,
                "today_list": today_list,
                "term_6_total": float(payouts["term_6_total"] or 0),
                "term_1_total": float(payouts["term_1_total"] or 0),
                "total_payout": float(payouts["total_payout"] or 0),
                "unique_upis": payouts["unique_upis"] or 0,
                "unique_suppliers": payouts["unique_suppliers"] or 0,
                "total_unpaid": status_summary["total_unpaid"] or 0,
                "total_listed": status_summary["total_listed"] or 0,
                "total_sold": status_summary["total_sold"] or 0,
            }
    finally:
        conn.close()

from bot_system.services.old_csv_checker import is_code_in_old_csv

def get_codes_inventory():
    """Requirement 3.0, 3.1 & 6: Codes inventory combining submissions and blacklisted scammers with RED highlighting and DB stored Old CSV flag."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # 1. Fetch Submissions
            cursor.execute("""
                SELECT id, phone_number, gift_card_name, gift_card_code, payment_details,
                       total_amount, COALESCE(currency, 'Rs.') as currency, status, COALESCE(c_status, 'ununsold') as c_status, payout_term_days, card_type, platform, slot, order_id, created_at,
                       TIMESTAMPDIFF(HOUR, created_at, NOW()) as age_hours, 0 as is_scammer, '' as scam_reason, COALESCE(in_old_db, 0) as in_old_db
                FROM submissions
            """)
            submissions = list(cursor.fetchall())
            for r in submissions:
                r["row_source"] = "submission"

            # 2. Fetch Scammers & Duplicate Blacklist Records
            cursor.execute("""
                SELECT id, phone_number, COALESCE(gift_card_name, 'FLAGGED / DUPLICATE') as gift_card_name, flagged_code as gift_card_code,
                       payment_details, COALESCE(total_amount, 0.00) as total_amount, 'Rs.' as currency, COALESCE(status, 'flagged') as status, COALESCE(c_status, 'ununsold') as c_status, created_at,
                       0 as age_hours, 1 as is_scammer, reason as scam_reason,
                       COALESCE(platform, 'test1') as platform, COALESCE(slot, 'test1') as slot, COALESCE(order_id, '') as order_id, COALESCE(in_old_db, 0) as in_old_db
                FROM scammers
            """)
            scammers = list(cursor.fetchall())
            for r in scammers:
                r["row_source"] = "scammer"

            all_records = submissions + scammers
            all_records.sort(key=lambda x: x["created_at"], reverse=True)

            for r in all_records:
                r["created_at_str"] = r["created_at"].strftime("%Y-%m-%d %H:%M")
                r["created_at_iso"] = r["created_at"].isoformat()
                
                # If in_old_db not already flagged in DB, fallback to quick CSV set lookup
                if not r.get("in_old_db"):
                    codes = [c.strip() for c in str(r.get("gift_card_code") or "").split(",") if c.strip()]
                    if any(is_code_in_old_csv(c) for c in codes):
                        r["in_old_db"] = 1
                else:
                    r["in_old_db"] = int(r["in_old_db"])

                # Check if card_type explicitly set to OLD in message, otherwise check age
                card_t = str(r.get("card_type") or "").upper()
                if card_t == "OLD":
                    r["is_new"] = 0
                elif card_t == "NEW":
                    r["is_new"] = 1
                else:
                    r["is_new"] = 1 if r["age_hours"] < 24 else 0
                if r["is_scammer"]:
                    r["aging_alert"] = "SCAMMER_RED"
                elif r["age_hours"] >= 24 and r["status"] != "sold":
                    r["aging_alert"] = "RED" if r["age_hours"] >= 48 else "YELLOW"
                else:
                    r["aging_alert"] = "NORMAL"
            return all_records
    finally:
        conn.close()

import json

def get_app_config():
    """Fetch current dynamic config for platforms and slots from DB."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT config_key, config_value FROM app_config")
            rows = cursor.fetchall()
            config = {"platforms": ["test1", "test2", "test3"], "slots": ["test1", "test2", "test3"]}
            for row in rows:
                key = row["config_key"]
                val = row["config_value"]
                if isinstance(val, str):
                    try: val = json.loads(val)
                    except: pass
                if key in config and isinstance(val, list):
                    config[key] = val
            return config
    finally:
        conn.close()

def update_app_config(key: str, items: list):
    """Save updated platform or slot options list to DB."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            json_val = json.dumps(items)
            cursor.execute("""
                INSERT INTO app_config (config_key, config_value)
                VALUES (%s, %s)
                ON DUPLICATE KEY UPDATE config_value = %s
            """, (key, json_val, json_val))
            return True
    finally:
        conn.close()

def get_scammers_list():
    """Requirement 3.1: Duplicate cards & rejected scammer accounts blacklist."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM scammers ORDER BY created_at DESC")
            records = cursor.fetchall()
            for r in records:
                r["created_at_str"] = r["created_at"].strftime("%Y-%m-%d %H:%M")
            return records
    finally:
        conn.close()

def export_payout_excel(days_offset: int = 6):
    """Requirement 4: Export payout Excel/CSV with supplier UPI ID, total amount, and date filtering."""
    conn = get_db_connection()
    try:
        target_date = (datetime.now() - timedelta(days=days_offset)).strftime("%Y-%m-%d")
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT 
                    payment_details AS 'Supplier UPI ID',
                    phone_number AS 'Phone Number',
                    COUNT(*) AS 'Total Codes Submitted',
                    SUM(total_amount) AS 'Total Amount Due (₹)',
                    MIN(created_at) AS 'First Submission Date',
                    MAX(created_at) AS 'Latest Submission Date'
                FROM submissions
                WHERE status NOT IN ('paid', 'rejected')
                AND DATE(created_at) <= %s
                GROUP BY payment_details, phone_number
                ORDER BY SUM(total_amount) DESC
            """, (target_date,))
            rows = cursor.fetchall()

        df = pd.DataFrame(rows)
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name=f'Payout_Due_{target_date}')
        output.seek(0)
        return output
    finally:
        conn.close()

def get_submission_full_details(submission_id: int):
    """Fetch complete raw and parsed audit details of a submission."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM submissions WHERE id = %s", (submission_id,))
            res = cursor.fetchone()
            if res:
                res["created_at_str"] = res["created_at"].strftime("%Y-%m-%d %H:%M:%S")
                res["updated_at_str"] = res["updated_at"].strftime("%Y-%m-%d %H:%M:%S")
                res["row_source"] = "submission"
            return res
    finally:
        conn.close()

def get_scammer_full_details(scammer_id: int):
    """Fetch full details of a scammer record."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM scammers WHERE id = %s", (scammer_id,))
            res = cursor.fetchone()
            if res:
                res["created_at_str"] = res["created_at"].strftime("%Y-%m-%d %H:%M:%S")
                res["gift_card_name"] = "FLAGGED / DUPLICATE"
                res["gift_card_code"] = res.get("flagged_code") or "—"
                res["total_amount"] = 0
                res["payout_term_days"] = None
                res["raw_message"] = res.get("reason") or "—"
                res["status"] = res.get("status") or "flagged"
                res["row_source"] = "scammer"
            return res
    finally:
        conn.close()


def reset_database():
    """Danger Zone: Clears all tables (TRUNCATE submissions & scammers)."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("TRUNCATE TABLE submissions;")
            cursor.execute("TRUNCATE TABLE scammers;")
            return {"success": True, "message": "All database tables cleared completely!"}
    finally:
        conn.close()
