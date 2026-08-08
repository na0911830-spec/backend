import re
import json
import logging
from bot_system.ai.cloudflare_ai import call_cloudflare_ai
from bot_system.db.connection import get_db_connection

logger = logging.getLogger(__name__)

EXTRACTION_SYSTEM_PROMPT = """You are an intelligent gift card data extraction assistant. Extract details from gift card submission messages in any format (structured with icons, line-by-line, multi-code lists, or informal text like 'Pvr gift card ... Pin:... Upi:...').

Return a JSON object with:
- "phone_number": 10-digit phone number (e.g., "8637747466"), or null if missing.
- "gift_card_name": Clean brand/name of the card (e.g., "PlayStation Rs.5000 Wallet Code", "PVR Gift Card"), or null.
- "gift_card_codes": List of string card codes extracted (e.g. ["QDC3-FBDR-PQ82"] or ["87JX-HG3C-K9MXC", "95MC-LCCF-JLTA"]). Always return a list!
- "payment_method": "UPI", "Bank", "USDT", etc., default to "UPI".
- "payment_details": UPI ID or payment detail (e.g. "8637747466@ibl", "8299062744@ptyes"), or null.
- "total_amount": Total numeric price/amount if stated, else null. (Use Rs. by default for currency symbol; if user specifies $, USD, or USDT, set currency symbol to $).
- "payout_term_days": 6 (default) or 1.

Return ONLY raw valid JSON. Do not include markdown code block syntax.
"""

def extract_and_clean_card(text: str) -> dict:
    """Extracts card metadata using Cloudflare Workers AI + Regex Fallbacks."""
    ai_raw = call_cloudflare_ai(text, EXTRACTION_SYSTEM_PROMPT)
    extracted = {}
    try:
        # Clean JSON markdown if present
        clean_json = re.sub(r'```json|```', '', ai_raw).strip()
        if isinstance(ai_raw, dict):
            extracted = ai_raw
        else:
            extracted = json.loads(clean_json)
    except Exception:
        logger.warning(f"Could not parse AI output as JSON: {ai_raw}")
        extracted = {}

    # Regex Fallback / Reinforcement
    if not extracted.get("phone_number"):
        phone_match = re.search(r'\b[6-9]\d{9}\b', text)
        if phone_match:
            extracted["phone_number"] = phone_match.group(0)

    if not extracted.get("payment_details"):
        crypto_match = re.search(r'\b0x[a-fA-F0-9]{40}\b', text)
        upi_match = re.search(r'[\w\.\-]+@[\w\-]+', text)
        if crypto_match:
            extracted["payment_details"] = crypto_match.group(0)
            extracted["payment_method"] = "Crypto/USDT"
        elif upi_match:
            extracted["payment_details"] = upi_match.group(0)

    if not extracted.get("total_amount"):
        amt_match = re.search(r'₹?\s*(\d+(?:\.\d{1,2})?)', text)
        if amt_match and ("₹" in text or "rs" in text.lower() or "rupees" in text.lower() or "pay" in text.lower()):
            extracted["total_amount"] = float(amt_match.group(1))

    return extracted

def check_anti_code_repeat(gift_card_code: str) -> bool:
    """Requirement 1: Anti code repeat check against DB history."""
    if not gift_card_code:
        return False
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM submissions WHERE gift_card_code = %s LIMIT 1", (gift_card_code.strip(),))
            res = cursor.fetchone()
            return res is not None
    finally:
        conn.close()

def check_multiple_payment_requests(phone_number: str, days: int = 4) -> dict:
    """Requirement 2: Detects if same phone number sent multiple codes/requests within ~4 days."""
    if not phone_number:
        return {"has_multiple": False, "count": 0}
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT COUNT(*) as cnt FROM submissions 
                WHERE phone_number = %s 
                AND created_at >= NOW() - INTERVAL %s DAY
            """, (phone_number, days))
            res = cursor.fetchone()
            cnt = res["cnt"] if res else 0
            return {
                "has_multiple": cnt > 0,
                "count": cnt
            }
    finally:
        conn.close()

def check_scammer_blacklist(phone_number: str = None, payment_details: str = None) -> list:
    """Requirement 3.1: Check if phone or UPI ID is already blacklisted in scammer records."""
    if not phone_number and not payment_details:
        return []
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            query = "SELECT * FROM scammers WHERE 1=0"
            params = []
            if phone_number:
                query += " OR phone_number = %s"
                params.append(phone_number)
            if payment_details:
                query += " OR payment_details = %s"
                params.append(payment_details)
            cursor.execute(query, tuple(params))
            return cursor.fetchall()
    finally:
        conn.close()
