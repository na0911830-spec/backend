import os
from pathlib import Path

# Load local .env file if present
env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(env_path)
    except ImportError:
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip("'\""))

# Telegram Bot Token & Access Control
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "8689128856:AAEXXeVEFCd_KsrHvmkCvzL0-A8uYGFEdcA")
ALLOWED_TELEGRAM_USERNAMES = ["shashwat7128", "gcx_onexx"]

# Groq AI Credentials & Model (supports gkey1, gkey2, or GROQ_API_KEYS)
g1 = os.environ.get("gkey1", "").strip()
g2 = os.environ.get("gkey2", "").strip()
groq_env_str = os.environ.get("GROQ_API_KEYS", "")

groq_list = []
if g1: groq_list.append(g1)
if g2: groq_list.append(g2)
if groq_env_str:
    groq_list.extend([k.strip() for k in groq_env_str.split(",") if k.strip()])

if not groq_list:
    groq_list = [
        "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",
        "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"
    ]

GROQ_API_KEYS = list(dict.fromkeys(groq_list))
GROQ_API_KEY = GROQ_API_KEYS[0] if GROQ_API_KEYS else ""
GROQ_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b")

# Cloudflare Workers AI Credentials (supports cft or CF_API_TOKEN)
CF_ACCOUNT_ID = os.environ.get("CF_ACCOUNT_ID", "a96e56336d23c37c05cc3d3a6dcf65c8")
CF_API_TOKEN = os.environ.get("cft", "").strip() or os.environ.get("CF_API_TOKEN", "cfat_NOLLWE7UfAW0waWdBjXFwOaW7u0OXU11IQMviyfY11aeb0fb").strip()
CF_MODEL = os.environ.get("CF_MODEL", "@cf/zai-org/glm-4.7-flash")

# TiDB MySQL Connection URL & Settings
MYSQL_HOST = os.environ.get("MYSQL_HOST", "gateway01.ap-southeast-1.prod.aws.tidbcloud.com")
MYSQL_PORT = int(os.environ.get("MYSQL_PORT", 4000))
MYSQL_USER = os.environ.get("MYSQL_USER", "3D94CFV3HY22g7v.root")
MYSQL_PASSWORD = os.environ.get("MYSQL_PASSWORD", "yM5hZAgahW9O6tmb")
MYSQL_DB = os.environ.get("MYSQL_DB", "ca_squad")

# Web Server Settings
WEB_PORT = int(os.environ.get("PORT", 8080))
