import logging
import re
from bot_system.db.connection import get_db_connection
from bot_system.services.old_csv_checker import is_code_in_old_csv

logger = logging.getLogger(__name__)

def backfill_old_csv_flags():
    """One-time / startup backfill script to mark existing DB submissions and scammers matching old CSV codes."""
    conn = get_db_connection()
    updated_sub = 0
    updated_scam = 0
    try:
        with conn.cursor() as cursor:
            # 1. Backfill Submissions
            cursor.execute("SELECT id, gift_card_code FROM submissions WHERE in_old_db = 0 OR in_old_db IS NULL")
            subs = cursor.fetchall()
            for r in subs:
                codes = [c.strip() for c in re.split(r'[\n,\s;]+', str(r.get("gift_card_code") or "")) if c.strip()]
                if any(is_code_in_old_csv(c) for c in codes):
                    cursor.execute("UPDATE submissions SET in_old_db = 1 WHERE id = %s", (r["id"],))
                    updated_sub += 1

            # 2. Backfill Scammers
            cursor.execute("SELECT id, flagged_code FROM scammers WHERE in_old_db = 0 OR in_old_db IS NULL")
            scams = cursor.fetchall()
            for r in scams:
                codes = [c.strip() for c in re.split(r'[\n,\s;]+', str(r.get("flagged_code") or "")) if c.strip()]
                if any(is_code_in_old_csv(c) for c in codes):
                    cursor.execute("UPDATE scammers SET in_old_db = 1 WHERE id = %s", (r["id"],))
                    updated_scam += 1

        logger.info(f"Backfill finished: {updated_sub} submissions and {updated_scam} scammers marked in_old_db = 1.")
    except Exception as e:
        logger.error(f"Error running backfill: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    backfill_old_csv_flags()
