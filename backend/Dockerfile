# ---- Build Stage ----
FROM python:3.12-slim AS builder

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# ---- Runtime Stage ----
FROM python:3.12-slim

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY . .

# Cloud Run sets $PORT. Default to 8000 for local testing.
ENV PLARES_HOST=0.0.0.0
ENV PORT=8000

EXPOSE 8080

# Use PORT env var at runtime (Cloud Run injects PORT=8080)
CMD ["sh", "-c", "PLARES_PORT=${PORT:-8000} python -m ai_core.main"]
