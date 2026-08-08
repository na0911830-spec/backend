import logging
from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes
from bot_system.config import TELEGRAM_BOT_TOKEN
from bot_system.db.connection import get_db_connection
from bot_system.bot.code_parser import (
    extract_and_clean_card,
    check_anti_code_repeat,
    check_multiple_payment_requests,
    check_scammer_blacklist
)

from bot_system.bot.agent import process_user_message_with_agent

logger = logging.getLogger(__name__)

from bot_system.config import TELEGRAM_BOT_TOKEN, ALLOWED_TELEGRAM_USERNAMES

def is_user_authorized(update: Update) -> bool:
    """Checks if the incoming Telegram user's username is authorized."""
    user = update.effective_user
    if not user or not user.username:
        return False
    username_clean = user.username.strip().lower()
    return username_clean in [u.lower() for u in ALLOWED_TELEGRAM_USERNAMES]

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_user_authorized(update):
        await update.message.reply_text("⛔ Access Denied.")
        return

    msg = (
        "👋 Hey! I am your AI Gift Card Worker Assistant.\n\n"
        "Send your gift cards in ANY format (single cards, multi-code lists, PVR codes, or PlayStation templates).\n\n"
        "You can also ask me questions like:\n"
        "• 'Show submissions for 9014071379'\n"
        "• 'Move submission 5 to bin'\n"
        "• 'Check if 9876543210 is blacklisted'"
    )
    await update.message.reply_text(msg)

async def handle_incoming_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_user_authorized(update):
        await update.message.reply_text("⛔ Access Denied.")
        return

    text = update.message.text
    if not text:
        return

    await update.message.reply_chat_action("typing")

    try:
        reply_text = process_user_message_with_agent(text)
        await update.message.reply_text(reply_text)
    except Exception as e:
        logger.error(f"Error processing message with AI Agent: {e}")
        await update.message.reply_text("Oops! Something went wrong while processing your request. Please try again!")

def start_telegram_bot_app():
    app = ApplicationBuilder().token(TELEGRAM_BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_incoming_message))
    logger.info("Telegram Bot service initialized.")
    return app
