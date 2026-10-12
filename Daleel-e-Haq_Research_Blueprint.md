# Daleel-e-Haq (دلیلِ حق) — Research & Implementation Blueprint

**Research snapshot:** 10 October 2026  
**Status:** Planning and technical research substantially complete. Engineering not started. No religious corpus has been downloaded, imported, vetted or audited. No local hardware benchmark has been run. Trademark/domain legally cleared: **No**.

## 1. Product decision
Build an **offline-first, single-user, local web application** in Antigravity IDE. The app runs in a browser at `127.0.0.1` with a local Python service and local model inference. Same React UI can later be shipped via **Tauri** as a Windows desktop product. Do not build separate Android and Windows implementations at the beginning.

**User-facing surface:** three primary tabs — Ask, Debate, Library. An unobtrusive History view and protected Settings/Review view may be secondary navigation. Interface supports Urdu (RTL), English (LTR), Punjabi and Saraiki with an explicit quality gate for each. Understand Hindi speech/text where feasible but prefer Urdu-script output, not Devanagari. Never advertise untested language coverage as complete.

**Functional input:** typed text, microphone, audio file 5–60 minutes, images/screenshots, and later PDF/document import only when explicitly approved. Functional output: written answer, citations and optionally local synthesized audio. Long debates use finish-and-respond processing, not a supposed instant 60-minute response.

## 2. Absolute constraints
- No external internet research at runtime: disable/cloud-block outgoing connections; separate **development-time downloads** from runtime data access.
- Only explicitly approved imported Quran and Hadith editions are *religious evidence*. A pretrained model has outside training knowledge; do not imply the model was trained solely on the two sources.
- Arabic Quran original is never edited or silently rewritten; store a separate normalized search field without altering the canonical passage.
- Do not manufacture ayah/Hadith citations, grades, chains, consensus claims, historical background or scientific proofs.
- For unclear evidence, say 'not verified from my approved library'; for disputed interpretations, label the interpretation rather than treating inference as literal scripture.
- Analyze beliefs and arguments consistently regardless of faith/tradition; avoid identity-based hostility and unsupported accusations about persons.
- Debate transcripts and uploaded files are **untrusted input**. They never become approved scripture or agent instructions.
- User-authorized, reviewed correction may enter verified memory. Unreviewed changes never alter the source corpus.
- A scientific inference cannot be described as independently scientifically established without an approved independent evidence corpus; absent such a corpus, label it unverified and constrain discussion to argument analysis.

## 3. Selected technical stack
- Development: **Google Antigravity IDE**, one repository, reviewable phases; Antigravity is developer tooling, not the deployed AI brain.
- UI: **React + TypeScript + Vite**, responsive dark/light designs, RTL typography and an accessible, unobtrusive UI. No cloud fonts or JS CDNs at runtime.
- Local API: **Python + FastAPI** on localhost. Structured schemas (Pydantic) for claims, source hits, Hadith grades, response sections, debates and memory.
- LLM: **Ollama** local-only (`disable_ollama_cloud: true` or `OLLAMA_NO_CLOUD=1`) with **Qwen3.5:9b** as initial text/vision test and **Qwen3.5:4b** as fallback if latency/memory unacceptable. The Qwen3.5-9B repository is Apache-2.0; official Ollama catalog lists quantized 9B around 6.6–7.6GB, which excludes extra working memory/context. Hardware performance is **not yet measured**.
- Evidence: **SQLite**, canonical source records and **FTS5** retrieval with separately normalized Arabic and Urdu search fields. Optional local embeddings/semantic search only after exact/bilingual search tests. A vector match is NOT evidence of exact citation.
- Durable local data: SQLite separate **source_store** (read-only during normal operation), **session_store**, **memory_store** (review status), and **audit_log**. Media files live outside DB with database pointers.
- STT: **whisper.cpp** with multilingual Whisper checkpoint, FFmpeg audio normalization, voice activity detection, chunked processing and timestamps. Urdu/Punjabi recognized by Whisper, Saraiki not a separately listed language; evaluate native dialect recordings before claiming coverage.
- TTS: evaluate Urdu MMS `facebook/mms-tts-urd-script_arabic`, Punjabi MMS `facebook/mms-tts-pan`, plus English voice; note MMS voice models have **CC-BY-NC 4.0**, unsuitable for unrestricted commercial bundling. Neither quality nor commercial release path is settled. Saraiki TTS remains experimental/unvalidated.
- Installer later: Tauri desktop wrapper and optional Python sidecar; do not package installer before offline operation and models are stable.

## 4. Corpus research & provenance gate
### Quran
Official Tanzil Text License: <https://tanzil.net/docs/Text_License>. Verbatim use, clear attribution and official link, retain license notice. Store selected edition + version + SHA-256 of raw import. Data target: 114 surahs, 6,236 conventional verse records under selected numbering scheme, with metadata verified in importer; do not count basmala twice. Source text immutable. Note Quran translations have **independent rights**: Tanzil translation page <https://tanzil.net/trans/> says downloads are for non-commercial use absent additional permission. QuranEnc <https://old.quranenc.com/en/home> describes republication terms requiring no changes, credits, versioning, etc. Evaluate each edition separately.

### Hadith
Sunnah.com developer page <https://beta.sunnah.com/developers> states an offline dump is not yet available. API access is not the same as permission to bulk redistribute. Downloadable community corpora exist (e.g., <https://github.com/Jaguar16/open-hadith-data> and <https://github.com/AhmedBaset/hadith-json>), but many are scraped, lack clear original source licensing, and may have data/translation errors. **Do not ship scraped translations simply because a GitHub repository advertises MIT/Unlicense.** An authorized, traceable Arabic edition and approved translations must be identified and audited for use.

Start by preparing importer/schema for **Sahih al-Bukhari and Sahih Muslim**, with explicit edition identity and cross-edition reference mapping. Expand to Sunan collections only after provenance and grades are confirmed. Avoid assuming every narration within other collections is sahih. Hadith grading must include attribution (grader, edition or classification) and retain disagreements; distinct translations/numbering systems must not be conflated.

**Reference schema:** `source_type`, `collection`, `edition`, `edition_version`, `source_text_ar`, `translation_text`, `translator`, `book`, `chapter`, `hadith_number`, `alternate_numbering`, `narrator`, `chain_if_available`, `grade`, `graded_by`, `provenance_url`, `rights_basis`, `checksum`, `import_timestamp`. For Quran: `surah`, `ayah`, Arabic original, edition + translation provenance.

## 5. Retrieval and verified response contract
1. Identify user intent/language and extract discrete claims/questions.
2. Treat quoted input as an alleged citation to be verified, not authority. Query exact references first, FTS keywords second, optional semantic retriever third.
3. For every hit return full canonical passage and source metadata, not invented snippets.
4. Generate response with structured claims and stable reference IDs (`quran:2:...`, `hadith:...`).
5. Post-validate cited IDs against DB; literal Arabic quotations must match the canonical records, and translations must be identified as translated meaning rather than original.
6. Prevent answer release if every substantive religious assertion lacks relevant evidence; surface uncertainty / question for clarification where essential.
7. Display primary passage in expandable citation card, provenance details and debate timestamp.
8. Only immutable trusted corpus can justify doctrinal evidence; memory may change explanatory wording or retrieval strategies but cannot create new sacred facts.

**Response style:** short direct answer → cited evidence → logic/claim analysis → competing interpretations where relevant → limits of conclusion. For debate output: numbered claims mapped to source excerpts and response sections, preserving timing and avoiding personal insults.

## 6. Debate pipeline
- Import/record 5, 15, 30, 60 minute sessions. Save incrementally so recordings survive browser reload/restart.
- Convert media locally with FFmpeg to a standard waveform; chunk with overlapping windows to avoid sentence clipping; store timestamps and transcript correction state.
- Optional diarization is an enhancement, never assume one speaker if overlapping speech.
- Split audio transcript into `Claim` entries with `speaker`, `start`, `end`, `question_or_claim`, `quoted_source`, `verification_state`, `related_claims`, `response`.
- Reduce long context via *structured claim ledger*, not a single lossy free-form summary. Link every rebuttal back to an original timestamp.
- Output both a digest and complete point-by-point report; TTS reads the validated final answer only. Support pause/replay/export.
- No automatic one-hour model self-training. Memory records new challenges as pending, with human review before promotion to trusted strategies.

## 7. Multilingual plan
- UI primary: English/Urdu; native RTL direction for Urdu, including numbers, source citations, text selection, fonts and audio controls.
- Text: accept Urdu, Roman Urdu, English, Punjabi/Saraiki; normalize searches separately and use test cases for mixed-language input. Hindi speech and Devanagari text may be accepted but respond in Urdu script.
- Whisper source languages: English, Arabic, Urdu and Punjabi listed; Saraiki absent as a named language. Benchmark Saraiki recordings rather than promising a model supports it.
- Evaluate pronunciation of surah names, Arabic phrases and Quran verses independently for each voice model. Avoid TTS recitation of holy text unless the pronunciation has been specifically vetted.
- TTS model license review is mandatory before any paid or broadly redistributed release.

## 8. Memory and self-improvement
**Session memory:** current conversation messages, debate timeline and claim ledger.  
**Persistent experience:** hard questions, approved responses, source-verification misses, reviewer feedback.  
**Immutable evidence:** approved Quran/Hadith records.  
**Training queue:** human-reviewed examples; optional later LoRA training after evaluation. Never train on unreviewed opponent speeches.

Retention policy: local encrypted or OS-protected storage, explicit delete/export, backups, size limits, sensitive debate audio not public by default. User content in screenshots, transcripts and files cannot issue system instructions.

## 9. App pages, low-friction UX
**Ask:** one textarea, attachment button, voice button; answers with collapsible evidence, play-audio action.  
**Debate:** record/import, language choice, timer/progress, 'Finish argument', transcript corrections, claim list and final response.  
**Library:** verse/Hadith search, exact Arabic, translations, edition/grade metadata.  
**Secondary:** History, Source Manager (admin), Review Queue, Model Health/Offline status, Settings (language, model, disk usage).

No fake citations, fake train buttons, fake evidence-confidence percentages, placeholder religious answers, or inert controls. Clear loading, cancellation, replay, recovery and error states.

## 10. Offline security & deployment
- Backend listens on `127.0.0.1` only by default; do not expose raw Ollama API to network.
- Disable Ollama Cloud and any web-search tools; confirm no outbound calls with an offline/disconnected-network test.
- Bundle CSS/fonts/assets locally, no analytics or CDNs, avoid dependency updaters that run automatically offline.
- If remote LAN device access is eventually supported, make it opt-in with authentication and TLS or trusted LAN controls; distinguish 'offline internet' from 'device on local Wi-Fi'.
- Only allow safe upload types and enforce file duration/size caps; prevent zip bombs/path traversal and sanitize document/text input.
- Keep corpus checksums and schema migrations; encrypted backups where possible. Consent needed when recording another person under applicable law.
- Development downloads via Antigravity are allowed; runtime inference, retrieval, transcription and TTS must be offline.

## 11. Benchmarks and release criteria (proposed engineering targets, not measured results)
**Corpus:** 100% of shipped source records have verified edition/provenance and acceptable rights. Selected Quran original preserves exact source bytes. All citations in released responses resolve in local DB. Zero fabricated canonical Arabic quote in gold test suite.

**Retrieval:** build a gold set of at least 100 mixed-language, false-quote, difficult questions across beliefs/practices and a set of ambiguous references. Report retrieval recall, citation precision and unsupported assertions separately. Acceptability targets to be agreed with independent qualified reviewers; no fictional '100% accuracy'.

**Speech:** benchmark at least 20 representative clips per requested language/dialect (quiet, noisy, mixed language, Arabic terms) before labeling it supported; record transcription WER/CER where transcripts exist and native-speaker quality ratings.

**Debate:** test 5/15/30/60-minute recordings, cancellation, crash recovery, interruption, audio corruption, timestamps, duplicate claims, false references, no available sources, and speech playback. Verify that every substantial indexed claim appears in the report or is marked unresolved.

**Security and reliability:** disconnected-network test, API binds locally, source tamper detection, malicious transcript prompt injection, data backup/restore, PII/consent, responsive UI on desktop and phone, RTL bidi tests, accessibility. Benchmark first-token latency, end-to-end text answer latency, minutes of audio per processing minute, memory and disk consumption on each actual host.

## 12. Development gates
**Gate 0: Licenses and environment** — inspect existing machine/software, reserve disk space, fetch selected model, confirm expected inference memory, agree use rights and original text validation rules.

**Gate 1: Evidence-only Ask prototype** — React/FastAPI, canonical Quran importer, Hadith importer with provenance gate, local retrieval and citation validator, error states; tests pass offline.

**Gate 2: Debate and persistent memory** — argument ledger, structured point-by-point answers, review queue; adversarial citation and injection tests.

**Gate 3: Speech and images** — Urdu/English ASR/TTS baseline, 60-minute pipeline, image source extraction and source verification. Punjabi and Saraiki quality pass independently.

**Gate 4: Product** — data review, platform benchmarks, secure Windows package (Tauri) and release permissions. No marketing claims of impossible perfect truth or scientific proof.

## 13. Unresolved external/empirical items
1. **Hadith distribution rights and edition-level textual accuracy**: no unrestricted authoritative bilingual dump yet verified. Prototype imports can proceed with explicitly permitted or user-owned test corpus; public redistribution cannot be assumed.
2. **Quran translation rights**: choose exact Urdu and English translation editions and follow their per-edition terms. The Arabic original license does not cover every translation.
3. **Native Urdu/Punjabi/Saraiki voice quality and commercialization**: requires trials; MMS voices are CC-BY-NC 4.0. Saraiki is a research risk, not a shipped guarantee.
4. **Mac/Windows real performance**: model sizes are known, effective CPU/GPU processing and simultaneous ASR/TTS performance require hands-on benchmark.
5. **Name clearance**: 'Daleel-e-Haq' is a descriptive phrase with public unrelated uses; the WIPO/IPO trademark and registrar/domain transactions have **not** established availability. Use provisional working title.
6. **Religious review protocol**: qualified reviewers and approved schools/edition rules are needed for contested topics and controversial classifications.

## 14. Primary research links
- Tanzil Arabic Quran license: <https://tanzil.net/docs/Text_License>
- Tanzil Quran translations licensing: <https://tanzil.net/trans/>
- QuranEnc: <https://old.quranenc.com/en/home>
- Sunnah.com developer/offline note: <https://beta.sunnah.com/developers>
- Example community Hadith repo for evaluation only: <https://github.com/Jaguar16/open-hadith-data>
- Dataset translation rights warning: <https://github.com/TheAbubakrAbu/Hadith-JSON-Engine/blob/main/CREDITS.md>
- Qwen3.5-9B official model: <https://huggingface.co/Qwen/Qwen3.5-9B>
- Qwen models in Ollama: <https://ollama.com/library/qwen3.5>
- Ollama offline/cloud controls: <https://docs.ollama.com/faq>
- whisper.cpp: <https://github.com/ggml-org/whisper.cpp>
- Whisper listed languages: <https://github.com/openai/whisper/blob/main/whisper/tokenizer.py>
- Urdu/Punjabi Whisper evaluation: <https://aclanthology.org/2025.chipsal-1.20/>
- Urdu MMS voice: <https://huggingface.co/facebook/mms-tts-urd-script_arabic>
- Punjabi MMS voice: <https://huggingface.co/facebook/mms-tts-pan>
- Saraiki experimental model: <https://huggingface.co/themohal/saraiki-vits-tts>
- SQLite FTS5: <https://www.sqlite.org/fts5.html>
- Tauri sidecars: <https://v2.tauri.app/develop/sidecar/>
- Antigravity IDE: <https://www.antigravity.google/docs/ide/overview/>
- WIPO global brand search: <https://www.wipo.int/en/web/global-brand-database>
- Pakistan IP office: <https://ipo.gov.pk>

**Ready for development planning:** Yes, with scoped engineering gates. **Ready to claim a fully validated, commercially licensable, multi-language production app:** No, until marked external/empirical checks pass.
