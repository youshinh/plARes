from ai_core.profile_service import ProfileService


def build_service(tmp_path):
    saved_profiles: list[dict] = []

    service = ProfileService(
        user_runtime_dir=tmp_path,
        dna_evolution_match_step=5,
        load_profile_from_firestore=lambda _user_id: None,
        save_profile_to_firestore=lambda profile: saved_profiles.append(profile),
        get_firestore_client=lambda: None,
    )
    return service, saved_profiles


def test_load_user_profile_returns_default_shape(tmp_path):
    service, _saved_profiles = build_service(tmp_path)

    profile = service.load_user_profile("u1", "ja-JP", 0.6)

    assert profile["user_id"] == "u1"
    assert profile["robot"]["network"]["sync_rate"] == 0.6
    assert profile["robot"]["character_dna"]["version"] == "v1"


def test_append_mode_log_persists_training_summary(tmp_path):
    service, saved_profiles = build_service(tmp_path)

    profile = service.append_mode_log(
        user_id="u1",
        lang="en-US",
        sync_rate=0.5,
        mode="training",
        payload={
            "sessionId": "training_1",
            "accuracy": 0.8,
            "speed": 0.7,
            "passion": 0.9,
            "result": "SUCCESS",
        },
    )

    assert profile["training_logs"][-1]["session_id"] == "training_1"
    assert "training#training_1" in profile["ai_memory_summary"]
    assert saved_profiles[-1]["user_id"] == "u1"
