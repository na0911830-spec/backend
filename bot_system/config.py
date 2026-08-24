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

# Groq AI Credentials & Model (supports gkey1, gkey2, gkey3..., or GROQ_API_KEYS)
groq_list = []
for i in range(1, 10):
    k_val = os.environ.get(f"gkey{i}", "").strip()
    if k_val:
        groq_list.append(k_val)

groq_env_str = os.environ.get("GROQ_API_KEYS", "")
if groq_env_str:
    groq_list.extend([k.strip() for k in groq_env_str.split(",") if k.strip()])

GROQ_API_KEYS = list(dict.fromkeys(groq_list))
GROQ_API_KEY = GROQ_API_KEYS[0] if GROQ_API_KEYS else ""
GROQ_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b")

# Cloudflare Workers AI Credentials (supports cft or CF_API_TOKEN)
CF_ACCOUNT_ID = os.environ.get("CF_ACCOUNT_ID", "a96e56336d23c37c05cc3d3a6dcf65c8")
CF_API_TOKEN = os.environ.get("cft", "").strip() or os.environ.get("CF_API_TOKEN", "").strip()
CF_MODEL = os.environ.get("CF_MODEL", "@cf/zai-org/glm-4.7-flash")

# TiDB MySQL Connection URL & Settings
MYSQL_HOST = os.environ.get("MYSQL_HOST", "gateway01.ap-southeast-1.prod.aws.tidbcloud.com")
MYSQL_PORT = int(os.environ.get("MYSQL_PORT", 4000))
MYSQL_USER = os.environ.get("MYSQL_USER", "3D94CFV3HY22g7v.root")
MYSQL_PASSWORD = os.environ.get("MYSQL_PASSWORD", "yM5hZAgahW9O6tmb")
MYSQL_DB = os.environ.get("MYSQL_DB", "ca_squad")

# Web Server Settings
WEB_PORT = int(os.environ.get("PORT", 8080))

# GitHub Backup Token & Repository
GH_PAT = os.environ.get("gh", "").strip()
GH_REPO = os.environ.get("GH_REPO", "na0911830-spec/gcvx_backup").strip()
