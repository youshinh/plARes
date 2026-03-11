from ai_core.persistence_service import PersistenceService


class FakeDoc:
    def __init__(self, store, path):
        self._store = store
        self._path = path

    @property
    def exists(self):
        return self._path in self._store

    def get(self):
        return self

    def to_dict(self):
        return self._store.get(self._path)

    def set(self, payload, merge=False):
        if merge and self._path in self._store:
            merged = dict(self._store[self._path])
            merged.update(payload)
            self._store[self._path] = merged
        else:
            self._store[self._path] = payload

    def collection(self, name):
        return FakeCollection(self._store, f"{self._path}/{name}")


class FakeCollection:
    def __init__(self, store, path):
        self._store = store
        self._path = path

    def document(self, doc_id):
        return FakeDoc(self._store, f"{self._path}/{doc_id}")


class FakeFirestoreClient:
    def __init__(self):
        self.store = {}

    def collection(self, name):
        return FakeCollection(self.store, name)


class FakeFirebaseAdmin:
    _apps = []

    @classmethod
    def initialize_app(cls):
        cls._apps.append("app")


class FakeFirebaseFirestore:
    def __init__(self, client):
        self._client = client

    def client(self):
        return self._client


def test_save_profile_to_firestore_keeps_recent_windows():
    client = FakeFirestoreClient()
    service = PersistenceService(
        firestore_enabled=True,
        firebase_admin_module=FakeFirebaseAdmin,
        firebase_firestore_module=FakeFirebaseFirestore(client),
    )

    service.save_profile_to_firestore(
        {
            "user_id": "u1",
            "player_name": "User 1",
            "lang": "ja-JP",
            "total_matches": 9,
            "ai_memory_summary": "summary",
            "pending_milestone": 5,
            "robot": {"name": "Bot"},
            "match_logs": list(range(9)),
            "training_logs": list(range(8)),
            "walk_logs": list(range(7)),
            "dna_ab_tests": list(range(15)),
        }
    )

    payload = client.store["users/u1"]
    assert payload["recent_match_logs"] == [4, 5, 6, 7, 8]
    assert payload["recent_training_logs"] == [3, 4, 5, 6, 7]
    assert payload["recent_walk_logs"] == [2, 3, 4, 5, 6]
    assert payload["recent_dna_ab_tests"] == [5, 6, 7, 8, 9, 10, 11, 12, 13, 14]


from unittest.mock import MagicMock

def test_persistence_service_sanitization():
    db = MagicMock()
    ps = PersistenceService(
        firestore_enabled=True,
        firebase_admin_module=MagicMock(),
        firebase_firestore_module=MagicMock(),
    )
    ps.get_firestore_client = MagicMock(return_value=db)

    ps.load_profile_from_firestore("user123/../../other")
    db.collection.assert_called_with("users")
    db.collection().document.assert_called_with("user123_______other")

    ps.save_profile_to_firestore({"user_id": "user123/../../other", "player_name": "Test"})
    db.collection().document.assert_called_with("user123_______other")

    ps.save_match_log_to_firestore("user/123", {"timestamp": "2023-01-01T00:00:00Z", "room_id": "room/456"})
    db.collection().document.assert_called_with("user_123")


def test_load_profile_from_firestore_returns_document_dict():
    client = FakeFirestoreClient()
    client.store["users/u1"] = {"user_id": "u1", "player_name": "User 1"}
    service = PersistenceService(
        firestore_enabled=True,
        firebase_admin_module=FakeFirebaseAdmin,
        firebase_firestore_module=FakeFirebaseFirestore(client),
    )

    profile = service.load_profile_from_firestore("u1")

    assert profile == {"user_id": "u1", "player_name": "User 1"}
