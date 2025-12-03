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
    *   Vercelダッシュボードで、このGitHubリポジトリをインポートして新規プロジェクトを作成します。
    *   Framework Presetは `Vite` が自動で選択されます。

2.  **環境変数の設定**:
    *   プロジェクトの **[Settings] > [Environment Variables]** に移動し、以下の3つの変数を設定します。
    *   `CRON_SECRET` には、推測されにくい複雑な文字列を設定してください。

        *   `VITE_VAPID_PUBLIC_KEY`
        *   `VAPID_PRIVATE_KEY`
        *   `CRON_SECRET`

3.  **データベース(KV)の作成と接続**:
    *   プロジェクトの **[Storage]** タブに移動します。
    *   `Marketplace Database Providers` のリストから **`Upstash`** を選択します。
    *   次の画面で **`Upstash for Redis`** を選択します。
    *   **Primary Region** を `Tokyo, Japan (Northeast)` に設定し、**Eviction** は**無効（チェックしない）**のまま、データベースを作成・接続します。
    *   この手順により、`KV_REST_API_URL` と `KV_REST_API_TOKEN` などの接続情報が、Vercelの環境変数に自動的に設定されます。

4.  **初回デプロイ**:
    *   上記の設定が完了したら、Vercelのプロジェクト画面から手動でデプロイを実行するか、GitHubリポジトリに何らかのコミットをプッシュして自動デプロイをトリガーします。

## ステップ2: GitHub Actionsのシークレット設定

定期的な通知処理は、GitHub Actionsによって実行されます。この設定を有効にするには、GitHubリポジトリに以下の「シークレット」を設定する必要があります。

1.  GitHubリポジトリの **[Settings] > [Secrets and variables] > [Actions]** に移動します。
2.  **[Repository secrets]** のセクションで、**[New repository secret]** ボタンをクリックし、以下の2つを登録します。

    *   **Name:** `VERCEL_URL`
        *   **Secret:** デプロイされたVercelプロジェクトのプロダクションURL（例: `https://your-project.vercel.app`）。

    *   **Name:** `CRON_SECRET`
        *   **Secret:** Vercelで設定したものと**全く同じ文字列**。

---

以上で、すべての設定は完了です。