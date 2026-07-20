import type p5 from "p5";

interface Blob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseRadius: number;
  hue: number;
  alpha: number;
  noiseSeed: number;
  noiseSpeed: number;
  rotationOffset: number;
}

export const organicShapesSketch = (p: p5) => {
  const blobCount = 10;
  const vertexCount = 48;
  const noiseScale = 1.6;
  let blobs: Blob[] = [];

  const makeBlob = (): Blob => ({
    x: p.random(p.width),
    y: p.random(p.height),
    vx: p.random(-0.3, 0.3),
    vy: p.random(-0.3, 0.3),
    baseRadius: p.random(p.min(p.width, p.height) * 0.08, p.min(p.width, p.height) * 0.22),
    hue: p.random(360),
    alpha: p.random(14, 26),
    noiseSeed: p.random(1000),
    noiseSpeed: p.random(0.0025, 0.006),
    rotationOffset: p.random(p.TWO_PI),
  });

  const setupBlobs = () => {
    blobs = Array.from({ length: blobCount }, makeBlob);
  };

  // 円周上の各点にノイズで揺らぎを与え、滑らかな閉曲線(有機的な塊)として描画する
  const drawBlob = (blob: Blob, t: number) => {
    p.push();
    p.translate(blob.x, blob.y);
    p.fill(blob.hue, 65, 95, blob.alpha);
    p.beginShape();
    for (let i = 0; i <= vertexCount; i++) {
      const angle = (i / vertexCount) * p.TWO_PI + blob.rotationOffset;
      const nx = p.cos(angle) * noiseScale + 1;
      const ny = p.sin(angle) * noiseScale + 1;
      const n = p.noise(nx, ny, t);
      const r = blob.baseRadius * p.map(n, 0, 1, 0.55, 1.3);
      const vx = p.cos(angle) * r;
      const vy = p.sin(angle) * r;
      p.curveVertex(vx, vy);
    }
    p.endShape(p.CLOSE);
    p.pop();
  };

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.colorMode(p.HSB, 360, 100, 100, 100);
    p.noStroke();
    p.blendMode(p.ADD);
    setupBlobs();
  };

  p.draw = () => {
    p.blendMode(p.BLEND);
    p.background(230, 40, 8);
    p.blendMode(p.ADD);

    for (const blob of blobs) {
      blob.x += blob.vx;
      blob.y += blob.vy;

      const margin = blob.baseRadius * 1.3;
      if (blob.x < -margin) blob.x = p.width + margin;
      if (blob.x > p.width + margin) blob.x = -margin;
      if (blob.y < -margin) blob.y = p.height + margin;
      if (blob.y > p.height + margin) blob.y = -margin;

      const t = blob.noiseSeed + p.frameCount * blob.noiseSpeed;
      drawBlob(blob, t);
    }
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
  };

  p.mousePressed = () => {
    setupBlobs();
  };

  p.keyPressed = () => {
    if (p.key === "r" || p.key === "R") {
      setupBlobs();
    }
  };
};
