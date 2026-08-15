# creative-coding-202607

p5.js + TypeScript + Vite によるクリエイティブコーディング実験環境。

## セットアップ

```sh
npm install
npm run dev
```

ブラウザで `http://localhost:5173` を開く。

## スケッチ一覧 (インデックスページ)

ルート (`http://localhost:5173/`) は登録済みスケッチの一覧ページ。
各スケッチを画面外で実際に 1 回走らせ、その描画結果を縮小したものをサムネイルに使う
(実装: `src/gallery.ts`)。

- カードをクリックするとそのスケッチを開く
- カード右上の `↻` でそのサムネだけ再生成 (パターンは毎回ランダム)
- ヘッダーの「すべて再生成」で全部作り直す
- サムネは sessionStorage にキャッシュされるので、一覧とスケッチの行き来では再生成しない

## スケッチの切り替え

`src/sketches/index.ts` にスケッチを登録している。URL クエリで直接開くことも可能:

- `http://localhost:5173/?sketch=random-geometry`
- `http://localhost:5173/?sketch=color-grid`

スケッチ表示中は左下の `← index` で一覧に戻る。

## 新しいスケッチの追加

1. `src/sketches/` に `p5` インスタンスモードの関数を作成 (`(p: p5) => void`)
2. `src/sketches/index.ts` の `sketchList` に `name` / `title` / `category` / `sketch` を追加
   (一覧ページとサムネはここから自動で作られる)

## ビルド

```sh
npm run build
npm run preview
```
