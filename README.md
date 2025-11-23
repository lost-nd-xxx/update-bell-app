# おしらせベル

URLを添えてリマインド通知するPWA（Progressive Web App）です。ウェブ漫画の更新チェック、新商品の発売確認、イベント開催チェックなど、定期的に確認したいウェブページを忘れずにチェックできます。

## 🚀 ライブデモ

**[https://lost-nd-xxx.github.io/update-bell-app/](https://lost-nd-xxx.github.io/update-bell-app/)**

PWAとしてホーム画面にインストールして使用することをお勧めします。

## ✨ 特徴

- 📱 **PWA対応** - ホーム画面にインストール可能、アプリのような使い心地
- 🔔 **柔軟な通知設定** - 毎日・毎週・毎月（第n曜日）など多彩な周期設定
- 🏷️ **タグ機能** - リマインダーを分類・検索で効率的に管理
- 🌙 **ダークモード** - ライト・ダーク・システム準拠の3モード
- 💾 **データ管理** - JSON形式でのエクスポート/インポート対応
- ⏸️ **一時停止機能** - 休載期間中や一時的に通知を停止
- 🌍 **タイムゾーン対応** - 移動時の時刻調整をサポート
- 🔍 **検索・フィルター** - タイトル・URL・タグでの絞り込み

### PWAとは？
PWA（Progressive Web App）は、Webサイトをスマホアプリのように使える技術です。ブラウザから「ホーム画面に追加」することで、アプリアイコンが作成され、より安定した通知を受け取れるようになります。

## 📱 対応環境

- **ブラウザ**: Chrome、Firefox、Safari、Edge（最新版推奨）
- **OS**: Windows、macOS、Linux、Android、iOS
- **通知**: ブラウザの通知機能を使用（PWAインストール推奨）

## 🎯 使用方法

### 基本的な使い方

1. **リマインダーの作成**
   - 「+」ボタンをクリック
   - タイトルとURLを入力
   - 通知周期と時刻を設定
   - タグを追加（任意）

2. **通知の設定**
   - 初回使用時にブラウザの通知許可を求められます
   - 設定画面でチェック間隔を調整可能（15分〜2時間）
   - PWAとしてインストールすることで、より確実な通知を受信できます

3. **管理機能**
   - 一時停止：コンテンツの休載中などに通知を停止
   - 編集：タイトル・URL・周期の変更
   - タグ：分類・検索による効率的な管理

### 活用例

- **ウェブ漫画**: 連載漫画の更新日チェック
- **ショッピング**: 新商品の発売確認
- **イベント**: 申込開始日やチケット発売日
- **ニュース**: 特定サイトの更新確認
- **ブログ**: お気に入りブロガーの更新チェック

### 周期設定の詳細

- **毎日**: 指定時刻に毎日通知
- **数日ごと**: n日間隔での通知
- **毎週○曜日**: 特定の曜日に通知
- **毎週☆曜日（複数）**: 複数の曜日を選択して通知
- **毎月第△週◇曜日**: 月の第n週の特定曜日に通知

### データのバックアップ

設定画面から全データをJSON形式でエクスポートできます。定期的なバックアップをお勧めします。

## ⚠️ 注意事項

- **ブラウザ依存**: 通知機能はブラウザとOSの設定に依存します
- **データ保存**: ブラウザのローカルストレージを使用（キャッシュクリアで消失の可能性）
- **通知機能の制約**: アプリからの通知は、WebブラウザまたはPWAがバックグラウンドで動作している必要があります。アプリを終了した場合や、端末の省電力モードが強く働いている場合は、通知を受信できないことがあります。確実に通知を受信するためには、PWAとしてインストールし、アプリを終了せずバックグラウンドに待機させてご利用ください。
- **定期バックアップ推奨**: 重要なデータは定期的にエクスポートしてください
- **オフライン機能**: 現在はオフラインでも基本機能が使用できますが、将来的に外部サービス導入により廃止される可能性があります

## 🔮 今後の予定

- 外部プッシュ通知サービスの導入（より確実な通知のため）

**注意**: 外部サービス導入により、将来的にはインターネット接続が必須となり、オフライン動作はできなくなる予定です。

---

## 🛠️ 開発者向け情報

**このプロジェクトは Claude AI によってほぼ全体が実装されており、人間の開発者は主に仕様策定、ビルド、デバッグを担当しています。**

### 技術スタック

- **フロントエンド**: React 18 + TypeScript + Tailwind CSS
- **PWA**: Service Worker + vite-plugin-pwa + Web Notifications API
- **ビルドツール**: Vite + TypeScript
- **デプロイ**: GitHub Pages + GitHub Actions
- **アイコン**: Lucide React
- **状態管理**: React Hooks（カスタムフック活用）

### 📋 プロジェクト仕様書

詳細な仕様については、以下をご参照ください：
- **[プロジェクト仕様書](./update_bell_spec.md)** - アプリの詳細仕様と実装状況

#### 仕様書の内容
- 機能仕様と実装状況
- 技術構成と依存関係
- データ管理とエクスポート/インポート仕様
- PWA対応とService Worker設定
- 今後の拡張予定

### 開発環境のセットアップ

#### 必要な環境
- Node.js 18.0.0 以上
- npm または yarn

#### セットアップ手順

```bash
# リポジトリのクローン
git clone https://github.com/lost-nd-xxx/update-bell-app.git
cd update-bell-app

# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev
```

開発サーバーは `http://localhost:3000` で起動します。

#### 利用可能なスクリプト

```bash
# 開発サーバー起動
npm run dev

# 本番ビルド
npm run build

# ビルド結果のプレビュー
npm run preview

# 型チェック
npm run type-check

# ESLint実行
npm run lint

# ESLint自動修正
npm run lint:fix

# Prettier実行
npm run format
```

### プロジェクト構造

```
src/                # ソースコード
├── components/          # Reactコンポーネント
│   ├── Dashboard.tsx    # メインダッシュボード
│   ├── CreateReminder.tsx # リマインダー作成・編集
│   ├── Settings.tsx     # 設定画面
│   ├── ReminderCard.tsx # リマインダー表示カード
│   ├── TagFilter.tsx    # タグフィルター
│   ├── Header.tsx       # ヘッダーコンポーネント
│   └── TimezoneChangeDialog.tsx # タイムゾーン変更ダイアログ
├── hooks/              # カスタムフック
│   ├── useReminders.ts # リマインダー管理
│   ├── useSettings.ts  # 設定管理
│   ├── useTheme.ts     # テーマ管理
│   └── useTimezone.ts  # タイムゾーン管理
├── types/              # TypeScript型定義
│   └── index.ts
├── utils/              # ユーティリティ関数
│   └── helpers.ts
├── App.tsx             # メインアプリコンポーネント
├── main.tsx           # エントリーポイント
└── index.css          # グローバルスタイル
public/             # 静的ファイル
├── icon-.png         # PWAアイコン各サイズ
├── screenshot-.png   # PWAスクリーンショット
└── sw.js             # Service Worker
_workspace/         # 開発・仕様管理
├── update_bell_spec.md # プロジェクト仕様書
├── *.svg              # アイコン・画像素材（SVG）
├── *.png              # アイコン・画像素材（PNG）
└── *.psd              # アイコン・画像素材（Photoshop）
.vscode/            # VS Code設定
├── tasks.json         # 開発タスク設定
└── extensions.json    # 推奨拡張機能
package.json        # 依存関係・スクリプト定義
package-lock.json   # 依存関係ロックファイル
vite.config.ts      # Vite・PWA設定
tsconfig.json       # TypeScript設定
tsconfig.node.json  # TypeScript（Node.js）設定
index.html          # HTMLエントリーポイント
LICENSE             # MITライセンス
THIRD-PARTY-LICENSES.md # サードパーティライセンス
README.md           # プロジェクト説明
```

### PWA設定

PWA機能は `vite-plugin-pwa` を使用して実装されています。

#### Service Worker
- 本番環境でのみ登録
- キャッシュ戦略: Cache First（静的リソース）+ Network First（API）
- 通知機能: 定期チェック + バックグラウンド同期

#### マニフェスト
- アプリ名: 「おしらせベル」
- アイコン: 72x72 〜 512x512（マスク対応）
- ショートカット: 新規作成・設定画面

### デプロイ

GitHub Actionsを使用してGitHub Pagesに自動デプロイされます。

```yaml
# .github/workflows/deploy.yml で設定
# main ブランチへのプッシュで自動実行
```

### VS Code タスク設定

このプロジェクトには開発効率化のためのVS Code タスク設定（`.vscode/tasks.json`）が含まれています：

- **🔍 全チェック実行**: 型チェック + ESLint + Prettier を一括実行
- **🛠️ 修正付き全チェック**: ESLint自動修正 + Prettier を含む一括実行
- **🚀 開発サーバー起動**: Vite開発サーバーを起動
- **📦 本番ビルド**: 本番用ビルドを実行

VS Codeで `Ctrl+Shift+P` → `Tasks: Run Task` から実行できます。

### 貢献について

プルリクエストやイシューの報告を歓迎します！

#### 開発ガイドライン

1. **コードスタイル**: ESLint + Prettier設定に従ってください
2. **型安全性**: TypeScriptの型チェックを通してください
3. **テスト**: 重要な機能は動作確認をお願いします
4. **コミット**: 変更内容を明確にしたコミットメッセージをお願いします

#### プルリクエストの流れ

1. このリポジトリをフォーク
2. 機能ブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

### ライセンス

MIT License - 詳細は [LICENSE](LICENSE) ファイルを参照してください。

### Third Party Licenses

このプロジェクトは複数のオープンソースライブラリを使用しています。使用しているライブラリとそのライセンス情報については [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md) をご確認ください。

### 作者

**lost_nd_xxx（ろすえん）** - 仕様策定・プロジェクト管理  
**Claude AI** - 実装・コード作成

### サポート・免責事項

このプロジェクトは個人開発のため、サポートは限定的です。以下の点にご注意ください：

- 🐛 **バグ報告**: GitHubのIssueでお知らせください（対応に時間がかかる場合があります）
- 💡 **機能要望**: 歓迎しますが、実装をお約束するものではありません
- 🔧 **メンテナンス**: 不定期での更新となります
- ⚠️ **免責**: 本アプリの使用により生じたいかなる損害についても責任を負いかねます

---

**このプロジェクトは Claude AI によってほぼ全体が実装されており、人間の開発者は主に仕様策定、ビルド、デバッグを担当しています。**