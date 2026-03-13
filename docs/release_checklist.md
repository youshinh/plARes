# リリースチェックリスト

最終更新: 2026-03-07

## 1. CI 自動化

### Backend contracts

- [ ] `PYTHONPATH=backend backend/venv/bin/python -m pytest backend/tests/test_ws_router.py -q`
- [ ] `PYTHONPATH=backend backend/venv/bin/python -m pytest backend/tests/test_genai_request_service.py -q`
- [ ] `PYTHONPATH=backend backend/venv/bin/python -m pytest backend/tests/test_audio_judge_service.py -q`
- [ ] `PYTHONPATH=backend backend/venv/bin/python -m pytest backend/tests/test_message_contracts.py -q`

### Build integrity

- [ ] `python3 -m py_compile backend/ai_core/main.py`
- [ ] `cd frontend && npm run build`

### Smoke wrapper

- [ ] `scripts/phase1_smoke.sh --skip-e2e` が成功する

## 2. Browser E2E

### Core flow

- [ ] `scripts/e2e_live_smoke.sh` が成功する
- [ ] 言語選択 -> Hub -> Walk -> Training -> Battle Prep が通る
- [ ] token 発行 -> Live 接続 -> transcript 表示が通る

### UI regressions

- [ ] `Fusion Craft` を開閉できる
- [ ] 対戦中 `Menu` を閉じられる
- [ ] `Tactical Options` を閉じると視界を塞がない
- [ ] mobile で canvas が viewport をはみ出さない

## 3. 実機手動確認

### Permissions / device behavior

- [ ] Android Chrome で mic permission を許可 / deny 両方確認
- [ ] iOS Safari で `AudioContext` 起動制約下でも復帰できる
- [ ] camera permission を deny しても skip / upload 導線へ進める
- [ ] AR 非対応端末で `位置合わせ` 系導線が不自然に残らない

### Reconnect / fallback

- [ ] `/ws/game` 切断後に復帰する
- [ ] Gemini token 発行失敗時に理由が出る
- [ ] ADK unavailable 時に degraded reason が出る
- [ ] quota / 429 相当時に silent fail しない

### Game-specific UX

- [ ] 散歩 / 修行中にキャラが見える
- [ ] 必殺発動ボタンが mobile で跳ねない
- [ ] 記憶と進化が人向け文に見える
- [ ] 複数タブで開いた時に状態が破綻しない
- [ ] PWA / ホーム画面追加後でも viewport が崩れない

## 4. デプロイ前まとめ

- [ ] `docs/architecture_live.md` が current/target を最新化済み
- [ ] `PROGRESS_SYNC.md` に今回の変更が追記済み
- [ ] Cloud Run 反映前に smoke を最低 1 回実施済み

## 5. デプロイ後確認

- [ ] Frontend latest revision 確認
- [ ] Backend latest revision 確認
- [ ] 本番 URL で Hub / Walk / Battle Prep の最低導線を確認
- [ ] Cloud Logging で `voice_judge`, `interaction_response`, websocket error を確認
