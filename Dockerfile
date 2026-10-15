FROM python:3.11-slim

WORKDIR /app

# Ensure curl and socat for dual-port forwarding (8000 <-> 8080)
RUN apt-get update && apt-get install -y --no-install-recommends curl socat && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application code
COPY backend/ ./backend/

# Copy canonical Quran and Hadith corpus data needed at startup
COPY data/corpus/ ./data/corpus/

ENV HOST=0.0.0.0
ENV PORT=8080
ENV PYTHONUNBUFFERED=1

EXPOSE 8000 8080

CMD ["sh", "-c", "if [ \"${PORT:-8080}\" != \"8000\" ]; then socat TCP-LISTEN:8000,fork,reuseaddr TCP:127.0.0.1:${PORT:-8080} & fi; cd backend && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
