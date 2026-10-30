FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 WEB_ROOT=/app/web DATABASE_PATH=/app/data/luna.sqlite3
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && useradd -u 10001 -m luna && mkdir /app/data && chown luna:luna /app/data
COPY --chown=luna:luna backend/luna ./luna
COPY --chown=luna:luna web ./web
USER luna
CMD ["uvicorn", "luna.api:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
