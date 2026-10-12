#!/bin/bash
# Daleel-e-Haq (دلیلِ حق) — Startup Script
# Starts both the backend API server and the frontend dev server

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
VENV_PYTHON="$BACKEND_DIR/.venv/bin/python3"
VENV_UVICORN="$BACKEND_DIR/.venv/bin/uvicorn"

echo ""
echo "┌──────────────────────────────────────────────┐"
echo "│         دلیلِ حق  — Daleel-e-Haq             │"
echo "│          Evidence of Truth v1.0               │"
echo "└──────────────────────────────────────────────┘"
echo ""

# Validate virtual environment
if [ ! -f "$VENV_PYTHON" ]; then
    echo "❌  Python venv not found at $BACKEND_DIR/.venv"
    echo "    Run: python3 -m venv $BACKEND_DIR/.venv"
    echo "    Then: $BACKEND_DIR/.venv/bin/pip install -r $BACKEND_DIR/requirements.txt"
    exit 1
fi

# Validate .env
if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo "⚠️   .env file not found. Copying from .env.example..."
    cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
    echo "    Please edit $PROJECT_DIR/.env and add your GEMINI_API_KEY"
fi

echo "🚀  Starting Backend API (port 8000)..."
cd "$BACKEND_DIR"
"$VENV_UVICORN" app.main:app --host 127.0.0.1 --port 8000 --reload &
BACKEND_PID=$!
echo "    Backend PID: $BACKEND_PID"

# Wait for backend to be ready
echo "⏳  Waiting for backend to initialize..."
for i in $(seq 1 20); do
    if curl -sf http://127.0.0.1:8000/api/health > /dev/null 2>&1; then
        echo "✅  Backend is healthy!"
        break
    fi
    sleep 1
done

echo ""
echo "🌐  Starting Frontend (port 5173)..."
cd "$FRONTEND_DIR"
npm run dev &
FRONTEND_PID=$!
echo "    Frontend PID: $FRONTEND_PID"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅  Daleel-e-Haq is running!"
echo ""
echo "   🌐 Frontend:  http://localhost:5173"
echo "   🔌 API Docs:  http://localhost:8000/docs"
echo "   📊 Health:    http://localhost:8000/api/health"
echo ""
echo "   Press Ctrl+C to stop all servers."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Wait and cleanup on Ctrl+C
trap "echo ''; echo '🛑  Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'; exit 0" INT TERM
wait
