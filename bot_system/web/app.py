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
    days = int(request.args.get("days", 6))
    excel_stream = export_payout_excel(days)
    return send_file(
        excel_stream,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=f"payout_due_{days}_days.xlsx"
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

                if fields:
                    params.append(sub_id)
                    query = f"UPDATE {table} SET {', '.join(fields)} WHERE id = %s"
                    cursor.execute(query, tuple(params))
        return jsonify({"success": True, "updated_count": len(updates)})
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

@app.route("/api/submission/edit", methods=["POST"])
def api_edit_submission():
    data = request.json or {}
    sub_id = data.get("id")
    source = data.get("source", "submission")
    if not sub_id:
        return jsonify({"success": False, "error": "Missing submission id"}), 400

    parsed_date = parse_custom_date_string(data.get("created_at"))

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
                        data.get("gift_card_code", ""),
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
                        data.get("gift_card_code", ""),
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
                if parsed_date:
                    cursor.execute("""
                        UPDATE submissions
                        SET phone_number = %s, gift_card_name = %s, gift_card_code = %s,
                            payment_details = %s, total_amount = %s, currency = %s, payout_term_days = %s, card_type = %s, platform = %s, slot = %s, order_id = %s, status = %s, created_at = %s
                        WHERE id = %s
                    """, (
                        data.get("phone_number", ""),
                        data.get("gift_card_name", ""),
                        data.get("gift_card_code", ""),
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
                        SET phone_number = %s, gift_card_name = %s, gift_card_code = %s,
                            payment_details = %s, total_amount = %s, currency = %s, payout_term_days = %s, card_type = %s, platform = %s, slot = %s, order_id = %s, status = %s
                        WHERE id = %s
                    """, (
                        data.get("phone_number", ""),
                        data.get("gift_card_name", ""),
                        data.get("gift_card_code", ""),
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

def run_web_app():
    app.run(host="0.0.0.0", port=WEB_PORT, debug=False)
