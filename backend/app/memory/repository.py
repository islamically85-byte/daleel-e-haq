import json
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.db.connection import get_connection


class MemoryRepository:
    """
    Handles SQLite persistence for conversations, messages, debate analyses,
    and review queue entries.
    """

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    # --- Conversations & Messages ---

    @classmethod
    def create_conversation(cls, title: str = "New Research Topic", provider: str = "gemini", model: str = "gemini-3.8-flash") -> Dict[str, Any]:
        conv_id = f"conv_{uuid.uuid4().hex[:12]}"
        now = cls._now()
        with get_connection() as conn:
            conn.execute("""
                INSERT INTO conversations (id, title, created_at, updated_at, provider, model)
                VALUES (?, ?, ?, ?, ?, ?);
            """, (conv_id, title, now, now, provider, model))
        return {
            "id": conv_id,
            "title": title,
            "created_at": now,
            "updated_at": now,
            "provider": provider,
            "model": model,
            "messages": []
        }

    @classmethod
    def list_conversations(cls) -> List[Dict[str, Any]]:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT c.*, COUNT(m.id) as message_count
                FROM conversations c
                LEFT JOIN messages m ON c.id = m.conversation_id
                GROUP BY c.id
                ORDER BY c.updated_at DESC;
            """)
            return [dict(r) for r in cursor.fetchall()]

    @classmethod
    def get_conversation(cls, conv_id: str) -> Optional[Dict[str, Any]]:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM conversations WHERE id = ?;", (conv_id,))
            conv_row = cursor.fetchone()
            if not conv_row:
                return None

            conv = dict(conv_row)
            cursor.execute("""
                SELECT * FROM messages 
                WHERE conversation_id = ? 
                ORDER BY created_at ASC;
            """, (conv_id,))
            messages = []
            for m in cursor.fetchall():
                msg = dict(m)
                if msg.get("evidence_citations"):
                    try:
                        msg["evidence_citations"] = json.loads(msg["evidence_citations"])
                    except Exception:
                        msg["evidence_citations"] = []
                else:
                    msg["evidence_citations"] = []
                msg["has_unverified_claims"] = bool(msg.get("has_unverified_claims", 0))
                messages.append(msg)

            conv["messages"] = messages
            return conv

    @classmethod
    def rename_conversation(cls, conv_id: str, new_title: str) -> bool:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE conversations 
                SET title = ?, updated_at = ? 
                WHERE id = ?;
            """, (new_title.strip() or "Untitled Research", cls._now(), conv_id))
            return cursor.rowcount > 0

    @classmethod
    def delete_conversation(cls, conv_id: str) -> bool:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM messages WHERE conversation_id = ?;", (conv_id,))
            cursor.execute("DELETE FROM conversations WHERE id = ?;", (conv_id,))
            return cursor.rowcount > 0

    @classmethod
    def add_message(
        cls,
        conv_id: str,
        role: str,
        content: str,
        language: str = "en",
        evidence_citations: Optional[List[Dict[str, Any]]] = None,
        has_unverified: bool = False,
        unverified_reason: Optional[str] = None
    ) -> Dict[str, Any]:
        msg_id = f"msg_{uuid.uuid4().hex[:12]}"
        now = cls._now()
        citations_json = json.dumps(evidence_citations or [], ensure_ascii=False)

        with get_connection() as conn:
            conn.execute("""
                INSERT INTO messages (
                    id, conversation_id, role, content, language, created_at,
                    evidence_citations, has_unverified_claims, unverified_reason
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                msg_id, conv_id, role, content, language, now,
                citations_json, 1 if has_unverified else 0, unverified_reason
            ))
            conn.execute("UPDATE conversations SET updated_at = ? WHERE id = ?;", (now, conv_id))

        return {
            "id": msg_id,
            "conversation_id": conv_id,
            "role": role,
            "content": content,
            "language": language,
            "created_at": now,
            "evidence_citations": evidence_citations or [],
            "has_unverified_claims": has_unverified,
            "unverified_reason": unverified_reason
        }

    # --- Debates ---

    @classmethod
    def save_debate(
        cls,
        title: str,
        raw_transcript: str,
        language: str,
        analysis_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        debate_id = f"deb_{uuid.uuid4().hex[:12]}"
        now = cls._now()
        topic = analysis_data.get("topic", title)
        summary = analysis_data.get("summary", "")
        unresolved = json.dumps(analysis_data.get("unresolved_issues", []), ensure_ascii=False)
        synthesis = analysis_data.get("synthesis", "")

        with get_connection() as conn:
            conn.execute("""
                INSERT INTO debates (
                    id, title, raw_transcript, language, created_at,
                    topic, summary, unresolved_issues, synthesis
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (debate_id, title, raw_transcript, language, now, topic, summary, unresolved, synthesis))

            claims = analysis_data.get("claims", [])
            for c in claims:
                claim_id = f"clm_{uuid.uuid4().hex[:12]}"
                evidence_ids_json = json.dumps(c.get("evidence_ids", []), ensure_ascii=False)
                conn.execute("""
                    INSERT INTO debate_claims (
                        id, debate_id, claim_number, claim_text, alleged_source,
                        verification_status, evidence_ids, response_text,
                        logical_issues, interpretive_notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    claim_id,
                    debate_id,
                    c.get("claim_number", 1),
                    c.get("claim_text", ""),
                    c.get("alleged_source"),
                    c.get("verification_status", "unverified"),
                    evidence_ids_json,
                    c.get("response_text", ""),
                    c.get("logical_issues"),
                    c.get("interpretive_notes")
                ))

        return cls.get_debate(debate_id)

    @classmethod
    def get_debate(cls, debate_id: str) -> Optional[Dict[str, Any]]:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM debates WHERE id = ?;", (debate_id,))
            row = cursor.fetchone()
            if not row:
                return None

            deb = dict(row)
            if deb.get("unresolved_issues"):
                try:
                    deb["unresolved_issues"] = json.loads(deb["unresolved_issues"])
                except Exception:
                    deb["unresolved_issues"] = []

            cursor.execute("""
                SELECT * FROM debate_claims 
                WHERE debate_id = ? 
                ORDER BY claim_number ASC;
            """, (debate_id,))
            claims = []
            for c in cursor.fetchall():
                claim = dict(c)
                if claim.get("evidence_ids"):
                    try:
                        claim["evidence_ids"] = json.loads(claim["evidence_ids"])
                    except Exception:
                        claim["evidence_ids"] = []
                else:
                    claim["evidence_ids"] = []
                claims.append(claim)

            deb["claims"] = claims
            return deb

    @classmethod
    def list_debates(cls) -> List[Dict[str, Any]]:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT d.id, d.title, d.language, d.created_at, d.topic, d.summary,
                       COUNT(c.id) as claims_count
                FROM debates d
                LEFT JOIN debate_claims c ON d.id = c.debate_id
                GROUP BY d.id
                ORDER BY d.created_at DESC;
            """)
            return [dict(r) for r in cursor.fetchall()]

    @classmethod
    def delete_debate(cls, debate_id: str) -> bool:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM debate_claims WHERE debate_id = ?;", (debate_id,))
            cursor.execute("DELETE FROM debates WHERE id = ?;", (debate_id,))
            return cursor.rowcount > 0

    # --- Review Queue ---

    @classmethod
    def add_to_review_queue(
        cls,
        item_type: str,
        question_or_topic: str,
        proposed_answer: Optional[str] = None,
        supporting_evidence_ids: Optional[List[str]] = None,
        missing_evidence: Optional[str] = None,
        user_feedback: Optional[str] = None
    ) -> Dict[str, Any]:
        item_id = f"rev_{uuid.uuid4().hex[:12]}"
        now = cls._now()
        evidence_json = json.dumps(supporting_evidence_ids or [], ensure_ascii=False)

        with get_connection() as conn:
            conn.execute("""
                INSERT INTO review_queue (
                    id, item_type, question_or_topic, proposed_answer,
                    supporting_evidence_ids, missing_evidence, user_feedback,
                    review_status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?);
            """, (
                item_id, item_type, question_or_topic, proposed_answer,
                evidence_json, missing_evidence, user_feedback, now
            ))

        return {
            "id": item_id,
            "item_type": item_type,
            "question_or_topic": question_or_topic,
            "review_status": "pending",
            "created_at": now
        }

    @classmethod
    def list_review_queue(cls, status: Optional[str] = None) -> List[Dict[str, Any]]:
        with get_connection() as conn:
            cursor = conn.cursor()
            if status:
                cursor.execute("SELECT * FROM review_queue WHERE review_status = ? ORDER BY created_at DESC;", (status,))
            else:
                cursor.execute("SELECT * FROM review_queue ORDER BY created_at DESC;")
            items = []
            for row in cursor.fetchall():
                item = dict(row)
                if item.get("supporting_evidence_ids"):
                    try:
                        item["supporting_evidence_ids"] = json.loads(item["supporting_evidence_ids"])
                    except Exception:
                        item["supporting_evidence_ids"] = []
                items.append(item)
            return items
