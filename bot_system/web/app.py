import json
import re
from flask import Flask, render_template, jsonify, request, send_file
from bot_system.config import WEB_PORT
from bot_system.db.connection import get_db_connection
from bot_system.services.date_parser import parse_custom_date_string
from bot_system.web.services import (
    get_dashboard_metrics,
    get_codes_inventory,
    get_scammers_list,
    export_payout_excel
)

app = Flask(__name__, template_folder="templates", static_folder="static")

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/metrics")
def api_metrics():
    return jsonify(get_dashboard_metrics())

@app.route("/api/inventory")
def api_inventory():
    return jsonify(get_codes_inventory())

@app.route("/api/scammers")
def api_scammers():
    return jsonify(get_scammers_list())

@app.route("/api/export-payout")
def api_export_payout():
    days = request.args.get("days")
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    mode = request.args.get("mode", "summary")
    
    days_offset = int(days) if days and days.isdigit() else None
    if not start_date and not end_date and days_offset is None:
        days_offset = 6

    excel_stream = export_payout_excel(
        days_offset=days_offset,
        start_date=start_date,
        end_date=end_date,
        mode=mode
    )
    
    fname = f"payout_report_{start_date or f'{days_offset}d'}.xlsx"
    return send_file(
        excel_stream,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=fname
    )

@app.route("/api/submission/update-status", methods=["POST"])
def api_update_status():
    data = request.json
    sub_id = data.get("id")
    status = data.get("status")
    source = data.get("source", "submission")  # 'submission' or 'scammer'

    if not sub_id or not status:
        return jsonify({"success": False, "error": "Missing id or status"}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            if source == "scammer":
                cursor.execute("UPDATE scammers SET status = %s WHERE id = %s", (status, sub_id))
            else:
                cursor.execute("UPDATE submissions SET status = %s WHERE id = %s", (status, sub_id))
        return jsonify({"success": True})
    finally:
        conn.close()

@app.route("/api/submission/details")
def api_submission_details():
    from bot_system.web.services import get_submission_full_details, get_scammer_full_details
    sub_id = request.args.get("id")
    source = request.args.get("source", "submission")
    if not sub_id:
        return jsonify({"success": False, "error": "Missing id"}), 400
    if source == "scammer":
        res = get_scammer_full_details(int(sub_id))
    else:
        res = get_submission_full_details(int(sub_id))
    return jsonify({"success": True, "data": res})

@app.route("/api/config", methods=["GET"])
def api_get_config():
    from bot_system.web.services import get_app_config
    return jsonify(get_app_config())

@app.route("/api/config/update", methods=["POST"])
def api_update_config():
    from bot_system.web.services import update_app_config
    data = request.json or {}
    key = data.get("key")
    items = data.get("items")
    if key not in ["platforms", "slots"] or not isinstance(items, list):
        return jsonify({"success": False, "error": "Invalid payload"}), 400
    update_app_config(key, items)
    return jsonify({"success": True})

@app.route("/api/submission/update-platform", methods=["POST"])
def api_update_platform():
    data = request.json or {}
    sub_id = data.get("id")
    platform = data.get("platform", "test1")
    source = data.get("source", "submission")

    if not sub_id:
        return jsonify({"success": False, "error": "Missing id"}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            if source == "scammer":
                cursor.execute("UPDATE scammers SET platform = %s WHERE id = %s", (platform, sub_id))
            else:
                cursor.execute("UPDATE submissions SET platform = %s WHERE id = %s", (platform, sub_id))
        return jsonify({"success": True})
    finally:
        conn.close()

@app.route("/api/submission/update-slot", methods=["POST"])
def api_update_slot():
    data = request.json or {}
    sub_id = data.get("id")
    slot = data.get("slot", "test1")
    source = data.get("source", "submission")

    if not sub_id:
        return jsonify({"success": False, "error": "Missing id"}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            if source == "scammer":
                cursor.execute("UPDATE scammers SET slot = %s WHERE id = %s", (slot, sub_id))
            else:
                cursor.execute("UPDATE submissions SET slot = %s WHERE id = %s", (slot, sub_id))
        return jsonify({"success": True})
    finally:
        conn.close()

@app.route("/api/submission/update-order-id", methods=["POST"])
def api_update_order_id():
    data = request.json or {}
    sub_id = data.get("id")
    order_id = data.get("order_id", "")
    source = data.get("source", "submission")

    if not sub_id:
        return jsonify({"success": False, "error": "Missing id"}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            if source == "scammer":
                cursor.execute("UPDATE scammers SET order_id = %s WHERE id = %s", (order_id, sub_id))
            else:
                cursor.execute("UPDATE submissions SET order_id = %s WHERE id = %s", (order_id, sub_id))
        return jsonify({"success": True})
    finally:
        conn.close()

@app.route("/api/submission/bulk-update", methods=["POST"])
def api_bulk_update():
    data = request.json or {}
    updates = data.get("updates", [])
    if not isinstance(updates, list):
        return jsonify({"success": False, "error": "Updates must be a list"}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            for item in updates:
                sub_id = item.get("id")
                if not sub_id:
                    continue
                source = item.get("source", "submission")
                table = "scammers" if source == "scammer" else "submissions"

                fields = []
                params = []
                if "order_id" in item:
                    fields.append("order_id = %s")
                    params.append(item["order_id"])
                if "platform" in item:
                    fields.append("platform = %s")
                    params.append(item["platform"])
                if "slot" in item:
                    fields.append("slot = %s")
                    params.append(item["slot"])
                if "status" in item:
                    fields.append("status = %s")
                    params.append(item["status"])
                if "c_status" in item:
                    fields.append("c_status = %s")
                    params.append(item["c_status"])
                if "gift_card_name" in item:
                    fields.append("gift_card_name = %s")
                    params.append(item["gift_card_name"])

                if "code_metas" in item and isinstance(item["code_metas"], dict) and table == "submissions":
                    cursor.execute("SELECT code_statuses, platform, slot, c_status FROM submissions WHERE id = %s", (sub_id,))
                    row = cursor.fetchone()
                    if row:
                        statuses_map = {}
                        raw_st = row.get("code_statuses")
                        if raw_st:
                            if isinstance(raw_st, str):
                                try: statuses_map = json.loads(raw_st)
                                except: statuses_map = {}
                            elif isinstance(raw_st, dict):
                                statuses_map = raw_st

                        for target_code, changes in item["code_metas"].items():
                            cur_meta = statuses_map.get(target_code)
                            if isinstance(cur_meta, dict):
                                code_dict = cur_meta
                            elif isinstance(cur_meta, str):
                                code_dict = {"c_status": cur_meta, "platform": row.get("platform") or "test1", "slot": row.get("slot") or "test1"}
                            else:
                                fallback_cst = row.get("c_status") or "unsold"
                                if fallback_cst == "ununsold": fallback_cst = "unsold"
                                code_dict = {"c_status": fallback_cst, "platform": row.get("platform") or "test1", "slot": row.get("slot") or "test1"}

                            for f_key, f_val in changes.items():
                                code_dict[f_key] = f_val
                            statuses_map[target_code] = code_dict

                        new_json_str = json.dumps(statuses_map)
                        fields.append("code_statuses = %s")
                        params.append(new_json_str)

                if fields:
                    params.append(sub_id)
                    query = f"UPDATE {table} SET {', '.join(fields)} WHERE id = %s"
                    cursor.execute(query, tuple(params))
        return jsonify({"success": True, "updated_count": len(updates)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()

@app.route("/api/submission/update-card-name", methods=["POST"])
def api_update_card_name():
    data = request.json or {}
    sub_id = data.get("id")
    gift_card_name = data.get("gift_card_name", "")
    source = data.get("source", "submission")

    if not sub_id:
        return jsonify({"success": False, "error": "Missing id"}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            if source == "scammer":
                cursor.execute("UPDATE scammers SET gift_card_name = %s WHERE id = %s", (gift_card_name, sub_id))
            else:
                cursor.execute("UPDATE submissions SET gift_card_name = %s WHERE id = %s", (gift_card_name, sub_id))
        return jsonify({"success": True})
    finally:
        conn.close()

@app.route("/api/submission/update-code-meta", methods=["POST"])
@app.route("/api/submission/update-code-status", methods=["POST"])
def api_update_code_meta():
    data = request.json or {}
    sub_id = data.get("id")
    target_code = str(data.get("code") or "").strip()
    field = str(data.get("field") or "c_status").strip()
    val = str(data.get("value") if data.get("value") is not None else data.get("c_status") or "").strip()

    if not sub_id or not target_code:
        return jsonify({"success": False, "error": "Missing id or code"}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT code_statuses, gift_card_code, c_status, platform, slot FROM submissions WHERE id = %s", (sub_id,))
            row = cursor.fetchone()
            if row:
                statuses_map = {}
                raw_st = row.get("code_statuses")
                if raw_st:
                    if isinstance(raw_st, str):
                        try: statuses_map = json.loads(raw_st)
                        except: statuses_map = {}
                    elif isinstance(raw_st, dict):
                        statuses_map = raw_st

                cur_meta = statuses_map.get(target_code)
                if isinstance(cur_meta, dict):
                    code_dict = cur_meta
                elif isinstance(cur_meta, str):
                    code_dict = {"c_status": cur_meta, "platform": row.get("platform") or "test1", "slot": row.get("slot") or "test1"}
                else:
                    fallback_cst = row.get("c_status") or "unsold"
                    if fallback_cst == "ununsold": fallback_cst = "unsold"
                    code_dict = {"c_status": fallback_cst, "platform": row.get("platform") or "test1", "slot": row.get("slot") or "test1"}

                code_dict[field] = val
                statuses_map[target_code] = code_dict
                new_json_str = json.dumps(statuses_map)

                if field in ("c_status", "platform", "slot"):
                    cursor.execute(
                        f"UPDATE submissions SET code_statuses = %s, {field} = %s WHERE id = %s",
                        (new_json_str, val, sub_id)
                    )
                else:
                    cursor.execute(
                        "UPDATE submissions SET code_statuses = %s WHERE id = %s",
                        (new_json_str, sub_id)
                    )
                return jsonify({"success": True, "message": f"Updated {target_code} {field} to {val}"})
            return jsonify({"success": False, "error": "Submission not found"}), 404
    finally:
        conn.close()

@app.route("/api/submission/edit", methods=["POST"])
def api_edit_submission():
    data = request.json or {}
    sub_id = data.get("id")
    source = data.get("source", "submission")
    if not sub_id:
        return jsonify({"success": False, "error": "Missing submission id"}), 400

    parsed_date = parse_custom_date_string(data.get("created_at"))

    raw_codes = str(data.get("gift_card_code") or "").strip()
    clean_codes = [c.strip() for c in re.split(r'[\n,\s;]+', raw_codes) if c.strip()]
    normalized_codes_str = ", ".join(clean_codes) if clean_codes else raw_codes

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            if source == "scammer":
                if parsed_date:
                    cursor.execute("""
                        UPDATE scammers
                        SET phone_number = %s, gift_card_name = %s, flagged_code = %s, payment_details = %s,
                            total_amount = %s, card_type = %s, platform = %s, slot = %s, order_id = %s, status = %s, created_at = %s
                        WHERE id = %s
                    """, (
                        data.get("phone_number", ""),
                        data.get("gift_card_name", "FLAGGED / DUPLICATE"),
                        normalized_codes_str,
                        data.get("payment_details", ""),
                        float(data.get("total_amount") or 0),
                        data.get("card_type", "NEW"),
                        data.get("platform", "test1"),
                        data.get("slot", "test1"),
                        data.get("order_id", ""),
                        data.get("status", "flagged"),
                        parsed_date,
                        sub_id
                    ))
                else:
                    cursor.execute("""
                        UPDATE scammers
                        SET phone_number = %s, gift_card_name = %s, flagged_code = %s, payment_details = %s,
                            total_amount = %s, card_type = %s, platform = %s, slot = %s, order_id = %s, status = %s
                        WHERE id = %s
                    """, (
                        data.get("phone_number", ""),
                        data.get("gift_card_name", "FLAGGED / DUPLICATE"),
                        normalized_codes_str,
                        data.get("payment_details", ""),
                        float(data.get("total_amount") or 0),
                        data.get("card_type", "NEW"),
                        data.get("platform", "test1"),
                        data.get("slot", "test1"),
                        data.get("order_id", ""),
                        data.get("status", "flagged"),
                        sub_id
                    ))
            else:
                cursor.execute("SELECT code_statuses FROM submissions WHERE id = %s", (sub_id,))
                row = cursor.fetchone()
                statuses_map = {}
                if row and row.get("code_statuses"):
                    raw_st = row["code_statuses"]
                    if isinstance(raw_st, str):
                        try: statuses_map = json.loads(raw_st)
                        except: statuses_map = {}
                    elif isinstance(raw_st, dict):
                        statuses_map = raw_st

                updated_statuses_map = {}
                for c in clean_codes:
                    if c in statuses_map:
                        updated_statuses_map[c] = statuses_map[c]
                    else:
                        init_st = data.get("status") or "unsold"
                        if init_st == "ununsold": init_st = "unsold"
                        updated_statuses_map[c] = {
                            "c_status": init_st,
                            "platform": data.get("platform") or "test1",
                            "slot": data.get("slot") or "test1"
                        }
                new_code_statuses_json = json.dumps(updated_statuses_map)

                if parsed_date:
                    cursor.execute("""
                        UPDATE submissions
                        SET phone_number = %s, gift_card_name = %s, gift_card_code = %s, code_statuses = %s,
                            payment_details = %s, total_amount = %s, currency = %s, payout_term_days = %s, card_type = %s, platform = %s, slot = %s, order_id = %s, status = %s, created_at = %s
                        WHERE id = %s
                    """, (
                        data.get("phone_number", ""),
                        data.get("gift_card_name", ""),
                        normalized_codes_str,
                        new_code_statuses_json,
                        data.get("payment_details", ""),
                        float(data.get("total_amount") or 0),
                        data.get("currency", "Rs."),
                        int(data.get("payout_term_days") or 6),
                        data.get("card_type", "NEW"),
                        data.get("platform", "test1"),
                        data.get("slot", "test1"),
                        data.get("order_id", ""),
                        data.get("status", "unpaid"),
                        parsed_date,
                        sub_id
                    ))
                else:
                    cursor.execute("""
                        UPDATE submissions
                        SET phone_number = %s, gift_card_name = %s, gift_card_code = %s, code_statuses = %s,
                            payment_details = %s, total_amount = %s, currency = %s, payout_term_days = %s, card_type = %s, platform = %s, slot = %s, order_id = %s, status = %s
                        WHERE id = %s
                    """, (
                        data.get("phone_number", ""),
                        data.get("gift_card_name", ""),
                        normalized_codes_str,
                        new_code_statuses_json,
                        data.get("payment_details", ""),
                        float(data.get("total_amount") or 0),
                        data.get("currency", "Rs."),
                        int(data.get("payout_term_days") or 6),
                        data.get("card_type", "NEW"),
                        data.get("platform", "test1"),
                        data.get("slot", "test1"),
                        data.get("order_id", ""),
                        data.get("status", "unpaid"),
                        sub_id
                    ))
        return jsonify({"success": True, "message": "Record updated successfully!"})
    finally:
        conn.close()

@app.route("/api/submission/delete", methods=["POST"])
def api_delete_submission():
    data = request.json or {}
    sub_id = data.get("id")
    source = data.get("source", "submission")
    if not sub_id:
        return jsonify({"success": False, "error": "Missing submission id"}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            if source == "scammer":
                cursor.execute("UPDATE scammers SET status = 'rejected' WHERE id = %s", (sub_id,))
            else:
                cursor.execute("UPDATE submissions SET status = 'rejected' WHERE id = %s", (sub_id,))
        return jsonify({"success": True, "message": "Moved to bin successfully!"})
    finally:
        conn.close()

@app.route("/api/duplicates", methods=["GET"])
def api_get_duplicates():
    try:
        from bot_system.web.services import get_all_duplicate_conflicts
        dups = get_all_duplicate_conflicts()
        return jsonify({"success": True, "duplicates": dups})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/duplicate/delete-code", methods=["POST"])
def api_delete_duplicate_code():
    data = request.json or {}
    sub_id = data.get("id")
    target_code = str(data.get("code") or "").strip()
    source = data.get("source", "submission")

    if not sub_id or not target_code:
        return jsonify({"success": False, "error": "Missing submission ID or code"}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            if source == "scammer":
                cursor.execute("SELECT flagged_code FROM scammers WHERE id = %s", (sub_id,))
                row = cursor.fetchone()
                if not row:
                    return jsonify({"success": False, "error": "Scammer record not found"}), 404
                raw_c = str(row.get("flagged_code") or "")
                c_list = [c.strip() for c in re.split(r'[\n,\s;]+', raw_c) if c.strip()]
                remaining = [c for c in c_list if c.lower() != target_code.lower()]
                if not remaining:
                    cursor.execute("DELETE FROM scammers WHERE id = %s", (sub_id,))
                else:
                    cursor.execute("UPDATE scammers SET flagged_code = %s WHERE id = %s", (", ".join(remaining), sub_id))
            else:
                cursor.execute("SELECT gift_card_code, code_statuses FROM submissions WHERE id = %s", (sub_id,))
                row = cursor.fetchone()
                if not row:
                    return jsonify({"success": False, "error": "Submission record not found"}), 404
                raw_c = str(row.get("gift_card_code") or "")
                c_list = [c.strip() for c in re.split(r'[\n,\s;]+', raw_c) if c.strip()]
                remaining = [c for c in c_list if c.lower() != target_code.lower()]
                if not remaining:
                    cursor.execute("UPDATE submissions SET status = 'rejected' WHERE id = %s", (sub_id,))
                else:
                    # Update statuses map removing the target code
                    st_map = {}
                    if row.get("code_statuses"):
                        raw_st = row["code_statuses"]
                        if isinstance(raw_st, str):
                            try: st_map = json.loads(raw_st)
                            except: st_map = {}
                        elif isinstance(raw_st, dict):
                            st_map = raw_st
                    # Remove target code key
                    keys_to_del = [k for k in st_map.keys() if k.lower() == target_code.lower()]
                    for k in keys_to_del:
                        del st_map[k]
                    cursor.execute(
                        "UPDATE submissions SET gift_card_code = %s, code_statuses = %s WHERE id = %s",
                        (", ".join(remaining), json.dumps(st_map), sub_id)
                    )
        return jsonify({"success": True, "message": f"Code '{target_code}' removed from entry #{sub_id}."})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()

@app.route("/api/submission/manual-create", methods=["POST"])
def api_manual_create():
    from bot_system.bot.agent import execute_add_submission
    data = request.json
    res_msg = execute_add_submission(data, raw_message="Manual Frontend Submission")
    return jsonify({"success": True, "message": res_msg})

@app.route("/api/danger/reset-db", methods=["POST"])
def api_danger_reset_db():
    data = request.json or {}
    passkey = data.get("passkey")
    if passkey != "admin123" and passkey != "admin":
        return jsonify({"success": False, "error": "Unauthorized! Invalid passkey."}), 403

    from bot_system.web.services import reset_database
    res = reset_database()
    return jsonify(res)

@app.route("/api/backup/now", methods=["POST"])
def api_backup_now():
    from bot_system.services.github_backup import perform_github_backup
    try:
        summary = perform_github_backup()
        return jsonify({"success": True, "message": "GitHub backup triggered successfully!", "data": summary})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

def run_web_app():
    from bot_system.services.backup_scheduler import start_backup_scheduler
    start_backup_scheduler()
    app.run(host="0.0.0.0", port=WEB_PORT, debug=False)
