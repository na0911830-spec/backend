import pymysql
import logging
from bot_system.config import MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB

logger = logging.getLogger(__name__)

def get_db_connection():
    """Establishes an SSL-enabled MySQL connection to TiDB Cloud set to Indian Standard Time (IST +05:30)."""
    conn = pymysql.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        database=MYSQL_DB,
        ssl={"ssl_mode": "VERIFY_IDENTITY"},
        autocommit=True,
        cursorclass=pymysql.cursors.DictCursor
    )
    with conn.cursor() as cursor:
        cursor.execute("SET time_zone = '+05:30'")
    return conn

def init_db():
    """Initializes tables in TiDB MySQL database."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # 1. Submissions Table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS submissions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    phone_number VARCHAR(30),
                    gift_card_name VARCHAR(100),
                    gift_card_code TEXT,
                    payment_method VARCHAR(50),
                    payment_details VARCHAR(255),
                    total_amount DECIMAL(10,2) DEFAULT 0.00,
                    currency VARCHAR(10) DEFAULT 'Rs.',
                    raw_message TEXT,
                    card_type VARCHAR(20) DEFAULT 'NEW',
                    platform VARCHAR(50) DEFAULT 'test1',
                    slot VARCHAR(50) DEFAULT 'test1',
                    order_id VARCHAR(100) DEFAULT '',
                    status ENUM('unpaid', 'paid', 'listed', 'sold', 'rejected') DEFAULT 'unpaid',
                    payout_term_days INT DEFAULT 6,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_phone (phone_number),
                    INDEX idx_code (gift_card_code(255)),
                    INDEX idx_status (status),
                    INDEX idx_created (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)

            cursor.execute("""
                ALTER TABLE submissions ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'Rs.';
            """)

            # 2. Scammers & Duplicate Blacklist Table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS scammers (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    phone_number VARCHAR(30),
                    gift_card_name VARCHAR(100) DEFAULT 'FLAGGED / DUPLICATE',
                    payment_details VARCHAR(255),
                    reason VARCHAR(255),
                    flagged_code TEXT,
                    total_amount DECIMAL(10,2) DEFAULT 0.00,
                    card_type VARCHAR(20) DEFAULT 'NEW',
                    platform VARCHAR(50) DEFAULT 'test1',
                    slot VARCHAR(50) DEFAULT 'test1',
                    order_id VARCHAR(100) DEFAULT '',
                    c_status VARCHAR(20) DEFAULT 'ununsold',
                    status VARCHAR(20) DEFAULT 'flagged',
                    in_old_db TINYINT(1) DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_scam_phone (phone_number),
                    INDEX idx_scam_upi (payment_details)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)

            # 3. Dynamic App Config Table for Platforms and Slots
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS app_config (
                    config_key VARCHAR(50) PRIMARY KEY,
                    config_value JSON,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)

            # Seed default values for platforms and slots if not existing
            cursor.execute("""
                INSERT IGNORE INTO app_config (config_key, config_value) VALUES
                ('platforms', '["test1", "test2", "test3"]'),
                ('slots', '["test1", "test2", "test3"]');
            """)
            logger.info("Database schema verified/initialized successfully.")
    except Exception as e:
        logger.error(f"Error initializing DB: {e}")
        raise e
    finally:
        conn.close()

    try:
        from bot_system.services.backfill_old_csv import backfill_old_csv_flags
        backfill_old_csv_flags()
    except Exception as e:
        logger.error(f"Error in automatic backfill: {e}")
