# デプロイと環境変数設定ガイド

このドキュメントは、「おしらせベル」アプリケーションをVercelにデプロイし、正しく動作させるために必要な環境変数の設定手順をまとめたものです。

---

## 必要な環境変数

このプロジェクトでは、以下の環境変数が必要です。

| 変数名                  | 説明                                                          | 設定場所        |
| :---------------------- | :------------------------------------------------------------ | :-------------- |
| `VITE_VAPID_PUBLIC_KEY` | Web Push通知で使用するVAPID公開鍵。                           | Vercel          |
| `VAPID_PRIVATE_KEY`     | Web Push通知で使用するVAPID秘密鍵。                           | Vercel          |
| `CRON_SECRET`           | CronジョブAPIを不正なアクセスから保護するための秘密の文字列。 | Vercel & GitHub |
| `VERCEL_URL`            | デプロイされたVercelプロジェクトのURL。                       | GitHub          |

---

## ステップ1: Vercelでの環境変数設定

1.  Vercelのプロジェクトダッシュボードで、**[Settings] > [Environment Variables]** に移動します。
2.  以下の3つの環境変数を設定します。`CRON_SECRET` には、推測されにくい複雑な文字列を設定してください。
    - `VITE_VAPID_PUBLIC_KEY`
    - `VAPID_PRIVATE_KEY`
    - `CRON_SECRET`

3.  次に、**[Storage]** タブから **Vercel KV (Redis)** データベースを作成し、プロジェクトに接続します。
4.  接続が完了すると、`KV_URL` や `KV_REST_API_TOKEN` などの環境変数が自動的に追加されます。（もし自動で追加されない場合は、表示される値を手動で追加してください）

---

## ステップ2: GitHub Actionsのシークレット設定

定期的な通知処理は、GitHub Actionsによって実行されます。この設定を有効にするには、GitHubリポジトリに以下の「シークレット」を設定する必要があります。

1.  GitHubリポジトリの **[Settings] > [Secrets and variables] > [Actions]** に移動します。
2.  **[Repository secrets]** のセクションで、**[New repository secret]** ボタンをクリックし、以下の2つを登録します。
    - **Name:** `VERCEL_URL`
      - **Secret:** デプロイされたVercelプロジェクトのプロダクションURL（例: `https://your-project.vercel.app`）。

    - **Name:** `CRON_SECRET`
      - **Secret:** Vercelで設定したものと**全く同じ文字列**。

---

以上で、すべての設定は完了です。この状態でGitHubリポジトリにコードをプッシュすると、VercelへのデプロイとGitHub ActionsによるCronジョブの実行が正しく行われます。
