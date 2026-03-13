# VCS Rules (Jujutsu / jj)

## 1. Description

このプロジェクトでは、Gitの代わりに **Jujutsu (jj)** をバージョン管理システムとして使用します。
すべてのAIエージェントおよび開発プロセスにおいて、従来のGitワークフロー（commit, add, push等）ではなく、Jujutsuのワークフローに従う必要があります。

## 2. Global Instructions (指示事項)

1.  **Gitコマンドの禁止**:
    - `git commit`, `git add`, `git push` 等のコマンドは原則として使用せず、Jujutsuコマンドを使用してください。
2.  **Jujutsuワークフロー**:
    - 作業が完了したら `jj log` でステータスとグラフを確認してください。
    - コミットメッセージ（説明）の設定には `jj describe -m "message"` を使用してください。
    - 作業中に誤った操作や破壊的な変更を行った場合は、`jj undo` を使用して安全に復旧してください。
3.  **不変性の尊重**:
    - Jujutsuの意図しない挙動やエラーが発生した場合は、速やかにユーザーに報告し、勝手なGitへの切り替えを行わないでください。

## 3. Reference Commands

- `jj log`: 変更履歴の確認
- `jj status`: 現在の変更内容の確認
- `jj describe -m "description"`: 変更内容の説明を設定
- `jj undo`: 直前の操作を取り消し
- `jj diff`: 変更の詳細を確認
