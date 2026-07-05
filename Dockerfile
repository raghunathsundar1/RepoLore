# RepoLore — production image.
# IMPORTANT: run a SINGLE worker (the default below). Rate limits, SQLite job
# store, and BackgroundTasks are in-process; multiple workers would not share them.
FROM python:3.13-slim

# git is required for shallow-cloning repositories.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run as a non-root user; data/ holds the SQLite job store and generated bundles.
RUN useradd --create-home repolore \
    && mkdir -p /app/data/jobs \
    && chown -R repolore:repolore /app/data
USER repolore

# Persist generated bundles/jobs across restarts by mounting a volume here.
VOLUME ["/app/data"]

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=4).status==200 else 1)"

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
