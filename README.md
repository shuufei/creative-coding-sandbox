# creative-coding-202607

p5.js + TypeScript + Vite によるクリエイティブコーディング実験環境。

## セットアップ

```sh
npm install
npm run dev
```

ブラウザで `http://localhost:5173` を開く。

## スケッチの切り替え

`src/sketches/index.ts` にスケッチを登録している。URL クエリで切り替え可能:

- `http://localhost:5173/?sketch=particles`
- `http://localhost:5173/?sketch=flow-field`
- `http://localhost:5173/?sketch=grid-pattern`

## 新しいスケッチの追加

1. `src/sketches/` に `p5` インスタンスモードの関数を作成 (`(p: p5) => void`)
2. `src/sketches/index.ts` の `sketches` に登録

## ビルド

```sh
npm run build
npm run preview
```
