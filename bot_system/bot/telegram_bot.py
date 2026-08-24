import logging
import asyncio
from collections import defaultdict
from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes
from bot_system.config import TELEGRAM_BOT_TOKEN, ALLOWED_TELEGRAM_USERNAMES
from bot_system.bot.agent import process_user_message_with_agent

logger = logging.getLogger(__name__)

# Sequential message processing lock per user/chat to ensure 1-by-1 processing
user_message_locks = defaultdict(asyncio.Lock)

def is_user_authorized(update: Update) -> bool:
    """Checks if the incoming Telegram user's username is authorized."""
    user = update.effective_user
    if not user or not user.username:
        return False
    username_clean = user.username.strip().lower()
    return username_clean in [u.lower() for u in ALLOWED_TELEGRAM_USERNAMES]

async def send_split_message(update: Update, text: str):
    """Sends message in chunks <= 4000 characters to prevent Telegram API BadRequest errors."""
    if not text:
        text = "No response generated."

    max_len = 4000
    if len(text) <= max_len:
        await update.message.reply_text(text, reply_to_message_id=update.message.message_id)
        return

    # Split by newlines safely
    chunks = []
    lines = text.split("\n")
    current_chunk = ""
    for line in lines:
        if len(current_chunk) + len(line) + 1 > max_len:
            if current_chunk:
                chunks.append(current_chunk.strip())
                current_chunk = ""
            while len(line) > max_len:
                chunks.append(line[:max_len])
                line = line[max_len:]
            current_chunk = line + "\n"
        else:
            current_chunk += line + "\n"
    if current_chunk.strip():
        chunks.append(current_chunk.strip())

    for chunk in chunks:
        await update.message.reply_text(chunk, reply_to_message_id=update.message.message_id)

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

    user_id = update.effective_user.id if update.effective_user else "default"

    # Acquire lock for this user to ensure sequential message handling 1-by-1 without race conditions
    async with user_message_locks[user_id]:
        await update.message.reply_chat_action("typing")
        try:
            # Run AI agent processing in a separate thread so asyncio event loop is never blocked
            reply_text = await asyncio.to_thread(process_user_message_with_agent, text)
            await send_split_message(update, reply_text)
        except Exception as e:
            logger.error(f"Error processing message with AI Agent: {e}", exc_info=True)
            await update.message.reply_text(
                "⚠️ Something went wrong while processing this message. Please try sending it again!",
                reply_to_message_id=update.message.message_id
            )

def start_telegram_bot_app():
    app = ApplicationBuilder().token(TELEGRAM_BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_incoming_message))
    logger.info("Telegram Bot service initialized.")
    return app

