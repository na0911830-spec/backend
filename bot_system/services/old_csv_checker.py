import os
import csv
import logging

logger = logging.getLogger(__name__)

OLD_CSV_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "Gift Card Sheet New - 1 , 2 May.csv")
_old_codes_set = None

def get_old_csv_codes() -> set:
    """Reads and caches unique GC codes from the old CSV file in memory."""
    global _old_codes_set
    if _old_codes_set is not None:
        return _old_codes_set

    _old_codes_set = set()
    if not os.path.exists(OLD_CSV_PATH):
        logger.warning(f"Old CSV file not found at: {OLD_CSV_PATH}")
        return _old_codes_set

    try:
        with open(OLD_CSV_PATH, mode='r', encoding='utf-8', errors='ignore') as f:
            reader = csv.reader(f)
            for row in reader:
                # Column index 4 contains the GC Code in 'Gift Card Sheet New - 1 , 2 May.csv'
                if len(row) > 4 and row[4]:
                    raw_code = str(row[4]).strip()
                    if len(raw_code) > 3 and raw_code.lower() != 'gc code':
                        _old_codes_set.add(raw_code)
                        # Also add normalized alphanumeric version for fuzzy matching
                        norm = "".join(c for c in raw_code.upper() if c.isalnum())
                        if len(norm) > 3:
                            _old_codes_set.add(norm)
        logger.info(f"Loaded {len(_old_codes_set)} old GC codes from CSV for instant lookup.")
    except Exception as e:
        logger.error(f"Error reading old CSV file: {e}")

    return _old_codes_set

def is_code_in_old_csv(code: str) -> bool:
    """Checks if a given gift card code exists in the old CSV dataset."""
    if not code:
        return False
    codes_set = get_old_csv_codes()
    clean = str(code).strip()
    if clean in codes_set:
        return True
    norm = "".join(c for c in clean.upper() if c.isalnum())
    if norm in codes_set:
        return True
    return False
