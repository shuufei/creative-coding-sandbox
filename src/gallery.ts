import p5 from "p5";
import { sketchList, type SketchEntry } from "./sketches";
import "./gallery.css";

// サムネは各スケッチを実際に一度走らせて、その canvas を縮小した画像を使う。
// 生成コストが高いスケッチもあるので 1 件ずつ順番に処理し、
// 結果は sessionStorage に入れて一覧 <-> スケッチの行き来では再生成しない。
const THUMB_MAX_PX = 640;
const CACHE_PREFIX = "cc-thumb:";
// 少しずつ描き進めて最後に noLoop() するスケッチがあるので、描画が止まるまで進める。
// ずっとループするスケッチのために上限も設ける
const MAX_FRAMES = 400;
const MAX_WAIT_MS = 6000;

type Card = {
  entry: SketchEntry;
  thumb: HTMLElement;
  status: HTMLElement;
  image: HTMLImageElement;
};

const cache = {
  get(name: string): string | null {
    try {
      return sessionStorage.getItem(CACHE_PREFIX + name);
    } catch {
      return null;
    }
  },
  set(name: string, url: string) {
    try {
      sessionStorage.setItem(CACHE_PREFIX + name, url);
    } catch {
      // 容量超過などは無視する (次回また生成すればよい)
    }
  },
  clear() {
    try {
      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith(CACHE_PREFIX)) sessionStorage.removeItem(key);
      }
    } catch {
      // noop
    }
  },
};

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// @types/p5 に isLooping() の型がないので実体を見て判定する
const isLooping = (instance: p5): boolean => {
  const fn = (instance as unknown as { isLooping?: () => boolean }).isLooping;
  return typeof fn === "function" ? fn.call(instance) : true;
};

/** pixelDensity 込みの大きい canvas を段階的に半分ずつ縮小して滑らかに落とす */
const toThumbDataUrl = (source: HTMLCanvasElement): string => {
  const ratio = Math.min(
    1,
    THUMB_MAX_PX / Math.max(source.width, source.height),
  );
  const targetW = Math.max(1, Math.round(source.width * ratio));
  const targetH = Math.max(1, Math.round(source.height * ratio));

  let current: HTMLCanvasElement = source;
  let width = source.width;
  let height = source.height;

  while (width > targetW * 2 && height > targetH * 2) {
    width = Math.max(targetW, Math.round(width / 2));
    height = Math.max(targetH, Math.round(height / 2));
    const step = document.createElement("canvas");
    step.width = width;
    step.height = height;
    const stepCtx = step.getContext("2d");
    if (!stepCtx) break;
    stepCtx.imageSmoothingEnabled = true;
    stepCtx.imageSmoothingQuality = "high";
    stepCtx.drawImage(current, 0, 0, width, height);
    current = step;
  }

  const out = document.createElement("canvas");
  out.width = targetW;
  out.height = targetH;
  const ctx = out.getContext("2d");
  if (!ctx) return source.toDataURL("image/png");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(current, 0, 0, targetW, targetH);
  return out.toDataURL("image/webp", 0.85);
};

/** スケッチを画面外で 1 インスタンス動かし、描画結果を画像にして片付ける */
const renderThumb = async (entry: SketchEntry): Promise<string> => {
  const stage = document.createElement("div");
  stage.className = "thumb-stage";
  document.body.appendChild(stage);

  // p5 は第 2 引数のノード配下に canvas と createSelect などの UI を作るので、
  // スケッチが作る DOM ごとまとめて捨てられる
  let instance: p5 | null = null;
  try {
    instance = new p5(entry.sketch, stage);

    // setup は同期的に走り終わっている。draw で描き足していくスケッチのために、
    // 描画が止まる (noLoop) まで redraw() でフレームを進める。
    // requestAnimationFrame 待ちだとタブの状態でフレームレートが落ちて
    // 描き終わる前に打ち切られるので、自前で 1 フレームずつ進める
    const startedAt = performance.now();
    for (let frame = 0; frame < MAX_FRAMES; frame++) {
      if (!isLooping(instance)) break;
      instance.redraw();
      // 数フレームごとに制御を返して一覧の操作を止めないようにする
      if (frame % 8 === 7) await nextFrame();
      if (performance.now() - startedAt > MAX_WAIT_MS) break;
    }
    await nextFrame();

    const canvas = stage.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error(`canvas not found: ${entry.name}`);
    }
    return toThumbDataUrl(canvas);
  } finally {
    instance?.remove();
    stage.remove();
  }
};

const setThumb = (card: Card, url: string) => {
  card.image.src = url;
  card.image.style.display = "block";
  card.status.textContent = "";
  card.thumb.classList.remove("is-loading");
};

const generate = async (card: Card, force = false) => {
  const cached = !force && cache.get(card.entry.name);
  if (cached) {
    setThumb(card, cached);
    return;
  }

  card.image.style.display = "none";
  card.thumb.classList.add("is-loading");
  card.status.textContent = "generating";

  try {
    const url = await renderThumb(card.entry);
    cache.set(card.entry.name, url);
    setThumb(card, url);
  } catch (error) {
    console.error(`[gallery] failed to render "${card.entry.name}"`, error);
    card.thumb.classList.remove("is-loading");
    card.status.textContent = "failed";
  }
};

const buildCard = (entry: SketchEntry): { element: HTMLElement; card: Card } => {
  const element = document.createElement("a");
  element.className = "card";
  element.href = `?sketch=${encodeURIComponent(entry.name)}`;
  element.dataset.category = entry.category;

  const thumb = document.createElement("div");
  thumb.className = "thumb is-loading";

  const image = document.createElement("img");
  image.alt = entry.title;
  image.loading = "lazy";
  image.style.display = "none";

  const status = document.createElement("div");
  status.className = "status";
  status.textContent = "waiting";

  const regen = document.createElement("button");
  regen.className = "regen";
  regen.type = "button";
  regen.title = "このサムネを再生成";
  regen.textContent = "↻";

  thumb.append(image, status, regen);

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.innerHTML = `<div class="title"></div><div class="sub"></div>`;
  meta.querySelector(".title")!.textContent = entry.title;
  meta.querySelector(".sub")!.textContent = `${entry.category} / ${entry.name}`;

  element.append(thumb, meta);

  const card: Card = { entry, thumb, status, image };

  regen.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void generate(card, true);
  });

  return { element, card };
};

export const renderGallery = () => {
  document.title = "Sketch Index / Creative Coding Sandbox";

  const root = document.createElement("div");
  root.className = "gallery";

  const header = document.createElement("header");
  header.className = "gallery-header";
  header.innerHTML = `
    <h1>Sketch Index</h1>
    <span class="count">${sketchList.length} sketches</span>
    <span class="spacer"></span>
  `;

  const regenAll = document.createElement("button");
  regenAll.className = "ghost-button";
  regenAll.type = "button";
  regenAll.textContent = "すべて再生成";
  header.appendChild(regenAll);

  const filters = document.createElement("div");
  filters.className = "filters";

  const grid = document.createElement("div");
  grid.className = "grid";

  const cards: { element: HTMLElement; card: Card }[] = sketchList.map(buildCard);
  for (const { element } of cards) grid.appendChild(element);

  const categories = ["all", ...new Set(sketchList.map((e) => e.category))];
  const filterButtons = categories.map((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = category;
    button.setAttribute("aria-pressed", String(category === "all"));
    button.addEventListener("click", () => {
      for (const other of filterButtons) {
        other.setAttribute("aria-pressed", String(other === button));
      }
      for (const { element } of cards) {
        const match = category === "all" || element.dataset.category === category;
        element.classList.toggle("is-hidden", !match);
      }
    });
    filters.appendChild(button);
    return button;
  });

  root.append(header, filters, grid);
  document.body.appendChild(root);

  // 1 件ずつ順に生成する。重いスケッチが混ざっても操作を完全には塞がないよう
  // 各生成のあいだに一息入れる
  let queue = Promise.resolve();
  const enqueueAll = (force: boolean) => {
    for (const { card } of cards) {
      queue = queue.then(async () => {
        await generate(card, force);
        await wait(30);
      });
    }
  };

  regenAll.addEventListener("click", () => {
    cache.clear();
    enqueueAll(true);
  });

  enqueueAll(false);
};
