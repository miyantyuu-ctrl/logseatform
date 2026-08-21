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

1. `src/tests/test4-niku/` フォルダ（確認テスト④、フィードバックを反映済みの最新形式）を丸ごとコピーし、
   わかりやすい名前（例: `src/tests/test5-xxx/`）に変更する。
2. コピーした中の `questions.js` を新しい設問に差し替える。
   - 選択式(`radio`)・複数選択(`checkbox`)・穴埋め(`mixed`)に対応。
   - 各設問には `topic`（題材ラベル。Q番号の隣にグレー文字で表示される短いタイトル）を必ず設定する。
     `question` 本文にはタイトル行を含めない。
   - 前提情報と説明文章を分けたい設問（例:「目指す仕上がり」＋「選択肢の説明」と、それを踏まえた
     解説文が両方ある場合）は、`description`（前提情報＝グレー背景）と `analysis`（解説文＝白背景・
     ゴールド枠）を分けて設定する。1つのブロックにまとめない。
   - 選択肢を「失敗要因／次に取るべき行動」のように2要素に分けたい場合は、選択肢文字列の中に `\n` を
     入れる（エンジン側が `whitespace-pre-line` / `pre-wrap` で改行を反映する）。
   - 特殊な採点ロジックが必要な問題は、設問オブジェクトに `score(ua)` 関数を追加すると
     エンジン側の既定ルールより優先される。
3. `meta.js` を新しいテーマに差し替える。
   - `intro1` は受講の目的（受講について）のみを扱う。
   - `intro2` は「受講の流れ」（flowTitle/flowLead/flowSteps）だけに留め、記入方法の詳細は入れない。
   - 最終問題（自由記述の設計課題）がある場合は `meta.worksheetIntro`
     （noteTitle/noteBody/exampleLabel/examples/checklistTitle/checklist）を用意し、
     最終問題に入る直前の案内ページとして表示する（Q1〜9を解いている間は表示しない）。
   - `meta.worksheet.steps` の各STEPは、細かく分割した入力欄ではなく「ドキュメント形式」
     （1STEPにつき自由記述のtextarea 1つ、`fields: [{ key, label: '（自由記述）', placeholder }]`）
     で作る。placeholderに、考えるべき観点を「例）〜／〜／〜」の形で列挙するとよい。
   - `reasoningField` / `notesField` は必要な場合のみ設定する（不要なら省略してよい）。
   - 合格証（PDF1ページ目）用に `certChapterNumber` / `certCourseTitle` / `certIssuerRole` /
     `certIssuerName` / `reportSubtitle` を設定する。
4. 固有の図がある場合は `Graphs.jsx` を編集し、`questions.js` の `diagram` フィールドで参照する。
5. `src/config.js` の import 先を新しいフォルダの `index.js` に変更する。

これでアプリ全体（表紙・説明・前提情報・回答・採点・PDF出力）が新しい問題セットに切り替わります。
複数バージョンを同時に持たせたい場合は、`config.js` を URLパラメータやルーティングで
出し分ける形に拡張してください（現状は1バージョンを表示するシンプルな構成です）。

## 合格証（PDF）のデザインを新しいテーマに合わせる場合

合格証は「Canvaなどで作った、文字の入っていない背景画像」に、テキストをCSSで重ねて表示する方式に
なっている（`html2canvas` でキャプチャする都合上、装飾をコードで再現するより背景画像を使う方が
デザインの再現度が高く安定する）。

1. Canva等で作成した合格証テンプレートから、氏名・日付などの可変テキストを削除（または空欄）にした
   状態でPNG書き出しする（A4比率＝縦横比 210:297、解像度は高めが望ましい）。
2. `public/certificates/` に配置する（ファイル名は `cert-bg.png` に統一している）。
3. `App.jsx` の `pdf-cert-page-1` 内で、`backgroundImage: url(...)` として読み込み、
   `backgroundSize: '100% 100%'` で敷き、その上にテキストを絶対位置で重ねる。
   背景画像の余白（罫線・装飾が入っている範囲）を見ながら、テキストを重ねる範囲（`top/bottom/left/right`）
   を調整する。
4. 文字サイズ・フォントは、Canva側の実寸に合わせて `pt` 単位で指定する（`px` ではなく `pt` にすると
   Canva側の数値をそのまま使える）。フォントファミリーは `certFontFamily` としてまとめて定義している。
   指定したフォントが閲覧者の端末にインストールされていない場合、標準フォントにフォールバックされる点は
   あらかじめ伝えておくとよい。
5. 「確認テスト」のような複合語が行末で分断されると不格好になるので、分断されたくない語句は
   `<span style={{ whiteSpace: 'nowrap' }}>...</span>` で囲む。

## GitHubへのpush手順（非開発者向け運用フロー）

このプロジェクトは `https://github.com/miyantyuu-ctrl/logseatform` の `edicode-test-system/` 配下に
あり、GitHub Pages（GitHub Actions経由）で
`https://miyantyuu-ctrl.github.io/logseatform/edicode-test-system/` に自動デプロイされる。

pushには毎回、以下の権限を持つ fine-grained Personal Access Token が必要（リポジトリ側の設定は
変更していないため、トークンは使い切り・都度発行の運用）。

1. `https://github.com/settings/personal-access-tokens/new` を開く。
2. Repository access → Only select repositories → `logseatform` を選択。
3. Permissions → Repository permissions → **Contents: Read and write** に設定
   （ドロップダウンが実際に反映されているか要確認）。
4. Generate token → 発行されたトークンを使って push する。
5. push完了後、発行したトークンは必ず失効（削除）する。

## Firebase（クラウド下書き保存）について

## Firebase（クラウド下書き保存）について

`.env` に `VITE_FIREBASE_*` を設定すると、下書き・回答途中データがFirestoreに保存され、
複数端末で同期されます。未設定の場合は自動的にブラウザの `localStorage` のみで動作します
（オフラインでも下書き保存自体は機能します）。

## PDF出力について

合格証・回答レポートのPDF化には `html2canvas` と `jsPDF` を実行時にCDNから読み込んでいます
（元のプロトタイプと同じ方式）。オフライン環境で使う場合は、これらをnpm依存に切り替えて
バンドルする対応が別途必要です。
