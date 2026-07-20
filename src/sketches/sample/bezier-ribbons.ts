import type p5 from "p5";

export const bezierRibbonsSketch = (p: p5) => {
  const ribbonCount = 14;
  let hueOffset = 0;

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.colorMode(p.HSB, 360, 100, 100, 100);
    p.noFill();
  };

  p.draw = () => {
    p.background(230, 40, 8);

    const mx = p.mouseX;
    const my = p.mouseY;

    for (let i = 0; i < ribbonCount; i++) {
      const baseY = p.map(i, 0, ribbonCount - 1, p.height * 0.12, p.height * 0.88);
      const t = p.frameCount * 0.01 + i * 0.4;

      const x1 = 0;
      const y1 = baseY + p.sin(t) * 18;
      const x4 = p.width;
      const y4 = baseY + p.cos(t * 0.8) * 18;

      let cp1x = p.width * 0.33;
      let cp1y = baseY + p.sin(t * 1.4 + i) * 60;
      let cp2x = p.width * 0.66;
      let cp2y = baseY + p.cos(t * 1.1 + i) * 60;

      // マウスに近い制御点をなめらかに引き寄せる
      const pull = 0.25;
      const d1 = p.dist(mx, my, cp1x, cp1y);
      const falloff1 = p.constrain(1 - d1 / 400, 0, 1);
      cp1x += (mx - cp1x) * pull * falloff1;
      cp1y += (my - cp1y) * pull * falloff1;

      const d2 = p.dist(mx, my, cp2x, cp2y);
      const falloff2 = p.constrain(1 - d2 / 400, 0, 1);
      cp2x += (mx - cp2x) * pull * falloff2;
      cp2y += (my - cp2y) * pull * falloff2;

      const hue = (hueOffset + p.map(i, 0, ribbonCount - 1, 0, 300)) % 360;
      const weight = p.map(i, 0, ribbonCount - 1, 1, 4);

      p.stroke(hue, 70, 95, 70);
      p.strokeWeight(weight);
      p.bezier(x1, y1, cp1x, cp1y, cp2x, cp2y, x4, y4);
    }

    hueOffset += 0.15;
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
  };
};
