# おしらせベル アプリケーション仕様書

**最終更新**: 2025-11-23
**バージョン**: 1.0.0

---

## プロジェクト概要

ユーザーが指定した周期で、指定したURLへのリンクをプッシュ通知するPWAアプリケーション。Cloudflare Pagesで公開し、PC/スマホ/タブレットで利用可能。

**コンセプト**: ウェブ漫画の更新チェック、新商品の発売確認、イベント開催チェックなど、定期的に確認したいウェブページを忘れずにチェックできるリマインダーアプリ。

---

## 主要機能仕様

### 基本機能

- **リマインダー管理**: 作成・編集・削除・一時停止・複製機能
- **柔軟な周期設定**: 毎日・数日ごと・毎週・特定曜日複数選択・毎月（第n曜日）
- **プッシュ通知**: 指定時刻にブラウザ通知（Service Worker）
- **タグ機能**: 分類・検索・フィルター対応
- **テーマ切り替え**: ライト/ダーク/システム準拠
- **PWA対応**: オフライン動作・インストール可能・ホーム画面追加
- **データ管理**: JSON エクスポート/インポート（重複処理含む）
- **タイムゾーン管理**: 移動時の自動検出・調整ダイアログ

### ユーザー体験設計

- **ダッシュボード**: リマインダー一覧、検索・フィルター、各種操作
- **モバイル対応**: レスポンシブデザイン、PWAによるネイティブアプリ風体験
- **テーマ対応**: ライト/ダーク/システム準拠の3モード

### データ管理仕様

- **ストレージ**: ブラウザのLocalStorage（ユーザー登録不要）
- **データ形式**: JSON（エクスポート/インポート対応）
- **状態管理**: カスタムフック（`useReminders`, `useSettings`, `useTheme`, `useTimezone`）
- **バックアップ**: UIからの手動エクスポートを推奨

---

## 開発者向け情報

このプロジェクトは当初 Claude AI によってほぼ全体が実装され、その後 Gemini CLI によって改修・メンテナンスが行われています。
人間の開発者は主に仕様策定、ビルド、デバッグを担当しています。

### 技術スタック

- **フレームワーク**: React 18
- **言語**: TypeScript
- **ビルドツール**: Vite 5
- **スタイリング**: Tailwind CSS 3
- **状態管理**: React Hooks（カスタムフック活用）
- **PWA**: Web Manifest / Service Worker
- **通知**: Web Notifications API
- **アイコン**: Lucide React, および一部アイコンには "Rounded Mplus 1c" フォントを画像化して使用。
- **デプロイ**: Cloudflare Pages

### 開発環境のセットアップ

#### 必要な環境

- Node.js 18.0.0 以上
- npm
- mkcert（HTTPSでのローカル開発に必要）

#### セットアップ手順

```bash
# 1. リポジトリのクローン
git clone https://github.com/lost-nd-xxx/update-bell-app.git
cd update-bell-app

# 2. 依存関係のインストール
npm install

# 3. (任意) ローカル開発用の証明書を生成
# mkcert -install
# mkcert localhost.pem localhost-key.pem

# 4. 開発サーバーの起動
npm run dev
```

開発サーバーは `https://localhost:5173/` で起動します。

#### 利用可能なスクリプト

- `npm run dev`: 開発サーバーを起動
- `npm run build`: 本番用にプロジェクトをビルド
- `npm run preview`: ビルド結果をローカルでプレビュー
- `npm run type-check`: TypeScriptの型チェックを実行
- `npm run lint`: ESLintでコードをチェック
- `npm run lint:fix`: ESLintでコードをチェック（自動修正）
- `npm run format`: Prettierでコードをフォーマット
- `npm run check:all`: type-check、lint、formatを実行
- `npm run check:fix`: type-check、lint:fix、formatを実行
- `npm run icons`: svgからアイコンを生成
- `npm run icons:clean`: svgからアイコンを生成（古いものを削除）

### PWA・Service Worker仕様

PWA機能は、Web ManifestとService Workerによって実装されています。

- **Service Worker**: `public/sw.js`が本番環境でのみアプリによって登録されます。現在の実装は通知機能に特化しており、オフライン用のキャッシュ機能は含まれていません。
- **マニフェスト**: アプリ名、アイコン、ショートカットなどが `public/manifest.json` に定義されています。
- **通知機能**: アプリから受け取ったスケジュールに基づき、Service WorkerがWeb Notifications APIを利用して通知を送信します。
- **開発時の注意**: 開発環境ではService Workerの登録は無効化されます。

### プロジェクト構造

```
.
├── public/              # 静的ファイル (アイコン, sw.js, manifest.json)
├── src/                 # ソースコード
│   ├── components/      # Reactコンポーネント
│   ├── hooks/           # カスタムフック
│   ├── types/           # TypeScript型定義
│   ├── utils/           # ユーティリティ関数
│   ├── App.tsx          # メインアプリコンポーネント
│   ├── main.tsx         # エントリーポイント
│   └── index.css        # グローバルスタイル
├── _workspace/          # 開発・仕様管理用ディレクトリ
├── .github/             # GitHub Actions ワークフロー
├── .vscode/             # VS Code設定
├── package.json         # 依存関係・スクリプト定義
├── vite.config.ts       # Vite・PWA設定
├── tsconfig.json        # TypeScript設定
├── postcss.config.cjs   # PostCSS設定
├── tailwind.config.cjs  # Tailwind CSS設定
└── index.html           # HTMLエントリーポイント
```

### デプロイ

Gitリポジトリへのプッシュをトリガーとして、Cloudflare Pagesが自動でビルドとデプロイを実行します。

### VS Code タスク設定

開発効率化のためのVS Codeタスク設定（`.vscode/tasks.json`）が含まれています。
VS Codeで `Ctrl+Shift+P` → `Tasks: Run Task` から各種チェックやビルドを一括実行できます。

### 貢献について

プルリクエストやイシューの報告を歓迎します。

---

## 将来拡張ロードマップ

### 優先度：高

- **外部プッシュ通知**: より確実な通知のため（Web Push API等）
