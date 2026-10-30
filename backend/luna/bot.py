import asyncio
import html
import logging
import re
from datetime import datetime, timezone
import httpx
from .core import Settings, Store

log = logging.getLogger("luna")
MENU = {"keyboard": [[{"text": "Купить VPN"}, {"text": "Моя подписка"}],
                     [{"text": "Выбрать сервер"}, {"text": "Инструкция"}],
                     [{"text": "Поддержка"}]], "resize_keyboard": True}


class TelegramError(Exception):
    pass


class Bot:
    def __init__(self, cfg, db, client):
        self.cfg, self.db, self.client = cfg, db, client

    async def call(self, method, **data):
        response = await self.client.post(f"https://api.telegram.org/bot{self.cfg.token}/{method}", json=data)
        body = response.json()
        if not body.get("ok"):
            raise TelegramError(f"Telegram method {method} failed ({body.get('error_code', response.status_code)})")
        return body["result"]

    async def send(self, uid, text, keyboard=None):
        return await self.call("sendMessage", chat_id=uid, text=text, parse_mode="HTML",
                               reply_markup=keyboard or MENU)

    async def flush_outbox(self):
        with self.db.connection() as c:
            rows = c.execute("SELECT * FROM outbox WHERE sent=0 ORDER BY id LIMIT 20").fetchall()
        for row in rows:
            try:
                await self.send(row["chat_id"], row["text"])
                with self.db.connection() as c:
                    c.execute("UPDATE outbox SET sent=1 WHERE id=?", (row["id"],))
            except (httpx.HTTPError, TelegramError):
                # Keep the notification for retry. No tokens, profiles or customer text in logs.
                log.warning("Notification pending: outbox_id=%s", row["id"])

    async def purchase(self, uid):
        if not self.cfg.sales:
            return await self.send(uid, "LUNA VPN готовится к запуску. Продажи пока не открыты. Здесь появится месячная подписка с оплатой в Telegram Stars.")
        kb = {"inline_keyboard": [[{"text": "Условия", "url": self.cfg.terms}, {"text": "Конфиденциальность", "url": self.cfg.privacy}],
                                 [{"text": f"Принимаю условия · {self.cfg.stars} Stars", "callback_data": "invoice"}]]}
        return await self.send(uid, f"<b>LUNA Personal · 30 дней</b>\n\nСтоимость в Telegram: {self.cfg.stars} Stars.\nВыдача профиля — администратором после оплаты. Это разовая покупка без автосписания.\n\nОзнакомьтесь с условиями перед оплатой.", kb)

    async def instruction(self, uid):
        return await self.send(uid, "<b>Подключение LUNA</b>\n\n1. Установите Happ или Incy из официального магазина своего устройства.\n2. Получите личную ссылку в «Моя подписка».\n3. Импортируйте ссылку в приложение.\n4. Разрешите VPN-профиль и выберите доступный сервер.\n\nНе передавайте ссылку другим людям: она даёт доступ к вашей подписке. Кабинет Telegram сам VPN-соединение не создаёт.")

    async def subscription(self, uid):
        st = self.db.status(uid)
        if st["active"]:
            until = datetime.fromtimestamp(st["expires_at"], timezone.utc).strftime("%d.%m.%Y %H:%M UTC")
            kb = {"inline_keyboard": [[{"text": "Получить доступ", "callback_data": "config"}],
                                     [{"text": "Продлить", "callback_data": "buy"}]]}
            if self.cfg.mini_app_url:
                kb["inline_keyboard"].append([{"text": "Личный кабинет", "web_app": {"url": self.cfg.mini_app_url}}])
            return await self.send(uid, f"<b>Подписка активна</b>\nДо {until}\n\nПодключение выполняется в Happ / Incy.", kb)
        if st["pending_provision"]:
            return await self.send(uid, "Оплата получена. Администратор готовит профиль. Если доступ задерживается, откройте «Поддержка».")
        return await self.send(uid, "Активной подписки пока нет. Выберите «Купить VPN» или свяжитесь с поддержкой.")

    async def handle(self, update):
        pre = update.get("pre_checkout_query")
        if pre:
            ok = self.cfg.sales and self.db.can_pay(pre["invoice_payload"], pre["from"]["id"], pre["currency"], pre["total_amount"])
            await self.call("answerPreCheckoutQuery", pre_checkout_query_id=pre["id"], ok=bool(ok),
                            **({} if ok else {"error_message": "Счёт недействителен. Создайте новый через «Купить VPN»."}))
            return
        cb = update.get("callback_query")
        message = update.get("message") or (cb or {}).get("message")
        if not message or message["chat"]["type"] != "private":
            return
        uid = (cb["from"] if cb else message["from"])["id"]
        self.db.user(uid)
        if cb:
            await self.call("answerCallbackQuery", callback_query_id=cb["id"])
        payment = message.get("successful_payment")
        if payment:
            self.db.payment(payment["invoice_payload"], uid, payment["currency"], payment["total_amount"],
                            payment["telegram_payment_charge_id"], self.cfg.admins)
            return
        text = message.get("text", "")
        action = cb.get("data", "") if cb else text
        if action.startswith("/start"):
            kb = {"inline_keyboard": [[{"text": "Купить VPN", "callback_data": "buy"}],
                                     [{"text": "Моя подписка", "callback_data": "subscription"}, {"text": "Выбрать сервер", "callback_data": "servers"}],
                                     [{"text": "Инструкция", "callback_data": "help"}, {"text": "Поддержка", "callback_data": "support"}]]}
            if self.cfg.mini_app_url:
                kb["inline_keyboard"].append([{"text": "Открыть кабинет", "web_app": {"url": self.cfg.mini_app_url}}])
            await self.send(uid, "<b>LUNA VPN</b>\n\nЛичная подписка, доступы и помощь с подключением.\nВыберите действие:", kb)
        elif action in ("Купить VPN", "buy", "/buy"):
            await self.purchase(uid)
        elif action == "invoice":
            if not self.cfg.sales:
                return await self.purchase(uid)
            oid = self.db.order(uid, self.cfg.stars)
            await self.call("sendInvoice", chat_id=uid, title="LUNA Personal · 30 дней",
                            description="Личный VPN-доступ. Разовая покупка, профиль выдаёт администратор.",
                            payload=oid, currency="XTR", provider_token="",
                            prices=[{"label": "30 дней", "amount": self.cfg.stars}])
        elif action in ("Моя подписка", "subscription", "/subscription"):
            await self.subscription(uid)
        elif action == "config":
            url = self.db.config(uid)
            await self.send(uid, f"Личная ссылка подписки:\n<code>{html.escape(url)}</code>\n\nСкопируйте её в Happ / Incy. Ссылка конфиденциальна." if url else "Активный профиль пока не выдан.")
        elif action in ("Выбрать сервер", "servers"):
            await self.send(uid, "Выбор сервера выполняется в Happ / Incy после импорта вашей ссылки. Список в приложении обновляется из профиля подписки. Доступность каждой локации проверяется отдельно.")
        elif action in ("Инструкция", "help", "/help"):
            await self.instruction(uid)
        elif action in ("Поддержка", "support", "/support", "/paysupport"):
            if self.cfg.support:
                await self.send(uid, f"Поддержка LUNA: @{html.escape(self.cfg.support)}\nВаш ID: <code>{uid}</code>\n\nПри вопросах об оплате укажите дату и сумму. Ссылку доступа и данные карты отправлять не нужно.")
            else:
                await self.send(uid, f"Контакт поддержки ещё не настроен оператором.\nВаш ID: <code>{uid}</code>")
        elif action in ("/terms", "/privacy"):
            url = self.cfg.terms if action == "/terms" else self.cfg.privacy
            await self.send(uid, html.escape(url) if url else "Документы готовятся. Продажи отключены.")
        elif action == "/id":
            await self.send(uid, f"Ваш ID: <code>{uid}</code>")
        elif action.startswith("/grant ") and uid in self.cfg.admins:
            try:
                parts = action.split()
                if len(parts) not in (4, 5):
                    raise ValueError("Expected 4 or 5 arguments")
                _, who, days, url = parts[:4]
                expiry = self.db.grant(int(who), int(days), url, parts[4] if len(parts) == 5 else None)
                await self.send(uid, "Профиль выдан. Срок панели должен совпадать: " + datetime.fromtimestamp(expiry, timezone.utc).isoformat() +
                                "\nВажно: срок и лимит устройств в VPN-панели настраиваются отдельно.")
            except (ValueError, TypeError):
                await self.send(uid, "Формат: /grant ID 30 https://адрес-подписки [ID_ЗАКАЗА]\nДля оплаченного заказа его ID обязателен. Выдача продлевает действующий срок. Команда только в личном чате администратора.")
        elif action.startswith("/refund ") and uid in self.cfg.admins:
            oid = action.split(maxsplit=1)[1].strip()
            order = self.db.refundable_order(oid)
            if not order:
                return await self.send(uid, "Оплаченный заказ не найден или уже возвращён.")
            await self.call("refundStarPayment", user_id=order["user_id"], telegram_payment_charge_id=order["charge_id"])
            self.db.refunded(oid)
            await self.send(uid, "Возврат Stars проведён. Скорректируйте срок и доступ в VPN-панели. При полном отзыве выполните /revoke ID. Другие покупки пользователя учитывайте отдельно.")
        elif action.startswith("/revoke ") and uid in self.cfg.admins:
            try:
                self.db.revoke(int(action.split()[1]))
                await self.send(uid, "Ссылка убрана из кабинета. Обязательно отключите ключ в VPN-панели: эта команда сама туннель не отзывает.")
            except (ValueError, IndexError):
                await self.send(uid, "Формат: /revoke ID")
        else:
            await self.send(uid, "Выберите действие в меню. Для справки: /help.")


async def main():
    import os
    os.umask(0o077)
    cfg = Settings()
    cfg.validate()
    db = Store(cfg.db_path)
    async with httpx.AsyncClient(timeout=40) as client:
        bot = Bot(cfg, db, client)
        await bot.call("deleteWebhook", drop_pending_updates=False)
        await bot.call("setMyCommands", commands=[{"command": "start", "description": "Главное меню"},
                     {"command": "subscription", "description": "Моя подписка"},
                     {"command": "help", "description": "Подключение"},
                     {"command": "support", "description": "Поддержка"},
                     {"command": "paysupport", "description": "Вопросы об оплате"},
                     {"command": "terms", "description": "Условия"},
                     {"command": "privacy", "description": "Конфиденциальность"}])
        if cfg.mini_app_url:
            await bot.call("setChatMenuButton", menu_button={"type": "web_app", "text": "Кабинет", "web_app": {"url": cfg.mini_app_url}})
        log.info("LUNA bot started; sales=%s", cfg.sales)
        while True:
            try:
                await bot.flush_outbox()
                updates = await bot.call("getUpdates", offset=db.get_offset(), timeout=25,
                                         allowed_updates=["message", "callback_query", "pre_checkout_query"])
                for update in updates:
                    await bot.handle(update)
                    db.set_offset(update["update_id"] + 1)
            except (httpx.HTTPError, TelegramError):
                log.warning("Telegram temporarily unavailable; retrying")
                await asyncio.sleep(3)
            except Exception as exc:
                # Do not print exceptions containing request URLs or profiles.
                log.error("Update not processed (%s); offset retained", type(exc).__name__)
                await asyncio.sleep(3)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    asyncio.run(main())
