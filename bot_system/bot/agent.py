import json
import logging
import re
from bot_system.ai.cloudflare_ai import call_cloudflare_ai_agent
from bot_system.db.connection import get_db_connection
from bot_system.services.old_csv_checker import is_code_in_old_csv
from bot_system.services.date_parser import parse_custom_date_string, get_current_ist_time
from bot_system.bot.code_parser import (
    check_anti_code_repeat,
    check_multiple_payment_requests,
    check_scammer_blacklist
)

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are Super AI (@gcxodebot), an elite, highly intelligent Gift Card Operations Assistant & Automated Processor.

Your mission is to read user messages in ANY format—no matter how informal, messy, broken, partial, template-based, or non-standard—and execute function tool calls with 100% precision.

---

### 🧠 CORE AI REASONING & INFERENCE DIRECTIVE
- **USE YOUR BRAIN & REASONING CAPABILITIES AT ALL TIMES!**
- If an incoming message is formatted weirdly, messy, misspelled, or doesn't match standard patterns, **USE YOUR REASONING TO IDENTIFY THE DATA**.
- Deduce card codes, amounts, phone numbers, payment details, card brand names, payout terms, and card condition from context, intent, surrounding text, or line structure.
- Never fail just because a format is weird—think step-by-step, deduce what each value represents, and extract it accurately into the tool arguments!

---

### 🌟 SUPER AI VISUAL & ENTITY EXTRACTION MATRIX

#### 1. 🔑 Gift Card Codes (`gift_card_codes`):
- **Hyphenated Alphanumeric**: `BNQ0-HSRX-HPXX`, `87JX-HG3C-K9MXC`, `A1B2-C3D4-E5F6`.
- **Numeric Card/PIN Pairs**: `1000710081080496-103927`, `1000700081080496 Pin: 103927`.
- **Numeric 16-19 Digit Codes**: `1000700081080496`, `7010492810485960`.
- **Raw Text / Multi-line Codes**: Extract EVERY code present in the message into the `gift_card_codes` list! Never omit any valid code.

#### 2. 📱 Phone Number (`phone_number`):
- **Visual Formats**: `81443 10635`, `81443-10635`, `+91 8144310635`, `Phone number - 81443 10635`, `Mob: 9014071379`, `8144310635`, country codes (e.g. `+1...`, `+44...`).
- **Rule**: Extract whatever phone number digits are provided by the user. Clean out spaces or formatting hyphens.

#### 3. 💳 Payment Details (`payment_details`):
- **UPI IDs**: Contains `@` symbol (e.g. `8140640635-1@naviaxis`, `8299062744@ptyes`, `john.doe@okicici`, `xyz@ybl`, `upi: 9014071379@paytm`).
- **Crypto Wallet Address**: 0x-prefixed hex string (e.g. `0x71C7656A2B...`).
- **Bank Account Info**: IFSC code or Account Number strings.

#### 4. 🎫 Gift Card Name (`gift_card_name`):
- **PREDEFINED EXACT CARD NAMES**:
  - `PSN 1000`, `PSN 2000`, `PSN 3000`, `PSN 4000`, `PSN 5000`
  - `OV 500`, `OV 1000` (Overwatch)
  - `LOL 100 Rp`, `LOL 575 Rp` (League of Legends)
  - `Roblox 800`, `Roblox 1000`
  - `MC 330 Coins`
  - `PVR Rs.500`
  - `Target 5$ Us`, `Target 10 $ Us`, `Target 15 $ Us`
  - `SOT 550 Coins`, `SOT 1000 Coins`
  - `Amazon Us 5 $`, `Amazon Us 10 $`
  - `Amazon Germany 5 $`, `Amazon Germany 10 $`
  - `Amazon France 5 $`, `Amazon France 10 $`
  - `Best Buy 5 $`, `Best Buy 10 $`, `Best Buy 15 $`
  - `Apple 5$`, `Apple 10 $`
  - `Walmart 5$`, `Walmart 10 $`
  - `Amazon India 1000`, `Amazon India 500`
- **Typo Tolerance Directive**: User input may contain minor typos or informal names (e.g. `2000playstation`, `psn2000`, `overwatch 500`, `pvr 500`). Use your intelligence to map the input to the exact matching predefined card name from the list above! Default to the best matching predefined name.

#### 5. 💰 Total Amount & Currency (`total_amount`):
- **Currency Standard**:
  - Default currency is **`Rs.`** (INR). Use `Rs.` by default unless specified otherwise.
  - If the user explicitly specifies **`$`**, **`USD`**, or **`USDT`** in their text (e.g., `$100`, `100 USD`, `50 USDT`), set the currency to **`$`**.
- **Visual Formats**: `Total amount - Rs.5400`, `Total Amount ( 2105 ):`, `Rs.5400`, `Rs 5400`, `5400 INR`, `₹5400`, `$50`, `100 USD`, `50 USDT`, `Price: 5400`, `Amount - 5400`.
- **Rule**: Use reasoning to identify monetary values anywhere in the text. Output as a float number (e.g. `5400.0`).

#### 6. ⚡ Payout Term (`payout_term_days`):
- If the message mentions `fast`, `fastpay`, `1 day`, `oneday`, `sameday`, `instant`, set `payout_term_days` = 1.
- Otherwise default `payout_term_days` = 6.

#### 7. 🏷️ Card Condition (`card_type`):
- If the message mentions `old`, `used`, `purana`, `existing`, set `card_type` = "OLD".
- Otherwise default `card_type` = "NEW".

#### 8. 📅 Custom Date & Time (`custom_created_at`):
- **USE YOUR INTELLIGENCE TO REASON AND PARSE ANY DATE MENTIONED IN THE MESSAGE** into standard `"YYYY-MM-DD HH:MM:SS"` (or `"YYYY-MM-DD"`) format!
- Understand all date variants effortlessly (e.g. `1 aug 26` -> `"2026-08-01"`, `1-aug-26` -> `"2026-08-01"`, `1 aug 2026` -> `"2026-08-01"`, `01/08/26` -> `"2026-08-01"`, `15 Sept 2025` -> `"2025-09-15"`, `5 August` -> current year + `"-08-05"`, `yesterday`, `today`, etc.).
- If a custom date is provided, pass the resolved standard datetime string `"YYYY-MM-DD HH:MM:SS"` in `custom_created_at`.
- If no date is mentioned, leave `custom_created_at` empty (the system will default to current IST timestamp).

---

### ❓ MISSING DATA HANDLING DIRECTIVE
- If essential submission details (such as `phone_number` or `payment_details` / UPI ID or `total_amount`) are missing from the user's message, DO NOT abort or invent fake data!
- Call `add_submission` with whatever data is present AND respond kindly asking the user to send the missing piece (e.g., "Please reply with your UPI ID or Phone Number to finalize your submission!").

### 🚀 TOOL EXECUTOR SELECTION

1. **`add_submission`**: ALWAYS call this tool whenever one or more gift card codes or submission details are present in the user text!
2. **`read_submissions`**: Call when the user asks to search, query, list, or check submissions.
3. **`move_to_bin`**: Call when the user requests to delete, reject, or move a card/submission to bin.
4. **`check_scammer`**: Call when asked to verify if a Phone / UPI / Wallet address is blacklisted.

Respond warmly, smartly, and professionally after invoking the appropriate tool.
"""

AI_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "add_submission",
            "description": "Add one or multiple gift card submissions into the database.",
            "parameters": {
                "type": "object",
                "properties": {
                    "phone_number": {"type": "string", "description": "10-digit phone number if present"},
                    "gift_card_name": {"type": "string", "description": "Name/brand of the gift card"},
                    "gift_card_codes": {"type": "array", "items": {"type": "string"}, "description": "List of gift card codes extracted"},
                    "payment_method": {"type": "string", "description": "UPI, Crypto, Bank, etc."},
                    "payment_details": {"type": "string", "description": "UPI ID or wallet address"},
                    "total_amount": {"type": "number", "description": "Total monetary amount/price as a number"},
                    "currency": {"type": "string", "description": "'Rs.' (INR) or '$' (USD/USDT)"},
                    "payout_term_days": {"type": "integer", "description": "1 for fast payment (1 day), 6 for normal payment (6 days)"},
                    "card_type": {"type": "string", "description": "'OLD' or 'NEW'"},
                    "custom_created_at": {"type": "string", "description": "Standardized ISO date or datetime string (e.g. '2026-08-01 14:30:00' or '2026-08-01') resolved by LLM from user text"}
                },
                "required": ["gift_card_codes"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_submissions",
            "description": "Query submissions by phone, code, or status.",
            "parameters": {
                "type": "object",
                "properties": {
                    "phone_number": {"type": "string"},
                    "gift_card_code": {"type": "string"},
                    "status": {"type": "string"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "move_to_bin",
            "description": "Delete submission or move to bin/rejected status by submission ID or code.",
            "parameters": {
                "type": "object",
                "properties": {
                    "submission_id": {"type": "integer"},
                    "gift_card_code": {"type": "string"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "check_scammer",
            "description": "Check if a phone number or payment details are blacklisted.",
            "parameters": {
                "type": "object",
                "properties": {
                    "phone_number": {"type": "string"},
                    "payment_details": {"type": "string"}
                }
            }
        }
    }
]

# Tool Executors
def execute_add_submission(args: dict, raw_message: str) -> str:
    phone = args.get("phone_number")
    card_name = args.get("gift_card_name") or "Gift Card"
    codes = args.get("gift_card_codes") or []
    upi = args.get("payment_details")
    method = args.get("payment_method") or "UPI"
    try:
        amount = float(args.get("total_amount") or 0.00)
    except (ValueError, TypeError):
        amount = 0.00

    try:
        payout_days = int(args.get("payout_term_days") or 6)
    except (ValueError, TypeError):
        payout_days = 6

    if not codes:
        return "No gift card codes extracted. Please provide card code."

    # 1. Scammer Blacklist Shield Check
    blacklisted = check_scammer_blacklist(phone_number=phone, payment_details=upi)
    if blacklisted:
        reason = blacklisted[0].get("reason", "Blacklisted supplier account")
        return f"⚠️ SCAMMER ALERT: Supplier {phone or upi} is blacklisted for reason: {reason}. Submission blocked."

    saved_ids = []
    repeated_codes = []

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Batch query to check duplicate codes in one SQL query instead of loop connection!
            valid_codes = []
            clean_codes = [str(c).strip() for c in codes if str(c).strip()]
            in_old_db_flag = 0

            if clean_codes:
                # Fetch all non-rejected submissions' gift_card_code strings to accurately match individual codes
                cursor.execute("SELECT id, gift_card_code FROM submissions WHERE status != 'rejected'")
                existing_rows = cursor.fetchall()
                existing_code_to_sub_id = {}
                for row in existing_rows:
                    raw_gc = str(row.get("gift_card_code") or "")
                    sub_c_list = [c.strip() for c in re.split(r'[\n,\s;]+', raw_gc) if c.strip()]
                    for sc in sub_c_list:
                        existing_code_to_sub_id[sc] = row.get("id")

                for code_clean in clean_codes:
                    code_in_old = 1 if is_code_in_old_csv(code_clean) else 0
                    if code_in_old:
                        in_old_db_flag = 1

                    if code_clean in existing_code_to_sub_id:
                        repeated_codes.append(code_clean)
                        matched_sub_id = existing_code_to_sub_id[code_clean]
                        cursor.execute(
                            "INSERT INTO scammers (phone_number, payment_details, reason, flagged_code, in_old_db, gift_card_name) VALUES (%s, %s, %s, %s, %s, %s)",
                            (phone, upi, f"Submitted duplicate card code (Matches Submission #{matched_sub_id})", code_clean, code_in_old, card_name)
                        )
                    else:
                        valid_codes.append(code_clean)

            card_type = str(args.get("card_type") or "NEW").upper()
            platform = str(args.get("platform") or "test1")
            slot = str(args.get("slot") or "test1")
            order_id = str(args.get("order_id") or "")
            custom_date_arg = args.get("custom_created_at") or args.get("created_at") or ""
            parsed_created_at = parse_custom_date_string(custom_date_arg)

            currency = str(args.get("currency") or ("$" if "$" in raw_message or "USD" in raw_message.upper() or "USDT" in raw_message.upper() else "Rs.")).strip()
            if currency not in ["$", "USD", "USDT", "Rs.", "INR"]:
                currency = "Rs."
            if currency in ["USD", "USDT"]:
                currency = "$"
            elif currency == "INR":
                currency = "Rs."

            if valid_codes:
                combined_codes_str = ", ".join(valid_codes)
                initial_code_statuses = json.dumps({
                    code: {"c_status": "unsold", "platform": platform, "slot": slot}
                    for code in valid_codes
                })
                if parsed_created_at:
                    cursor.execute("""
                        INSERT INTO submissions (phone_number, gift_card_name, gift_card_code, payment_method, payment_details, total_amount, currency, raw_message, card_type, platform, slot, order_id, status, code_statuses, payout_term_days, in_old_db, created_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'unpaid', %s, %s, %s, %s)
                    """, (phone, card_name, combined_codes_str, method, upi, amount, currency, raw_message, card_type, platform, slot, order_id, initial_code_statuses, payout_days, in_old_db_flag, parsed_created_at))
                else:
                    cursor.execute("""
                        INSERT INTO submissions (phone_number, gift_card_name, gift_card_code, payment_method, payment_details, total_amount, currency, raw_message, card_type, platform, slot, order_id, status, code_statuses, payout_term_days, in_old_db)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'unpaid', %s, %s, %s)
                    """, (phone, card_name, combined_codes_str, method, upi, amount, currency, raw_message, card_type, platform, slot, order_id, initial_code_statuses, payout_days, in_old_db_flag))
                saved_ids.append(cursor.lastrowid)

            # Check multiple payment requests in same connection session
            multi_cnt = 0
            if phone:
                cursor.execute("""
                    SELECT COUNT(*) as cnt FROM submissions 
                    WHERE phone_number = %s 
                    AND created_at >= NOW() - INTERVAL 4 DAY
                """, (phone,))
                row = cursor.fetchone()
                multi_cnt = row["cnt"] if row else 0
    finally:
        conn.close()

    multi_alert = ""
    if multi_cnt > 1:
        multi_alert = f"\n\n🔔 Note: Phone {phone} has sent {multi_cnt} payment requests in the last 4 days. You can pay them combined!"

    display_date = parsed_created_at or get_current_ist_time().strftime("%Y-%m-%d %H:%M:%S")
    term_text = "⚡ Fast (1 Day)" if payout_days == 1 else "Normal (6 Days)"
    old_db_text = " ⚠️ [FOUND IN OLD DB]" if in_old_db_flag else ""

    res = (
        f"✅ **Gift Card Submission Processed!**\n\n"
        f"📅 **Date & Time:** {display_date}{old_db_text}\n"
        f"📱 **Phone:** {phone or 'Missing (Fill in dashboard)'}\n"
        f"🎫 **Card Name:** {card_name}\n"
        f"⚡ **Payout Term:** {term_text}\n"
        f"🔑 **Codes Extracted ({len(codes)}):**\n" + "\n".join([f"• `{c}`" for c in codes]) + "\n"
        f"💳 **Payment Details:** {upi or 'Missing'}\n"
        f"💰 **Total Amount:** ₹{amount}\n\n"
        f"Saved {len(saved_ids)} code(s) (Submission IDs: {saved_ids}). Card: {card_name}, Date: {display_date}, Phone: {phone or 'Missing'}, UPI: {upi or 'Missing'}."
    )
    if repeated_codes:
        res += f"\n❌ DUPLICATE REJECTED: Code(s) {repeated_codes} were already submitted before and blacklisted!"
    if multi_alert:
        res += multi_alert

    missing_fields = []
    if not phone: missing_fields.append("Phone Number")
    if not upi: missing_fields.append("Payment UPI ID")
    if missing_fields:
        res += f"\n💡 Tip: Missing {', '.join(missing_fields)}. You can also fill them later via the Frontend Dashboard!"

    return res

def execute_read_submissions(args: dict) -> str:
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            query = "SELECT id, phone_number, gift_card_name, gift_card_code, total_amount, status, created_at FROM submissions WHERE 1=1"
            params = []
            if args.get("phone_number"):
                query += " AND phone_number = %s"
                params.append(args["phone_number"])
            if args.get("gift_card_code"):
                query += " AND gift_card_code = %s"
                params.append(args["gift_card_code"])
            if args.get("status"):
                query += " AND status = %s"
                params.append(args["status"])
            query += " ORDER BY created_at DESC LIMIT 10"
            cursor.execute(query, tuple(params))
            records = cursor.fetchall()
            if not records:
                return "No matching submissions found in database."
            return f"Found {len(records)} submissions: " + json.dumps(records, default=str)
    finally:
        conn.close()

def execute_move_to_bin(args: dict) -> str:
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            if args.get("submission_id"):
                cursor.execute("UPDATE submissions SET status = 'rejected' WHERE id = %s", (args["submission_id"],))
                return f"Submission ID {args['submission_id']} moved to bin/rejected status."
            elif args.get("gift_card_code"):
                cursor.execute("UPDATE submissions SET status = 'rejected' WHERE gift_card_code = %s", (args["gift_card_code"],))
                return f"Card code {args['gift_card_code']} moved to bin/rejected status."
            return "Please specify submission_id or gift_card_code to delete/bin."
    finally:
        conn.close()

def execute_check_scammer(args: dict) -> str:
    res = check_scammer_blacklist(phone_number=args.get("phone_number"), payment_details=args.get("payment_details"))
    if res:
        return f"🚨 Match found in Scammer Blacklist: {json.dumps(res, default=str)}"
    return "✅ Clean! No scammer records found for this Phone / UPI."

from bot_system.ai.groq_ai import call_groq_ai_agent
from bot_system.ai.cloudflare_ai import call_cloudflare_ai_agent

def process_user_message_with_agent(user_text: str) -> str:
    """Passes raw user message directly to Groq AI client (openai/gpt-oss-20b) with Cloudflare Workers AI fallback."""
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_text}
    ]

    # Primary: Call Groq AI SDK with reasoning and function calling
    logger.info("Calling Groq AI agent...")
    ai_response = call_groq_ai_agent(messages, tools=AI_TOOLS)
    tool_calls = ai_response.get("tool_calls", [])

    if tool_calls or ai_response.get("content"):
        logger.info("Groq AI responded successfully.")
    else:
        # Fallback to Cloudflare Workers AI if Groq returned empty response
        logger.info("Groq AI returned empty response or failed. Executing Cloudflare Workers AI fallback...")
        ai_response = call_cloudflare_ai_agent(messages, tools=AI_TOOLS)
        tool_calls = ai_response.get("tool_calls", [])
        if tool_calls or ai_response.get("content"):
            logger.info("Cloudflare Workers AI responded successfully.")
        else:
            logger.warning("Cloudflare Workers AI also returned empty response.")

    if not tool_calls:
        return ai_response.get("content") or "I couldn't detect valid gift card codes or commands in your message. Please verify the format."

    tool_outputs = []
    for call in tool_calls:
        fn_name = call["function"]["name"]
        fn_args = call["function"].get("arguments", {})
        if isinstance(fn_args, str):
            try:
                fn_args = json.loads(fn_args)
            except Exception:
                fn_args = {}

        if fn_name == "add_submission":
            output = execute_add_submission(fn_args, user_text)
        elif fn_name == "read_submissions":
            output = execute_read_submissions(fn_args)
        elif fn_name == "move_to_bin":
            output = execute_move_to_bin(fn_args)
        elif fn_name == "check_scammer":
            output = execute_check_scammer(fn_args)
        else:
            output = f"Unknown tool: {fn_name}"
        tool_outputs.append(output)

    return "\n".join(tool_outputs)
