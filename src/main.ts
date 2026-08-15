import p5 from "p5";
import { sketches, sketchTitles } from "./sketches";

const params = new URLSearchParams(window.location.search);
const requested = params.get("sketch");

// ?sketch= が無い / 未知の名前ならスケッチ一覧 (インデックス) を表示する
if (!requested || !(requested in sketches)) {
  if (requested) {
    console.warn(`[creative-coding] unknown sketch "${requested}"`);
  }
  void import("./gallery").then(({ renderGallery }) => renderGallery());
} else {
  document.title = `${sketchTitles[requested]} / Creative Coding Sandbox`;

  new p5(sketches[requested]);

  const back = document.createElement("a");
  back.className = "back-link";
  back.href = "./";
  back.textContent = "← index";
  document.body.appendChild(back);

  console.log(`[creative-coding] running "${requested}".`);
}
