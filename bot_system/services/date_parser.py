import re
from datetime import datetime, timezone, timedelta

IST_TZ = timezone(timedelta(hours=5, minutes=30))

def get_current_ist_time() -> datetime:
    """Returns exact current Indian Standard Time (IST)."""
    return datetime.now(IST_TZ)

def parse_custom_date_string(date_str: str) -> str:
    """
    Parses flexible user date string inputs (e.g. '05/08/24', '05-08-2024', '5 August', '5 Aug 2024').
    If a custom date is provided without a time, appends the current IST time.
    If date_str is empty or invalid, returns None (allowing default NOW()).
    """
    if not date_str or not str(date_str).strip():
        return None

    raw = str(date_str).strip()
    # Strip common prefix labels like 'date - ', 'date:', 'Date : '
    raw = re.sub(r'^(?:date|dt|time|tareekh)\s*[-:]*\s*', '', raw, flags=re.IGNORECASE).strip()

    now_ist = get_current_ist_time()
    cur_year = now_ist.year

    # Check if time is already present in raw string (e.g., '14:30' or '02:30 PM')
    has_time = bool(re.search(r'\b\d{1,2}:\d{2}', raw))

    # Supported date formats
    formats_with_year = [
        "%d/%m/%Y %H:%M", "%d/%m/%Y %H:%M:%S",
        "%d/%m/%y %H:%M", "%d/%m/%y %H:%M:%S",
        "%d-%m-%Y %H:%M", "%d-%m-%Y %H:%M:%S",
        "%d-%m-%y %H:%M", "%d-%m-%y %H:%M:%S",
        "%d %B %Y %H:%M", "%d %b %Y %H:%M",
        "%d/%m/%Y", "%d/%m/%y",
        "%d-%m-%Y", "%d-%m-%y",
        "%d.%m.%Y", "%d.%m.%y",
        "%Y-%m-%d", "%Y/%m/%d",
        "%d %B %Y", "%d %b %Y",
        "%d %B %y", "%d %b %y"
    ]

    formats_without_year = [
        "%d/%m", "%d-%m", "%d.%m",
        "%d %B", "%d %b"
    ]

    # Try parsing date-only or date-time strings
    for fmt in formats_with_year:
        try:
            dt = datetime.strptime(raw, fmt)
            if not has_time:
                # Append current IST time if time was not provided
                dt = dt.replace(hour=now_ist.hour, minute=now_ist.minute, second=now_ist.second)
            return dt.strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            pass

    for fmt in formats_without_year:
        try:
            dt = datetime.strptime(raw, fmt)
            dt = dt.replace(year=cur_year, hour=now_ist.hour, minute=now_ist.minute, second=now_ist.second)
            return dt.strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            pass

    # Try regex match fallback if date is embedded inside text (e.g., 'date - 01/08/26')
    date_match = re.search(r'\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b', raw)
    if date_match:
        day, month, yr = date_match.groups()
        if len(yr) == 2:
            yr = "20" + yr
        try:
            dt = datetime(int(yr), int(month), int(day), hour=now_ist.hour, minute=now_ist.minute, second=now_ist.second)
            return dt.strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            pass

    # Try dateutil parsing fallback
    try:
        from dateutil import parser
        parsed_dt = parser.parse(raw, dayfirst=True)
        if not has_time:
            parsed_dt = parsed_dt.replace(hour=now_ist.hour, minute=now_ist.minute, second=now_ist.second)
        return parsed_dt.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        logger.warning(f"Could not parse custom date string: '{date_str}'")
        return None
