# Webプッシュ通知実装の概要と学び

この文書は、Webプッシュ通知機能の実装において発生した主要な問題と、その解決（または未解決）の経緯を記録するものです。Cloudflare Pages FunctionsおよびWorkers環境における`web-push`ライブラリ、Web Crypto API、VAPID認証に関する互換性問題を中心に記述します。

---

## 最終アーキテクチャ

本アプリケーションのアーキテクチャは、各プラットフォームの強みを活かし、特定の技術的課題を克服するためにCloudflareとVercelに分散して構築されています。

*   **フロントエンドホスティング (Cloudflare Pages)**:
    *   ReactベースのPWAはCloudflare Pagesでホストされています。

*   **API機能 (Cloudflare Pages Functions)**:
    *   `/api/schedule-reminder`: リマインダーとプッシュ購読情報をCloudflare KVに保存/更新します。
    *   `/api/delete-reminder`: Cloudflare KVからリマインダーを削除します。

*   **Cronジョブ (Cloudflare Workers)**:
    *   `update-bell-app-cron`: 毎分定時にCloudflare Pagesの`/api/send-notifications`エンドポイントへHTTP `POST`リクエストを送信し、通知送信プロセスを開始します。

*   **データストレージ (Cloudflare KV)**:
    *   `REMINDER_STORE`: リマインダーデータとユーザーのプッシュ購読情報を保存するためのKV名前空間です。

*   **プッシュ通知送信 (Vercel Serverless Functions)**:
    *   `update-bell-app-notification-sender`: Webプッシュ通知の送信を担当するVercel Serverless Functionです。Node.jsのフルランタイム環境で`web-push`ライブラリを使用します。

### ワークフロー

1.  Cronジョブ (`update-bell-app-cron`) がCloudflare Pagesの`/api/send-notifications`エンドポイントをトリガーします。
2.  `/api/send-notifications` FunctionsはCloudflare KVから保留中のリマインダーを取得します。
3.  その後、認証付きのHTTP `POST`リクエストをVercel Function (`update-bell-app-notification-sender`) に送信します。
4.  Vercel Functionはリクエストを受け取り、`web-push`ライブラリを使用してVAPIDヘッダーを生成し、プッシュサービス（例: FCM）へ通知を送信します。

---

## 主な学びと技術的決定

### 1. `web-push`ライブラリとCloudflareの`nodejs_compat`

**問題**: `web-push`ライブラリは、特に`crypto`などNode.jsの組み込みモジュールに深く依存しています。CloudflareのWorkersおよびPages Functionsの`nodejs_compat`レイヤーは広範ですが、これらの依存関係を完全に解決できず、継続的なビルド失敗を引き起こしました（例: `Could not resolve "web-push"`, `Could not resolve "crypto"`など）。

**試行と失敗**:
*   `wrangler.toml`やダッシュボードでの`nodejs_compat`フラグの有効化では、`crypto.createECDH`問題が解決しませんでした。
*   `esbuild`のカスタム設定（`--platform=browser`, `--platform=node`, `--external`, `--alias`, `buffer`/`crypto`/`url`のカスタムポリフィル）を試みましたが、安定したビルドは得られませんでした。
*   Web Crypto APIを直接使用してVAPID JWTを手動実装しようとしましたが、プッシュサービスからの`invalid JWT provided`エラーで失敗し、手動実装の困難さが判明しました。

**結論**: `web-push`ライブラリが期待通りに動作するには、Node.jsのフルランタイム環境で実行することが最も堅牢で信頼性の高い解決策であると判断しました。このため、**Vercel Serverless Functions**が選択されました。

### 2. サービス間通信 (Cloudflare Pages <-> Vercel)

**問題**: Cloudflare Pages FunctionとVercel Function間の通信は安全である必要があります。

**解決策**: 認証付きのHTTPリクエストを使用します。
*   `NOTIFICATION_SENDER_SECRET`というシークレットキーが、Cloudflare PagesプロジェクトとVercelプロジェクトの両方に環境変数として保存されます。
*   Pages Functionは`fetch`リクエストでこのシークレットを`X-Notification-Sender-Secret`ヘッダーに含めます。
*   Vercel Functionはリクエストを処理する前にこのヘッダーを検証します。
*   当初は**Cloudflare Service Bindings**も試みましたが、Cloudflare環境における`web-push`のビルド問題が解決しないため、HTTP呼び出しに戻しました。

### 3. Cloudflare KV利用の最適化

**問題**: アプリケーションはCloudflare KVの無料枠の1日あたりの操作制限に近づいていました。元々のロジックでは、毎分`list()`で全リマインダーキーを取得し、それぞれを`get()`で読み込んでいました。

**解決策**:
*   リマインダーを保存する際、`scheduledTime`と`status`もKVキーの**メタデータ**として保存するように変更しました。
*   `send-notifications`関数は、`list()`操作でメタデータに基づいてリマインダーをフィルタリングし、実際に通知が必要なリマインダーのみ`get()`操作を行うように変更しました。
*   これにより、KVの読み取り操作が大幅に削減され、無料枠の制限到達を回避できます。

---
**この文書は、Webプッシュ通知機能の進化と、直面した課題への対処をまとめたものです。**