# リリースチェックリスト

最終更新: 2026-03-01

## Pre-Release

### コード品質

- [ ] `npx tsc --noEmit` — TypeScript エラー 0件
- [ ] `python3 -m py_compile` — 全 backend モジュール OK
- [ ] `npm run build` — production ビルド成功
- [ ] Dead code 削除済み (T3-4)
- [ ] `.env` に本番用 `GOOGLE_API_KEY` 設定

### テスト

- [ ] `pytest tests/` — 全テスト PASS
- [ ] `scripts/e2e_live_smoke.sh` — E2E スモークテスト PASS
- [ ] Token → Live 接続 → 実況生成 手動確認
- [ ] キャラ生成（顔写真 + テキスト）手動確認
- [ ] BGM 再生確認（bgm_ready イベント）

### セキュリティ

- [ ] API キーが `.env` 内のみで管理されていること
- [ ] `.gitignore` に `*.env`, `venv/`, `node_modules/` 含む
- [ ] MCP Tool 入力サニタイズ（T3-2 で実装済み）
- [ ] WebSocket の roomId バリデーション

### インフラ

- [ ] Cloud Run サービス デプロイ確認
- [ ] Cloud Run コンテナ ヘルスチェック応答
- [ ] `PLARES_FIRESTORE_MODE` の切り替え確認
- [ ] Context Cache TTL 設定（`PLARES_CACHE_TTL_SECONDS`）

### ドキュメント

- [ ] `docs/architecture_live.md` 最新化
- [ ] `PROGRESS_SYNC.md` 全タスク DONE
- [ ] `README.md` セットアップ手順

## Deploy

```bash
# 1. Frontend build
cd frontend && npm run build

# 2. Backend dependency check
cd backend && pip install -r requirements.txt

# 3. Deploy to Cloud Run
gcloud run deploy plares-backend --source backend/ --region asia-northeast1
gcloud run deploy plares-frontend --source frontend/ --region asia-northeast1

# 4. Post-deploy verification
curl -f https://plares-backend-XXXX.run.app/health
```

## Post-Release

- [ ] Cloud Logging ダッシュボードで structured log 確認
- [ ] Context Cache ヒット率 > 50% 確認
- [ ] 音声判定 structured log (`event=voice_judge`) 動作確認
- [ ] E2E スモークテスト再実行
- [ ] `docs/performance_cost_report.md` に実測値を記入
