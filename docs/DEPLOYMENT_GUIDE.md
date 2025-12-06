# デプロイと環境変数設定ガイド

**最終更新**: 2025年12月3日
このドキュメントは、現在のVercelの仕様に基づいた「おしらせベル」のデプロイ手順です。

---

## 概要

このプロジェクトは **Vercel** と **GitHub Actions** を組み合わせてデプロイ・運用します。

1.  **Vercel**: アプリケーションのホスティング、サーバーレスAPIの実行、データベース(KV)の提供。
2.  **GitHub Actions**: 定期的な通知処理（Cronジョブ）の実行。

## ステップ1: Vercelでのプロジェクト作成と設定

1.  **Vercelプロジェクトの作成**:
    - Vercelダッシュボードで、このGitHubリポジトリをインポートして新規プロジェクトを作成します。
    - Framework Presetは `Vite` が自動で選択されます。

2.  **VAPIDキーの生成**:
    - プッシュ通知を機能させるには、VAPIDキー（公開鍵と秘密鍵）が必要です。
    - `npx web-push generate-vapid-keys` コマンドなどを実行して、キーペアを生成します。

3.  **環境変数の設定**:
    - プロジェクトの **[Settings] > [Environment Variables]** に移動し、以下の3つの変数を設定します。
    - **`VITE_VAPID_PUBLIC_KEY`**: フロントエンドが使用するVAPID公開鍵です。**ステップ2で生成した公開鍵（Public Key）** を設定します。
    - **`VAPID_PRIVATE_KEY`**: サーバーが使用するVAPID秘密鍵です。**ステップ2で生成した秘密鍵（Private Key）** を設定します。
    - **`CRON_SECRET`**: GitHub Actionsからのcronリクエストを認証するための秘密鍵です。推測されにくい複雑な文字列（例: `openssl rand -base64 32` などで生成）を設定します。

4.  **データベース(KV)の作成と接続**:
    - プロジェクトの **[Storage]** タブに移動します。
    - `Marketplace Database Providers` のリストから **`Upstash`** を選択します。
    - 次の画面で **`Upstash for Redis`** を選択します。
    - **Primary Region** を `Tokyo, Japan (Northeast)` に設定し、**Eviction** は**無効（チェックしない）**のまま、データベースを作成・接続します。
    - この手順により、`KV_REST_API_URL` と `KV_REST_API_TOKEN` などの接続情報が、Vercelの環境変数に自動的に設定されます。

5.  **初回デプロイ**:
    - 上記の設定が完了したら、Vercelのプロジェクト画面から手動でデプロイを実行するか、GitHubリポジトリに何らかのコミットをプッシュして自動デプロイをトリガーします。

## ステップ2: GitHub Actionsのシークレット設定

定期的な通知処理は、GitHub Actionsによって実行されます。この設定を有効にするには、GitHubリポジトリに以下の「シークレット」を設定する必要があります。

1.  GitHubリポジトリの **[Settings] > [Secrets and variables] > [Actions]** に移動します。
2.  **[Repository secrets]** のセクションで、**[New repository secret]** ボタンをクリックし、以下の2つを登録します。
    - **Name:** `VERCEL_URL`
      - **Secret:** デプロイされたVercelプロジェクトのプロダクションURL（例: `https://your-project.vercel.app`）。

    - **Name:** `CRON_SECRET`
      - **Secret:** Vercelで設定したものと**全く同じ文字列**。

## 開発環境のセットアップ

ローカルで開発サーバーを起動する場合、ViteがAPIリクエストを正しくプロキシできるように設定が必要です。

1.  **`vite.config.ts`の編集**:
    - プロジェクトのルートにある `vite.config.ts` ファイルを開きます。
    - `server.proxy` セクションの `target` を、あなたがデプロイしたVercelプロジェクトのURLに書き換えてください。

    ```typescript
    // vite.config.ts

    // ...
    proxy: {
      "/api": {
        target: "https://your-project.vercel.app", // ここをあなたのVercelデプロイURLに書き換える
        changeOrigin: true,
      },
    },
    // ...
    ```

---

以上で、すべての設定は完了です。
