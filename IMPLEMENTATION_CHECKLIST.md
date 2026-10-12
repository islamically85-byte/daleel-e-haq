# Daleel-e-Haq (دلیلِ حق) — Phase 1 Implementation Checklist

**Date:** 10 October 2026  
**Developer:** Zevrako  
**Project:** Daleel-e-Haq (Evidence of Truth)  
**Phase 1 Goal:** Fully functional, testable AI prototype with verified religious references, persistent data, and clean professional interface.

---

## Architectural & Blueprint Update for Phase 1
- **Reasoning Engine Update:** The original research blueprint (`Daleel-e-Haq_Research_Blueprint.md`) proposed an offline local model (e.g., Ollama / Qwen) as the initial engine. For Phase 1, development has transitioned to the official **Google Gemini API** (`gemini-3.8-flash` via `google-genai` SDK) for fast, capable reasoning. Local model inference is intentionally deferred to Phase 2.
- **Local Sovereignty:** The Quran and Hadith evidence database, search indexes (SQLite FTS5), conversation history, debate claim ledger, and application backend remain **strictly local**.
- **Transparency Mode:** The application honestly discloses its operational status as **Online AI Mode** while Gemini is active. All prompts sent to the reasoning engine disclose that reasoning queries transit Google servers, while canonical scripture retrieval and citation verification happen 100% locally.

---

## Implementation Checklist

### 1. Project Scaffolding & Configuration
- [ ] Initialize repository structure (`frontend/`, `backend/`, `data/`, `docs/`, `scripts/`).
- [ ] Configure root `.gitignore` to protect `.env`, SQLite DB files, uploaded media, node_modules, and Python venvs.
- [ ] Create `.env.example` with clear instructions for `GEMINI_API_KEY` and server configuration.
- [ ] Configure local backend `.env` securely.

### 2. Backend Architecture (FastAPI + Python 3.13)
- [ ] Setup Python virtual environment (`.venv`) with `fastapi`, `uvicorn`, `pydantic`, `google-genai`, `pytest`, `httpx`.
- [ ] Implement configuration module (`app/config.py`).
- [ ] Implement database initialization and migrations (`app/db/`):
  - SQLite tables: `quran_verses`, `quran_surahs`, `hadith_records`, `conversations`, `messages`, `debates`, `debate_claims`, `review_queue`.
  - SQLite FTS5 virtual tables: `quran_fts`, `hadith_fts`.
- [ ] Implement AI Provider abstraction (`app/providers/base.py`):
  - Provider 1: Gemini API (`app/providers/gemini.py`) with `gemini-3.8-flash`, error classification, structured JSON, timeout/retry handling.
  - Provider 2: Local AI stub (`app/providers/local_stub.py`) clearly marked "Planned — Not Installed".
- [ ] Implement Evidence Library (`app/evidence/`):
  - Canonical Tanzil Quran text importer (Simple Arabic Version 1.1 with CC-BY 3.0 attribution + SHA-256 verification + 6,236 verses).
  - Urdu translation importer (Fateh Muhammad Jalandhari) and English translation importer (Saheeh International).
  - Hadith schema, importer, and source management with collection, edition, grading attribution, and review state.
  - Text normalization (Arabic diacritics removal for search, Urdu normalization).
  - Fast FTS5 search & exact reference lookup (`quran:{surah}:{ayah}`).
- [ ] Implement Citation Verification Engine (`app/evidence/verifier.py`):
  - Independent validation of candidate source IDs against SQLite.
  - Quoted Arabic text verification against stored canonical verses.
  - Rejection of fabricated/nonexistent citations.
  - Transparent fallback message when evidence is insufficient: *"I cannot verify this claim from the approved Quran and Hadith sources currently available in Daleel-e-Haq."*
- [ ] Implement Chat Workflow (`app/api/chat.py`):
  - User question -> source retrieval -> Gemini reasoning with verified sources -> post-verification -> response with evidence cards.
- [ ] Implement Debate Engine (`app/debate/`):
  - Claim extraction, argument separation, evidence retrieval, verification, and point-by-point rebuttal report.
- [ ] Implement Persistent Memory (`app/memory/`):
  - Conversation CRUD (create, retrieve, list, rename, delete).
  - Debate report persistence.
  - Review queue foundation for unresolved/difficult claims.
- [ ] Implement REST Endpoints:
  - `GET /api/health`
  - `GET /api/providers`
  - `GET /api/providers/status`
  - `POST /api/chat`
  - `GET /api/conversations`
  - `GET /api/conversations/{id}`
  - `DELETE /api/conversations/{id}`
  - `POST /api/debates/analyze`
  - `GET /api/debates/{id}`
  - `GET /api/sources/status`
  - `GET /api/sources/search`
  - `GET /api/sources/quran/{surah}/{ayah}`

### 3. Frontend Architecture (React + TypeScript + Vite)
- [ ] Scaffold Vite + React + TypeScript in `frontend/`.
- [ ] Design System & Styling:
  - Palette: Charcoal/navy backgrounds (`#0B0F17`, `#121824`), muted emerald accents (`#10B981`, `#059669`), warm off-white text (`#F3F4F6`), subtle gold highlights (`#F59E0B`).
  - Typography: Native Urdu fonts (`Noto Nastaliq Urdu`, `Jameel Noori Nastaleeq`, system Arabic/Urdu fallbacks) and crisp English typography (`Inter`, system UI).
  - Full bidirectional support (LTR for English, RTL for Urdu).
- [ ] Primary Navigation:
  - **Ask AI**: Conversational interface, source citation cards, copy, stop/cancel, image attachment, RTL/LTR toggle.
  - **Debate**: Text debate analysis, point-by-point report, numbered claims, evidence badges, save/copy report.
  - **Library**: Quran & Hadith search, exact verse lookup, Arabic original text view with translation, provenance and license metadata.
- [ ] Secondary Navigation / Views:
  - **History**: Conversation list, reopen, rename, delete.
  - **Settings**: Online AI status, model name (`gemini-3.8-flash`), connection test action, Local AI "Planned — Not Installed" disabled state, language settings, data privacy disclosure.
  - **Review Queue**: Pending unverified claims inspection.

### 4. Verification, Testing & Quality Assurance
- [ ] Automated Backend Tests (`pytest`):
  - Configuration & missing API key behavior.
  - Provider error handling & classification.
  - Exact Quran retrieval (valid & invalid references).
  - Citation verification engine (accept valid IDs, reject fabricated references).
  - SQLite persistence for conversations, debates, and memory.
  - Input validation and malicious prompt injection resistance.
- [ ] Live Integration Verification:
  - Test live Gemini API request using configured key.
  - Verify full pipeline: question -> retrieval -> reasoning -> citation verification -> storage.
- [ ] Frontend Build & Lint Verification:
  - TypeScript type check (`tsc`).
  - Vite production build (`npm run build`).
- [ ] Responsive & RTL Audit:
  - Desktop, tablet, mobile viewports.
  - Urdu RTL layout, source numbers readability, bidi alignment.
