import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit


def https_url(value: str) -> bool:
    u = urlsplit(value)
    return u.scheme == "https" and bool(u.hostname) and not u.username and not u.password


@dataclass
class Settings:
    token: str = field(default_factory=lambda: os.getenv("BOT_TOKEN", ""))
    admins: tuple = field(default_factory=lambda: tuple(int(x.strip()) for x in os.getenv("ADMIN_IDS", "").split(",") if x.strip()))
    db_path: str = field(default_factory=lambda: os.getenv("DATABASE_PATH", "./data/luna.sqlite3"))
    mini_app_url: str = field(default_factory=lambda: os.getenv("MINI_APP_URL", ""))
    support: str = field(default_factory=lambda: os.getenv("SUPPORT_USERNAME", "").lstrip("@"))
    terms: str = field(default_factory=lambda: os.getenv("TERMS_URL", ""))
    privacy: str = field(default_factory=lambda: os.getenv("PRIVACY_URL", ""))
    sales: bool = field(default_factory=lambda: os.getenv("SALES_ENABLED", "false").lower() == "true")
    stars: int = field(default_factory=lambda: int(os.getenv("STARS_MONTHLY_PRICE", "0")))
    origins: list = field(default_factory=lambda: [x.strip() for x in os.getenv("ALLOWED_ORIGINS", "").split(",") if x.strip()])
    auth_max_age: int = 3600

    def validate(self):
        if not self.token:
            raise ValueError("BOT_TOKEN is required")
        if self.mini_app_url and not https_url(self.mini_app_url):
            raise ValueError("MINI_APP_URL must use HTTPS")
        if self.sales and not (self.admins and self.stars > 0 and self.support and https_url(self.terms) and https_url(self.privacy)):
            raise ValueError("Sales require ADMIN_IDS, STARS_MONTHLY_PRICE, SUPPORT_USERNAME, TERMS_URL and PRIVACY_URL")


def validate_init_data(raw: str, token: str, max_age=3600, now=None) -> int:
    """Telegram's bot-token HMAC validation; never trust initDataUnsafe."""
    if not token or not raw or len(raw) > 16384:
        raise ValueError("Missing authorization")
    pairs = parse_qsl(raw, keep_blank_values=True, strict_parsing=True)
    if len({k for k, _ in pairs}) != len(pairs):
        raise ValueError("Duplicate fields")
    data = dict(pairs)
    supplied = data.pop("hash", "")
    check = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not supplied or not hmac.compare_digest(expected, supplied):
        raise ValueError("Invalid signature")
    current = int(time.time() if now is None else now)
    auth_date = int(data.get("auth_date", "0"))
    if not auth_date or current - auth_date > max_age or auth_date - current > 30:
        raise ValueError("Authorization expired; reopen Mini App")
    uid = json.loads(data.get("user", "{}")).get("id")
    if type(uid) is not int or uid <= 0:
        raise ValueError("Invalid user")
    return uid


class Store:
    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as c:
            c.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, created_at INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS access(user_id INTEGER PRIMARY KEY, config_url TEXT, expires_at INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, amount INTEGER NOT NULL,
                created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'new', charge_id TEXT UNIQUE);
            CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS outbox(id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER NOT NULL,
                text TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0);
            """)
        try:
            os.chmod(self.path, 0o600)
        except OSError:
            pass

    @contextmanager
    def connection(self):
        c = sqlite3.connect(self.path, timeout=10)
        c.row_factory = sqlite3.Row
        try:
            with c:
                yield c
        finally:
            c.close()

    def user(self, uid):
        with self.connection() as c:
            c.execute("INSERT OR IGNORE INTO users VALUES(?,?)", (uid, int(time.time())))

    def status(self, uid):
        with self.connection() as c:
            r = c.execute("SELECT * FROM access WHERE user_id=?", (uid,)).fetchone()
            pending = c.execute("SELECT count(*) FROM orders WHERE user_id=? AND status='paid'", (uid,)).fetchone()[0]
        active = bool(r and r["config_url"] and r["expires_at"] > time.time())
        return {"user_id": uid, "active": active, "expires_at": r["expires_at"] if r else None,
                "has_config": active, "pending_provision": bool(pending)}

    def config(self, uid):
        with self.connection() as c:
            r = c.execute("SELECT * FROM access WHERE user_id=?", (uid,)).fetchone()
        return r["config_url"] if r and r["expires_at"] > time.time() else None

    def order(self, uid, amount):
        oid = secrets.token_urlsafe(18)
        with self.connection() as c:
            c.execute("INSERT INTO orders(id,user_id,amount,created_at) VALUES(?,?,?,?)", (oid, uid, amount, int(time.time())))
        return oid

    def can_pay(self, oid, uid, currency, amount):
        with self.connection() as c:
            r = c.execute("SELECT * FROM orders WHERE id=?", (oid,)).fetchone()
        return bool(r and r["user_id"] == uid and r["amount"] == amount and currency == "XTR"
                    and r["status"] == "new" and time.time() - r["created_at"] < 86400)

    def payment(self, oid, uid, currency, amount, charge, admins=()):
        if not charge:
            raise ValueError("Missing charge")
        with self.connection() as c:
            c.execute("BEGIN IMMEDIATE")
            duplicate = c.execute("SELECT * FROM orders WHERE charge_id=?", (charge,)).fetchone()
            if duplicate:
                if duplicate["id"] != oid or duplicate["user_id"] != uid:
                    raise ValueError("Payment identity mismatch")
                return False
            r = c.execute("SELECT * FROM orders WHERE id=?", (oid,)).fetchone()
            if not r or r["user_id"] != uid or r["amount"] != amount or currency != "XTR" or r["status"] != "new":
                raise ValueError("Payment mismatch")
            c.execute("UPDATE orders SET status='paid',charge_id=? WHERE id=?", (charge, oid))
            c.execute("INSERT INTO outbox(chat_id,text) VALUES(?,?)", (uid, "Оплата получена. Доступ готовит администратор. Статус — в разделе «Моя подписка». Если требуется помощь: /paysupport."))
            for admin in admins:
                c.execute("INSERT INTO outbox(chat_id,text) VALUES(?,?)",
                          (admin, f"Новая оплата LUNA: пользователь {uid}, {amount} Stars. Заказ {oid}. Настройте профиль в панели и выдайте через /grant."))
        return True

    def grant(self, uid, days, url, order_id=None):
        if not (0 < days <= 366 and uid > 0 and https_url(url)):
            raise ValueError("Expected positive user ID, 1–366 days and HTTPS subscription URL")
        self.user(uid)
        with self.connection() as c:
            c.execute("BEGIN IMMEDIATE")
            paid = c.execute("SELECT id FROM orders WHERE user_id=? AND status='paid'", (uid,)).fetchall()
            if paid and order_id not in {r['id'] for r in paid}:
                raise ValueError("Specify the paid order ID to fulfil")
            if order_id and order_id not in {r['id'] for r in paid}:
                raise ValueError("Order is not awaiting fulfilment")
            previous = c.execute("SELECT expires_at FROM access WHERE user_id=?", (uid,)).fetchone()
            expiry = max(int(time.time()), previous[0] if previous else 0) + days * 86400
            c.execute("INSERT INTO access VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET config_url=excluded.config_url,expires_at=excluded.expires_at", (uid, url, expiry))
            if order_id:
                c.execute("UPDATE orders SET status='fulfilled' WHERE id=?", (order_id,))
            c.execute("INSERT INTO outbox(chat_id,text) VALUES(?,?)", (uid, "Доступ LUNA подготовлен. Откройте «Моя подписка» → «Получить доступ». Срок подключения указан в кабинете."))
        return expiry

    def refundable_order(self, oid):
        with self.connection() as c:
            r = c.execute("SELECT * FROM orders WHERE id=? AND status IN ('paid','fulfilled')", (oid,)).fetchone()
        return dict(r) if r else None

    def refunded(self, oid):
        with self.connection() as c:
            c.execute("UPDATE orders SET status='refunded' WHERE id=?", (oid,))

    def revoke(self, uid):
        with self.connection() as c:
            c.execute("DELETE FROM access WHERE user_id=?", (uid,))
        # The operator must also revoke the key in the VPN panel.

    def get_offset(self):
        with self.connection() as c:
            r = c.execute("SELECT value FROM state WHERE key='telegram_offset'").fetchone()
        return int(r[0]) if r else 0

    def set_offset(self, offset):
        with self.connection() as c:
            c.execute("INSERT INTO state VALUES('telegram_offset',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (str(offset),))
