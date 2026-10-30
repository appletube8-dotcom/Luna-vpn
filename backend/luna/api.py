import os
import time
from pathlib import Path
from fastapi import FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .core import Settings, Store, validate_init_data


def create_app(settings=None, store=None):
    cfg = settings or Settings()
    db = store or Store(cfg.db_path)
    app = FastAPI(title="LUNA CORE", docs_url=None, redoc_url=None, openapi_url=None)
    if cfg.origins:
        app.add_middleware(CORSMiddleware, allow_origins=cfg.origins, allow_methods=["GET"], allow_headers=["X-Telegram-Init-Data"])

    @app.middleware("http")
    async def security(request, call_next):
        r = await call_next(request)
        r.headers["X-Content-Type-Options"] = "nosniff"
        r.headers["Referrer-Policy"] = "no-referrer"
        if request.url.path.startswith("/api/"):
            r.headers["Cache-Control"] = "no-store"
        return r

    def identity(raw):
        try:
            return validate_init_data(raw or "", cfg.token, cfg.auth_max_age)
        except (ValueError, TypeError, KeyError):
            raise HTTPException(401, "Откройте кабинет заново через Telegram-бота.")

    @app.get("/api/health")
    def health():
        return {"ok": True, "mode": "manual-provisioning", "sales_enabled": cfg.sales}

    @app.get("/api/me")
    def me(x_telegram_init_data: str | None = Header(default=None)):
        uid = identity(x_telegram_init_data)
        db.user(uid)
        return db.status(uid)

    @app.get("/api/config")
    def config(x_telegram_init_data: str | None = Header(default=None)):
        url = db.config(identity(x_telegram_init_data))
        if not url:
            raise HTTPException(404, "Активный профиль пока не выдан.")
        return {"subscription_url": url}

    @app.get("/api/locations")
    def locations():
        # Configure only tested nodes. Empty is intentional until the operator tests them.
        return {"locations": [x.strip() for x in os.getenv("AVAILABLE_LOCATIONS", "").split(",") if x.strip()]}

    web = Path(os.getenv("WEB_ROOT", "/app/web"))
    if web.is_dir():
        app.mount("/", StaticFiles(directory=web, html=True), name="web")
    return app


app = create_app()
