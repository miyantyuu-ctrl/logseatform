# EDICODE 完了報告フォームシステム

各章の調理チャレンジ完了後に、生徒さんが提出する「完了報告フォーム」を管理するReact製アプリです。
`edicode-test-system`（確認テスト）と同じ配色・カードデザインを流用していますが、
採点エンジンは持たず、報告内容の入力→確認→完了証PDF出力のみを行う、別アプリとして構築しています。

## セットアップ

```bash
npm install
npm run dev
```

`npm run build` で `dist/` に静的ファイルが出力されます（GitHub Pagesにそのままデプロイ可能）。

## 構成

```
src/
  App.jsx              画面遷移・PDF出力を行う汎用エンジン
  config.js             現在アクティブな報告フォームバージョンの切り替えポイント
  theme.js               edicode-test-systemと共通の配色
  components/            Icon・ReviewTextBoxなど使い回すUI部品
  reports/
    chapter8-cooking-challenge/   「報告フォームバージョン」1つぶんのフォルダ
      meta.js              設問文言・完了証の表示情報（Canvaデザイン原文どおり）
      dishes.js            料理選択の段階的プルダウン用データ（食材カテゴリ→調理法→料理名）
      index.js             上記をまとめてエクスポート
```

## 新しい章の報告フォームを追加する場合

1. `src/reports/<report-id>/` を新規作成し、`meta.js` / `dishes.js` / `index.js` を用意する
   （`chapter8-cooking-challenge` をコピーして書き換えるのが早い）。
2. `src/config.js` の import 先を新しいパックの `index.js` に変更する。

## 料理を追加する場合（第8章）

`src/reports/chapter8-cooking-challenge/dishes.js` の `CATEGORIES` 配下、該当する
カテゴリ→調理法の `dishes` 配列に `{ id, label }` を追加するだけでよい。
新しい調理法や、魚・野菜カテゴリの料理を追加する場合も同じファイルを編集する。
