"""Run the home backend and polling bot with one Python installation."""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]
SETTING_NAMES = {
    "BOT_TOKEN", "ADMIN_IDS", "SUPPORT_USERNAME", "MINI_APP_URL", "TERMS_URL",
    "PRIVACY_URL", "SALES_ENABLED", "STARS_MONTHLY_PRICE", "AVAILABLE_LOCATIONS",
    "ALLOWED_ORIGINS", "DATABASE_PATH", "WEB_ROOT",
}


def init_settings(path):
    if path.exists():
        return
    template = (ROOT / ".env.example").read_text(encoding="utf-8")
    template = template.replace("DATABASE_PATH=/app/data/luna.sqlite3", "DATABASE_PATH=data/luna.sqlite3")
    template = template.replace("WEB_ROOT=/app/web", "WEB_ROOT=web")
    with path.open("x", encoding="utf-8") as output:
        output.write(template)
    if os.name != "nt":
        path.chmod(0o600)
    print("Created .env. Fill BOT_TOKEN and SUPPORT_USERNAME locally.", flush=True)


def local_environment(path):
    env = os.environ.copy()
    for number, line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name, separator, value = line.partition("=")
        name, value = name.strip(), value.strip()
        if not separator or name not in SETTING_NAMES:
            raise ValueError(f"Unknown or invalid setting on .env line {number}")
        if value.startswith(("'", '"')):
            if len(value) < 2 or value[-1] != value[0]:
                raise ValueError(f"Unclosed quote on .env line {number}")
            value = value[1:-1]
        env[name] = value
    # The same archive also supports Docker. Translate only its default paths.
    for name, container_default, local_default in (
        ("DATABASE_PATH", "/app/data/luna.sqlite3", "data/luna.sqlite3"),
        ("WEB_ROOT", "/app/web", "web"),
    ):
        value = env.get(name) or local_default
        if value == container_default:
            value = local_default
        location = Path(value).expanduser()
        env[name] = str(location if location.is_absolute() else ROOT / location)
    env["PYTHONPATH"] = str(ROOT / "backend")
    env["PYTHONUNBUFFERED"] = "1"
    return env


def stop(children):
    for child in children:
        if child.poll() is None:
            child.terminate()
    for child in children:
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait()


def run(env, api_only=False):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind(("127.0.0.1", 8000))
        except OSError:
            raise ValueError("Port 8000 is already in use. Stop the previous Luna/Docker process first.")
    children = []
    try:
        api = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "luna.api:app", "--host", "127.0.0.1",
             "--port", "8000", "--no-access-log"], cwd=ROOT, env=env,
        )
        children.append(api)
        deadline = time.monotonic() + 20
        while True:
            if api.poll() is not None:
                raise ValueError("Backend failed to start. Read the error above.")
            try:
                with urlopen("http://127.0.0.1:8000/api/health", timeout=0.5) as response:
                    if json.load(response).get("ok") is True:
                        break
            except (URLError, OSError, ValueError):
                pass
            if time.monotonic() >= deadline:
                raise ValueError("Backend did not become ready within 20 seconds.")
            time.sleep(0.2)
        if not api_only:
            children.append(subprocess.Popen([sys.executable, "-m", "luna.bot"], cwd=ROOT, env=env))
        print("LUNA is running. Cabinet: http://127.0.0.1:8000/app/", flush=True)
        print("Keep this window open. Ctrl+C stops Luna; the database is preserved.", flush=True)
        while True:
            for child in children:
                if child.poll() is not None:
                    raise ValueError("A Luna process stopped. Read the error above, then restart START_LUNA.cmd.")
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nStopping Luna...", flush=True)
    finally:
        stop(children)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--init", action="store_true", help="Create .env only when missing")
    parser.add_argument("--check", action="store_true", help="Validate without contacting Telegram")
    parser.add_argument("--api-only", action="store_true", help="Run backend without a polling bot")
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    args = parser.parse_args()
    if sys.version_info < (3, 12):
        print("Install Python 3.12 or newer.", file=sys.stderr)
        return 1
    try:
        init_settings(args.env_file)
        if args.init:
            return 0
        env = local_environment(args.env_file)
        os.environ.update(env)
        sys.path.insert(0, str(ROOT / "backend"))
        from luna.core import Settings
        if not args.api_only:
            try:
                settings = Settings()
            except (TypeError, ValueError):
                raise ValueError("Check numeric ADMIN_IDS and STARS_MONTHLY_PRICE in .env.") from None
            settings.validate()
        if not Path(env["WEB_ROOT"]).joinpath("app", "index.html").is_file():
            raise ValueError("Mini App files are missing. Use the full LUNA_Project_Source.zip archive.")
        if args.check:
            print("Settings and Mini App files: OK. No Telegram requests were sent.")
            return 0
        run(env, args.api_only)
        return 0
    except ImportError:
        print("Install dependencies first: run INSTALL_WINDOWS.cmd.", file=sys.stderr)
    except (OSError, ValueError) as error:
        # Values from .env and Telegram profile URLs are never printed.
        if isinstance(error, ValueError):
            print(str(error), file=sys.stderr)
        else:
            print("Cannot read settings or start Luna. Check file paths and permissions.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
