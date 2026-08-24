import os
import time
os.environ['TZ'] = 'Asia/Kolkata'
if hasattr(time, 'tzset'):
    time.tzset()

import sys
import logging
import asyncio
import threading
import urllib.request
from bot_system.db.connection import init_db
from bot_system.bot.telegram_bot import start_telegram_bot_app
from bot_system.web.app import run_web_app

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("main")

PING_URL = "https://laughing-octo-funicular-hz51.onrender.com/"

def ping_worker_thread():
    logger.info(f"Starting keep-alive ping worker thread for {PING_URL} (interval: 45s)...")
    while True:
        try:
            req = urllib.request.Request(PING_URL, headers={"User-Agent": "Mozilla/5.0 (KeepAlivePing/1.0)"})
            with urllib.request.urlopen(req, timeout=10) as response:
                logger.info(f"Keep-alive ping to {PING_URL} successful. Status: {response.status}")
        except Exception as e:
            logger.warning(f"Keep-alive ping to {PING_URL} failed: {e}")
        time.sleep(45)

def start_web_server_thread():
    logger.info("Starting Simple HTML Dashboard Web Server on port 8080...")
    run_web_app()

async def main():
    logger.info("Initializing TiDB MySQL Database Schema...")
    init_db()

    # Launch Simple HTML Web Server in daemon thread
    web_thread = threading.Thread(target=start_web_server_thread, daemon=True)
    web_thread.start()

    # Launch keep-alive ping thread
    ping_thread = threading.Thread(target=ping_worker_thread, daemon=True)
    ping_thread.start()

    # Launch Telegram Bot asyncio loop
    logger.info("Starting Telegram Bot worker...")
    telegram_app = start_telegram_bot_app()
    
    await telegram_app.initialize()
    await telegram_app.start()
    await telegram_app.updater.start_polling()

    logger.info("Standalone Python AI Worker & Simple HTML Web App are fully operational!")

    # Keep application always running 
    while True:
        await asyncio.sleep(3600)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Shutting down worker process...")
