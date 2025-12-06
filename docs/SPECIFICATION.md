# おしらせベル アプリケーション仕様書

**最終更新**: 2025-12-04

---

## プロジェクト概要

ユーザーが指定した周期で、指定したURLへのリンクをプッシュ通知するPWAアプリケーション。Vercelで公開し、PC/スマホ/タブレットで利用可能。

**コンセプト**: ウェブ漫画の更新チェック、新商品の発売確認、イベント開催チェックなど、定期的に確認したいウェブページを忘れずにチェックできるリマインダーアプリ。

---

## 主要機能仕様

### 基本機能

- **リマインダー管理**: 作成・編集・削除・一時停止・複製機能
- **柔軟な周期設定**: 毎日・数日ごと・毎週・特定曜日複数選択・毎月（第n曜日）
- **ハイブリッド通知**:
  - **ローカル通知**: Service Workerを利用した、デバイス完結型の基本的な通知。
  - **プッシュ通知**: Vercelサーバーを経由する、高信頼性なWeb Push通知。
- **タグ機能**: 分類・検索・フィルター対応
- **テーマ切り替え**: ライト/ダーク/システム準拠
- **PWA対応**: オフライン動作（一部機能）・インストール可能・ホーム画面追加
- **データ管理**: JSON エクスポート/インポート（重複処理含む）
- **タイムゾーン管理**: 移動時の自動検出・調整ダイアログ

### ユーザー体験設計

- **ダッシュボード**: リマインダー一覧、検索・フィルター、各種操作
- **トースト通知**: 操作の成功、エラー、情報メッセージを画面右下に一時的に表示。複数メッセージはスタックされ、クリックまたは時間経過で消える。
- **モバイル対応**: レスポンシブデザイン、PWAによるネイティブアプリ風体験
- **テーマ対応**: ライト/ダーク/システム準拠の3モード

### データ自動削除機能

利用者のプライバシー保護、ストレージコストの最適化、およびアプリケーションのパフォーマンス維持のため、長期間利用されていないユーザーデータは自動的に削除されます。

- **削除対象**: 最後に通知機能をご利用いただいてから、半年以上アクセスのない利用者のリマインダー情報およびプッシュ通知購読情報。
- **「利用」の定義**: プッシュ通知を開き、通知に含まれるリンクへアクセスしたこと。
- **実装概要**:
  - **アクセス追跡API (`api/track-access.js`)**: プッシュ通知クリック時に呼び出され、ユーザーの最終アクセス日時（`user_last_access:{userId}`）をVercel KVに記録します。
  - **Service Worker (`public/sw.js`)**: `notificationclick` イベントをフックし、`api/track-access.js` をバックグラウンドで呼び出すロジックを追加。
  - **自動削除Cronジョブ (`api/cron/delete-inactive-users.js`)**:
    - 毎週日曜日の00:00 (UTC) にGitHub Actionsから実行されます。
    - `user_last_access:{userId}` キーを走査し、半年以上アクセスがないユーザーを特定します。
    - 特定したユーザーの関連データ（全リマインダー、購読情報、最終アクセス記録）をVercel KVから削除します。
    - **過去データへの対応**: `user_last_access` 記録がない既存ユーザーに対しては、Cronジョブ実行時にその日を「みなしの最終アクセス日」として記録します。これにより、すべてのユーザーが自動削除の対象に含まれるようになります。
  - 本機能の詳細および利用者のプライバシーに関する扱いは、[プライバシーポリシー](docs/PRIVACY_POLICY.md)をご確認ください。

### データ管理仕様

- **ストレージ**:
  - **ブラウザ LocalStorage**: リマインダーの基本設定やUI設定を保存。
  - **Vercel KV**: プッシュ通知を選択したユーザーのリマインダー情報と購読情報をサーバーサイドに保存。
- **データ形式**: JSON（エクスポート/インポート対応）
- **状態管理**: カスタムフック（`useReminders`, `useSettings`, `useTheme`, `useTimezone`, `useToast`）
- **バックアップ**: UIからの手動エクスポートを推奨

---

## 開発者向け情報

このプロジェクトは当初 Claude AI によってほぼ全体が実装され、その後 Gemini CLI によって改修・メンテナンスが行われています。
人間の開発者は主に仕様策定、ビルド、デバッグを担当しています。

### アーキテクチャ概要

このアプリケーションは、VercelとGitHub Actionsを組み合わせて構築されています。

- **Vercel**:
  - **Hosting**: フロントエンド（React PWA）のホスティング
  - **Serverless Functions**: リマインダーの保存・削除API、Web Push通知の送信処理を提供。Node.jsのフル機能を利用し、`web-push`ライブラリを使用。
  - **Vercel KV**: リマインダーとPush購読情報のデータストア。

- **GitHub Actions**:
  - **Cronジョブ**: 定期的にVercel上の通知処理APIを呼び出し、リマインダー通知をトリガーします。
    （GitHub Actionsのスケジュールは5分間隔に設定されていますが、実行はベストエフォートであり、プラットフォームの負荷状況によっては遅延や実行の欠落が発生する可能性があります。詳細は[GitHubの公式ドキュメント](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)をご確認ください。）

Cloudflareの`nodejs_compat`環境では`web-push`ライブラリの依存関係を解決できなかった技術的制約がありましたが、現在はVercel上で全てのバックエンド機能が動作し、GitHub ActionsがCronジョブを担っています。

### 技術スタック

- フレームワーク: React 18
- 言語: TypeScript
- ビルドツール: Vite 5
- スタイリング: Tailwind CSS 3
- 状態管理: React Hooks（カスタムフック活用）
- PWA: Web Manifest / Service Worker
- 通知: Web Notifications API, Web Push API (`web-push`ライブラリを利用)
- サーバーレス: Vercel Serverless Functions
- データベース: Vercel KV
- アイコン: Lucide React
- デプロイ: Vercel

### PWA・Service Worker仕様

PWA機能は、Web ManifestとService Workerによって実装されています。

- **Service Worker**: `public/sw.js`が本番環境でのみアプリによって登録されます。
- **通知機能**:
  - **ローカル通知**: アプリから受け取ったスケジュールに基づき、Service Workerが`setTimeout`を利用してローカル通知を管理します。
  - **プッシュ通知**: サーバー（Vercel Serverless Functions）から送信されたPushイベントをService Workerが受け取り、Web Notifications APIを利用して通知を表示します。
- **マニフェスト**: アプリ名、アイコン、ショートカットなどが `public/manifest.json` に定義されています。
- **開発時の注意**: 開発環境ではService Workerの登録は無効化されます。

### プロジェクト構造

```
.
├── api/                 # Vercel Serverless Functions (API)
├── public/              # 静的ファイル (アイコン, sw.js, manifest.json)
├── src/                 # Reactアプリケーションのソースコード
│   ├── components/      # 再利用可能なUIコンポーネント
│   ├── contexts/        # グローバルな状態を管理するReact Context
│   ├── hooks/           # ビジネスロジックや状態管理をカプセル化するカスタムフック
│   ├── types/           # アプリケーション全体で使用するTypeScriptの型定義
│   └── utils/           # ヘルパー関数や補助的な機能
├── docs/                # ドキュメント (仕様書, プライバシーポリシー)
├── scripts/             # ビルド用スクリプト (アイコン変換など)
├── .vscode/             # VS Codeの推奨設定
├── .gitignore           # Gitの追跡除外ファイル
├── .prettierrc          # Prettierのコードフォーマット設定
├── eslint.config.js     # ESLintのコード品質設定
├── index.html           # アプリケーションのHTMLエントリーポイント
├── LICENSE              # プロジェクトのライセンス
├── package.json         # 依存関係とスクリプトの定義
├── package-lock.json    # 依存関係のバージョンロックファイル
├── postcss.config.cjs   # PostCSS設定
├── README.md            # プロジェクトの概要説明
├── tailwind.config.cjs  # Tailwind CSS設定
├── THIRD-PARTY-LICENSES.md # サードパーティライセンス情報
├── tsconfig.json        # TypeScriptの基本設定
├── tsconfig.node.json   # TypeScriptのNode.js環境用設定
└── vite.config.ts       # Viteのビルド・PWA設定
```

### デプロイ

Gitリポジリへのプッシュをトリガーとして、Vercelが自動でビルドとデプロイを実行します。また、GitHub Actionsが設定されたCronジョブを定期的にトリガーします。

### VS Code タスク設定

開発効率化のためのVS Codeタスク設定（`.vscode/tasks.json`）が含まれています。
VS Codeで `Ctrl+Shift+P` → `Tasks: Run Task` から各種チェックやビルドを一括実行できます。

### 貢献について

プルリクエストやイシューの報告を歓迎します。

---

## 今後のタスク

- **UI/UXの継続的な改善**: より直感的で使いやすいインターフェースの追求。
