import re
import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)
IST_TZ = timezone(timedelta(hours=5, minutes=30))

def get_current_ist_time() -> datetime:
    """Returns exact current Indian Standard Time (IST)."""
    return datetime.now(IST_TZ)

def parse_custom_date_string(date_str: str) -> str:
    """
    Parses flexible user date string inputs (e.g. '1 aug 26', '1-aug-26', '1 aug 2026', '05/08/24', '05-08-2024', '5 August', '5th Aug 2026').
    If a custom date is provided without a time, appends the current IST time.
    If date_str is empty or invalid, returns None (allowing default NOW()).
    """
    if not date_str or not str(date_str).strip():
        return None

    raw = str(date_str).strip()
    # Strip common prefix labels like 'date - ', 'date:', 'Date : ', 'dt - ', 'dt : '
    raw = re.sub(r'^(?:date|dt|time|tareekh)\s*[-:]*\s*', '', raw, flags=re.IGNORECASE).strip()
    # Remove ordinal suffixes (1st, 2nd, 3rd, 4th, etc.)
    raw = re.sub(r'(\d+)(?:st|nd|rd|th)\b', r'\1', raw, flags=re.IGNORECASE)

    now_ist = get_current_ist_time()
    cur_year = now_ist.year

    # Check if time is already present in raw string (e.g., '14:30' or '02:30 PM')
    has_time = bool(re.search(r'\b\d{1,2}:\d{2}', raw))

    # Supported date formats
    formats_with_year = [
        "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M",
        "%Y/%m/%d %H:%M:%S", "%Y/%m/%d %H:%M",
        "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M",
        "%d/%m/%y %H:%M:%S", "%d/%m/%y %H:%M",
        "%d-%m-%Y %H:%M:%S", "%d-%m-%Y %H:%M",
        "%d-%m-%y %H:%M:%S", "%d-%m-%y %H:%M",
        "%d %B %Y %H:%M:%S", "%d %B %Y %H:%M",
        "%d %b %Y %H:%M:%S", "%d %b %Y %H:%M",
        "%d %B %y %H:%M:%S", "%d %B %y %H:%M",
        "%d %b %y %H:%M:%S", "%d %b %y %H:%M",
        "%d-%B-%Y %H:%M:%S", "%d-%B-%Y %H:%M",
        "%d-%b-%Y %H:%M:%S", "%d-%b-%Y %H:%M",
        "%d-%B-%y %H:%M:%S", "%d-%B-%y %H:%M",
        "%d-%b-%y %H:%M:%S", "%d-%b-%y %H:%M",
        "%d/%m/%Y", "%d/%m/%y",
        "%d-%m-%Y", "%d-%m-%y",
        "%d.%m.%Y", "%d.%m.%y",
        "%Y-%m-%d", "%Y/%m/%d",
        "%d %B %Y", "%d %b %Y",
        "%d %B %y", "%d %b %y",
        "%d-%B-%Y", "%d-%b-%Y",
        "%d-%B-%y", "%d-%b-%y",
        "%d/%B/%Y", "%d/%b/%Y",
        "%d/%B/%y", "%d/%b/%y",
        "%B %d, %Y", "%b %d, %Y",
        "%B %d %Y", "%b %d %Y",
        "%B %d, %y", "%b %d, %y",
        "%B %d %y", "%b %d %y"
    ]

    formats_without_year = [
        "%d/%m", "%d-%m", "%d.%m",
        "%d %B", "%d %b",
        "%d-%B", "%d-%b",
        "%B %d", "%b %d"
    ]

    # Try standard string parsing
    for fmt in formats_with_year:
        try:
            dt = datetime.strptime(raw, fmt)
            if not has_time:
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

    # Regex month name mapping (e.g. 1 aug 26, 01-aug-2026, 1st august 26, 15 sept 2025)
    month_names = {
        'jan': 1, 'january': 1, 'feb': 2, 'february': 2, 'mar': 3, 'march': 3,
        'apr': 4, 'april': 4, 'may': 5, 'jun': 6, 'june': 6,
        'jul': 7, 'july': 7, 'aug': 8, 'august': 8, 'sep': 9, 'sept': 9, 'september': 9,
        'oct': 10, 'october': 10, 'nov': 11, 'november': 11, 'dec': 12, 'december': 12
    }
    month_regex = r'(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
    
    # Check "1 aug 26", "1-aug-26", "1/aug/2026"
    m_name_match = re.search(r'\b(\d{1,2})[\s\-\/\.]+' + month_regex + r'(?:[\s\-\/\.]+(\d{2,4}))?\b', raw, re.IGNORECASE)
    if m_name_match:
        day_str, m_str, yr_str = m_name_match.group(1), m_name_match.group(2).lower(), m_name_match.group(3)
        m_int = month_names.get(m_str)
        if m_int:
            if not yr_str:
                yr_int = cur_year
            elif len(yr_str) == 2:
                yr_int = int("20" + yr_str)
            else:
                yr_int = int(yr_str)
            try:
                dt = datetime(yr_int, m_int, int(day_str), hour=now_ist.hour, minute=now_ist.minute, second=now_ist.second)
                return dt.strftime("%Y-%m-%d %H:%M:%S")
            except ValueError:
                pass

    # Check "aug 1 2026", "august 1, 26"
    m_name_match2 = re.search(r'\b' + month_regex + r'[\s\-\/\.]+(\d{1,2})(?:[\s\-\/\.,]+(\d{2,4}))?\b', raw, re.IGNORECASE)
    if m_name_match2:
        m_str, day_str, yr_str = m_name_match2.group(1).lower(), m_name_match2.group(2), m_name_match2.group(3)
        m_int = month_names.get(m_str)
        if m_int:
            if not yr_str:
                yr_int = cur_year
            elif len(yr_str) == 2:
                yr_int = int("20" + yr_str)
            else:
                yr_int = int(yr_str)
            try:
                dt = datetime(yr_int, m_int, int(day_str), hour=now_ist.hour, minute=now_ist.minute, second=now_ist.second)
                return dt.strftime("%Y-%m-%d %H:%M:%S")
            except ValueError:
                pass

    # Try numeric regex match fallback (e.g. '01/08/26', '1-8-26')
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
