from datetime import datetime, timezone
from typing import Any


class PersistenceService:
    def __init__(
        self,
        *,
        firestore_enabled: bool,
        firebase_admin_module: Any | None,
        firebase_firestore_module: Any | None,
    ) -> None:
        self._firestore_enabled = firestore_enabled
        self._firebase_admin = firebase_admin_module
        self._firebase_firestore = firebase_firestore_module
        self._firestore_client: Any | None = None
        self._firestore_disabled_reason = ""

    @property
    def firestore_disabled_reason(self) -> str:
        return self._firestore_disabled_reason

    def get_firestore_client(self) -> Any | None:
        if self._firestore_client is not None:
            return self._firestore_client
        if not self._firestore_enabled:
            self._firestore_disabled_reason = "disabled_by_env"
            return None
        if self._firebase_admin is None or self._firebase_firestore is None:
            self._firestore_disabled_reason = "firebase_admin_not_installed"
            return None

        try:
            if not self._firebase_admin._apps:
                self._firebase_admin.initialize_app()
            self._firestore_client = self._firebase_firestore.client()
            return self._firestore_client
        except Exception as exc:
            self._firestore_disabled_reason = str(exc)
            return None

    def load_profile_from_firestore(self, user_id: str) -> dict[str, Any] | None:
        db = self.get_firestore_client()
        if db is None:
            return None
        try:
            safe_user_id = user_id.replace("/", "_").replace("\\", "_").replace("..", "_")
            snap = db.collection("users").document(safe_user_id).get()
            if not snap.exists:
                return None
            data = snap.to_dict()
            return data if isinstance(data, dict) else None
        except Exception:
            return None

    def save_profile_to_firestore(self, profile: dict[str, Any]) -> None:
        db = self.get_firestore_client()
        if db is None:
            return
        user_id = str(profile.get("user_id", ""))
        if not user_id:
            return
        try:
            safe_user_id = user_id.replace("/", "_").replace("\\", "_").replace("..", "_")
            robot = profile.get("robot", {})
            logs = profile.get("match_logs", [])
            training_logs = profile.get("training_logs", [])
            walk_logs = profile.get("walk_logs", [])
            dna_ab_tests = profile.get("dna_ab_tests", [])
            recent = logs[-5:] if isinstance(logs, list) else []
            recent_training = training_logs[-5:] if isinstance(training_logs, list) else []
            recent_walk = walk_logs[-5:] if isinstance(walk_logs, list) else []
            recent_ab = dna_ab_tests[-10:] if isinstance(dna_ab_tests, list) else []
            payload = {
                "player_name": profile.get("player_name"),
                "lang": profile.get("lang"),
                "total_matches": profile.get("total_matches", 0),
                "ai_memory_summary": profile.get("ai_memory_summary", ""),
                "pending_milestone": profile.get("pending_milestone", 0),
                "robot": robot,
                "recent_match_logs": recent,
                "recent_training_logs": recent_training,
                "recent_walk_logs": recent_walk,
                "recent_dna_ab_tests": recent_ab,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            db.collection("users").document(safe_user_id).set(payload, merge=True)
        except Exception:
            return

    def save_match_log_to_firestore(self, user_id: str, match_log: dict[str, Any]) -> None:
        db = self.get_firestore_client()
        if db is None:
            return
        ts = str(match_log.get("timestamp", datetime.now(timezone.utc).isoformat()))
        room = str(match_log.get("room_id", "unknown"))
        doc_id = f"{ts}_{room}".replace(":", "-")
        try:
            safe_user_id = user_id.replace("/", "_").replace("\\", "_").replace("..", "_")
            safe_doc_id = doc_id.replace("/", "_").replace("\\", "_").replace("..", "_")
            payload = dict(match_log)
            expires = payload.get("expires_at")
            if isinstance(expires, str):
                try:
                    payload["expires_at"] = datetime.fromisoformat(expires)
                except Exception:
                    pass
            db.collection("users").document(safe_user_id).collection("matchLogs").document(safe_doc_id).set(payload)
        except Exception:
            return
