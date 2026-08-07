# EDICODE 確認テストシステム

EDICODEの理解度確認テスト（回答 → 採点 → 解説 → PDF出力）を行うReact製アプリです。
Geminiで作成した単一ファイル版のプロトタイプを、GitHubで管理しやすい構成に作り直したものです。

## セットアップ

```bash
npm install
cp .env.example .env   # Firebaseを使う場合は値を入力（使わない場合は空のままでOK）
npm run dev
```

`npm run build` で `dist/` に静的ファイルが出力されます（GitHub Pages / Vercel / Netlify などにそのままデプロイ可能）。

## 構成

```
src/
  App.jsx              問題データに依存しない汎用エンジン（画面遷移・採点・下書き保存・PDF出力）
  firebase.js          Firebaseの初期化（.envが未設定ならlocalStorageのみで動作）
  config.js            現在アクティブなテストバージョンの切り替えポイント
  theme.js             共通の配色
  components/          Icon・ReviewTextBoxなど使い回すUI部品
  tests/
    test3-ajisui/      「テストバージョン」1つぶんのフォルダ
      questions.js      設問データ・配点・正解・解説
      meta.js            タイトル・前提情報（ゴール／レシピ／味見した印象）・回答フォームの選択肢
      Graphs.jsx         このバージョン固有の図（コクのグラフ等）
      index.js           上記をまとめてエクスポート
```

エンジン（App.jsx）はテスト内容を一切ハードコードしていません。表示するテキストや選択肢は、すべて
`meta.js` / `questions.js` から読み込みます。

## 新しいテストバージョンを追加する手順

1. `src/tests/test3-ajisui/` フォルダを丸ごとコピーし、わかりやすい名前（例: `src/tests/test4-xxx/`）に変更する。
2. コピーした中の `questions.js` を新しい設問に差し替える。
   - 選択式(`radio`)・複数選択(`checkbox`)・穴埋め(`mixed`)に対応。
   - 特殊な採点ロジックが必要な問題は、設問オブジェクトに `score(ua)` 関数を追加すると
     エンジン側の既定ルールより優先される。
3. `meta.js` を新しいテーマ（料理名・ゴール・レシピ・味見した印象・回答フォームの選択肢など）に差し替える。
4. 固有の図がある場合は `Graphs.jsx` を編集し、`questions.js` の `diagram` フィールドで参照する。
5. `src/config.js` の import 先を新しいフォルダの `index.js` に変更する。

これでアプリ全体（表紙・説明・前提情報・回答・採点・PDF出力）が新しい問題セットに切り替わります。
複数バージョンを同時に持たせたい場合は、`config.js` を URLパラメータやルーティングで
出し分ける形に拡張してください（現状は1バージョンを表示するシンプルな構成です）。

## Firebase（クラウド下書き保存）について

`.env` に `VITE_FIREBASE_*` を設定すると、下書き・回答途中データがFirestoreに保存され、
複数端末で同期されます。未設定の場合は自動的にブラウザの `localStorage` のみで動作します
（オフラインでも下書き保存自体は機能します）。

## PDF出力について

合格証・回答レポートのPDF化には `html2canvas` と `jsPDF` を実行時にCDNから読み込んでいます
（元のプロトタイプと同じ方式）。オフライン環境で使う場合は、これらをnpm依存に切り替えて
バンドルする対応が別途必要です。
