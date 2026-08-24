import time
import threading
import logging
import datetime
from bot_system.services.github_backup import perform_github_backup

logger = logging.getLogger(__name__)

# Target backup hours (in 24-hour IST format)
# 9 AM -> 9, 4 PM -> 16, 2 AM -> 2
TARGET_HOURS_IST = [2, 9, 16]

_scheduler_started = False
_scheduler_lock = threading.Lock()

def get_current_ist_time():
    """Returns current datetime in Indian Standard Time (UTC+5:30)."""
    utc_now = datetime.datetime.now(datetime.timezone.utc)
    ist_tz = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
    return utc_now.astimezone(ist_tz)

def _scheduler_loop():
    """
    Background loop checking current IST time against scheduled times:
    02:00 AM, 09:00 AM, and 04:00 PM (16:00) IST daily.
    """
    logger.info("Backup scheduler daemon loop initialized (Targets: 02:00 AM, 09:00 AM, 04:00 PM IST).")
    last_triggered_slot = None

    while True:
        try:
            now_ist = get_current_ist_time()
            current_hour = now_ist.hour
            current_minute = now_ist.minute
            today_str = now_ist.strftime("%Y-%m-%d")

            # Check if current time is within the top 5 minutes of any target hour
            if current_hour in TARGET_HOURS_IST and current_minute < 5:
                slot_id = f"{today_str}_{current_hour}"
                if last_triggered_slot != slot_id:
                    logger.info(f"Scheduled backup trigger for slot {slot_id} at {now_ist.strftime('%Y-%m-%d %H:%M:%S IST')}")
                    last_triggered_slot = slot_id
                    try:
                        perform_github_backup()
                    except Exception as e:
                        logger.error(f"Scheduled GitHub backup failed: {e}")
        except Exception as err:
            logger.error(f"Error in backup scheduler loop: {err}")

        time.sleep(30)

def start_backup_scheduler():
    """Starts the background backup scheduler thread once during application startup."""
    global _scheduler_started
    with _scheduler_lock:
        if not _scheduler_started:
            _scheduler_started = True
            thread = threading.Thread(target=_scheduler_loop, daemon=True, name="BackupSchedulerThread")
            thread.start()
            logger.info("Database 3x daily GitHub backup scheduler thread started.")
