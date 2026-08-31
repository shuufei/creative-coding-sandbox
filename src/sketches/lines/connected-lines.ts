import type p5 from "p5";

/**
 * 線をランダムに描画する。
 *
 * 1本描いたら、その終点から次の線を描く。これを指定本数くり返すので、
 * 全体は「途切れない1本の折れ線」になる。線の色は黒のみ。
 *
 * 見え方を決めるのは 3つ。
 *
 *   向き:   次の線をどちらへ伸ばすか (ランダム / 一定)
 *   長さ:   次の線をどれだけ伸ばすか (ランダム / 一定)
 *   かたち: その1本を直線で引くか、3次ベジェ曲線で引くか
 *
 * 向きと長さがどちらもランダムなら乱歩 (ランダムウォーク) になり、
 * どちらも一定なら折り返しだけで進む規則的な図形になる。
 * 片方だけ一定にすると、その中間が見える。
 *
 * かたちを曲線にすると、同じ折れ線がそのまま曲線のパターンになる。
 * とくに「なめらか」は、つなぎ目の左右で接線を一致させて
 * 折れ目のない1本の曲線にしている (Catmull-Rom スプラインのベジェ表現)。
 *
 * かたちが「直線」のときは、線どうしが交わらないように描くこともできる
 * (自己回避ウォーク)。1本ずつ、これまでに引いた線と交わらない候補を探して置く。
 *
 * さらに「直線をまぜる」で、一部の線だけを直線に戻せる。
 * なめらかな曲線とまぜたときは、直線と接する向きに曲線を出し入れするので、
 * 直線から曲線へ、曲線から直線へ折れ目なく移り変わる。
 */

// 次の線の向きの決め方
// - free:   毎回ランダム (0〜360度)
// - dir8:   ランダムだが 45度刻み
// - dir4:   ランダムだが 90度刻み (縦横のみ)
// - wander: 前の線の向きから ± 範囲内でランダムに曲がる。なめらかに蛇行する
// - turn:   前の線の向きから毎回おなじ角度だけ曲がる (一定)
// - fixed:  最初に決めた向きのまま進む (一定)。壁で反射するので往復する
//
// wander / turn は「曲がる角度」を使う
type DirectionMode = "free" | "dir8" | "dir4" | "wander" | "turn" | "fixed";

// 次の線の長さの決め方
// - fixed:  すべて同じ長さ (一定)
// - random: 基準の長さの 15%〜100% でランダム
type LengthMode = "fixed" | "random";

// 1本ぶんをどんなかたちで引くか。すべて 3次ベジェ (p.bezier) で描く
// - straight:  直線
// - smooth:    折れ線の頂点をなめらかに通す曲線。
//              各頂点の接線を「前の点 -> 次の点」の向きに取り、その頂点に入る曲線と
//              出る曲線で同じ接線を使うので、つなぎ目に折れ目ができない
// - arcAlt:    1本ずつ弓なりにふくらませる。ふくらむ側を交互に入れ替えるので波打つ
// - arcRandom: 同じく弓なり。ふくらむ側は毎回ランダム
//
// smooth / arc は「曲がり具合」を使う
type CurveMode = "straight" | "smooth" | "arcAlt" | "arcRandom";

// 曲線のなかに直線をどうまぜるか
// - none:      まぜない (全部「かたち」のとおり)
// - random:    1本ずつ、割合にしたがってランダムに直線にする
// - alternate: 1本おきに直線 (曲線 -> 直線 -> 曲線 ...)
// - run:       数本ずつのかたまりで、直線の区間と曲線の区間を交互に置く
//
// random / run は「直線の割合」を使う
type MixMode = "none" | "random" | "alternate" | "run";

// 線どうしの交差を許すか。かたちが「直線」のときだけ効く
// (曲線は制御点しだいで大きくふくらむので、交差の判定が別ものになる)
type CrossMode = "allow" | "avoid";

// 描き始める位置
type StartMode = "center" | "random";

// 線と線のつなぎ目を描くか
type JointMode = "none" | "dot";

// @types/p5 の createSelect は p5.Element を返すだけで select 固有のメソッドがない
type SelectElement = p5.Element & {
  option(name: string): void;
  selected(name: string): void;
  changed(handler: () => void): void;
};

type Point = { x: number; y: number };

// 制御点 c1 / c2 は 3次ベジェのもの。直線のときは端点と一直線上に置くので、
// 描画側はかたちを気にせず bezier を呼ぶだけでよい
type Segment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
};

export const connectedLinesSketch = (p: p5) => {
  const size = 1000;

  const settings = {
    // 描く本数
    count: 100,
    direction: "free" as DirectionMode,
    // wander の振れ幅 / turn の毎回曲がる角度 (度)
    turnAngle: 45,
    length: "random" as LengthMode,
    // 基準の長さ (px)。一定ならこの長さ、ランダムならこれが上限
    baseLength: 80,
    curve: "smooth" as CurveMode,
    // smooth では接線の強さ、arc ではふくらみの大きさ。1 が標準
    curveAmount: 1,
    cross: "allow" as CrossMode,
    mix: "none" as MixMode,
    // まぜるときに直線にする本数の割合
    mixRatio: 0.5,
    start: "center" as StartMode,
    weight: 2,
    joint: "none" as JointMode,
    // 1秒あたりに描く本数。0 なら一度に全部描く
    speed: 60,
  };

  let segments: Segment[] = [];
  // すでに描いた本数。canvas は消さずに続きだけを足していく
  let drawn = 0;
  let lastMillis = 0;
  // 交差しない設定で行き止まりになったときの表示先
  let statusEl: p5.Element | undefined;
  // 端数を持ち越すための、描くべき本数の実数値
  let progress = 0;

  // --- 折れ線を作る -------------------------------------------------------

  const nextLength = (): number =>
    settings.length === "fixed"
      ? settings.baseLength
      : p.random(settings.baseLength * 0.15, settings.baseLength);

  // 前の線の向き prev から、次の線の向きを決める
  const nextAngle = (prev: number, index: number): number => {
    const turn = p.radians(settings.turnAngle);

    switch (settings.direction) {
      case "dir8":
        return Math.floor(p.random(8)) * (p.PI / 4);
      case "dir4":
        return Math.floor(p.random(4)) * p.HALF_PI;
      case "wander":
        return prev + p.random(-turn, turn);
      case "turn":
        // 毎回おなじ向きに曲がる。360 / 曲がる角度 が整数なら多角形になり、
        // 割り切れないと少しずつずれて花のような重なりになる
        return prev + turn;
      case "fixed":
        // 1本目だけ向きを決めて、あとは前の向き (= 反射ぶんを含む) をそのまま使う
        return index === 0 ? p.random(p.TWO_PI) : prev;
      default:
        return p.random(p.TWO_PI);
    }
  };

  // canvas からはみ出さない向きを返す。
  // まず壁で反射させ、それでも収まらなければ向きを引き直す
  const fitAngle = (x: number, y: number, angle: number, len: number): number => {
    const endX = (a: number) => x + Math.cos(a) * len;
    const endY = (a: number) => y + Math.sin(a) * len;
    const inside = (a: number) => {
      const nx = endX(a);
      const ny = endY(a);
      return nx >= 0 && nx <= size && ny >= 0 && ny <= size;
    };

    if (inside(angle)) return angle;

    // 左右の壁なら左右を、上下の壁なら上下を裏返す
    let reflected = angle;
    if (endX(angle) < 0 || endX(angle) > size) reflected = p.PI - reflected;
    if (endY(angle) < 0 || endY(angle) > size) reflected = -reflected;
    if (inside(reflected)) return reflected;

    // 角にはまったときの逃げ道。45度刻みの向きは刻みを保ったまま引き直す
    for (let i = 0; i < 64; i++) {
      const candidate =
        settings.direction === "dir4"
          ? Math.floor(p.random(4)) * p.HALF_PI
          : settings.direction === "dir8"
            ? Math.floor(p.random(8)) * (p.PI / 4)
            : p.random(p.TWO_PI);
      if (inside(candidate)) return candidate;
    }
    return reflected;
  };

  // --- 交差の判定 ---------------------------------------------------------

  const EPS = 1e-9;

  // a -> b に対して c が左 (1) / 右 (-1) / 一直線上 (0) のどちらにあるか
  const orient = (a: Point, b: Point, c: Point): number => {
    const v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    return v > EPS ? 1 : v < -EPS ? -1 : 0;
  };

  // 一直線上にある点が、線分 a-b の範囲に収まっているか
  const onSegment = (a: Point, b: Point, q: Point): boolean =>
    orient(a, b, q) === 0 &&
    Math.min(a.x, b.x) - EPS <= q.x &&
    q.x <= Math.max(a.x, b.x) + EPS &&
    Math.min(a.y, b.y) - EPS <= q.y &&
    q.y <= Math.max(a.y, b.y) + EPS;

  // 線分どうしが交わるか。端点で触れているだけ / 重なっているだけでも交差とみなす
  const segmentsCross = (a: Point, b: Point, c: Point, d: Point): boolean => {
    const o1 = orient(a, b, c);
    const o2 = orient(a, b, d);
    const o3 = orient(c, d, a);
    const o4 = orient(c, d, b);
    if (o1 !== o2 && o3 !== o4) return true;
    // 一直線に並んだとき (触れる / 重なる)
    return (
      (o1 === 0 && onSegment(a, b, c)) ||
      (o2 === 0 && onSegment(a, b, d)) ||
      (o3 === 0 && onSegment(c, d, a)) ||
      (o4 === 0 && onSegment(c, d, b))
    );
  };

  // 終点 to へ伸ばす候補が、これまでに引いた線と交わるか。
  // ひとつ前の線とは端点を共有しているので必ず「触れる」。
  // そこだけは、なぞって引き返していないか (中点が線上にあるか) で見る
  const crossesPlaced = (points: Point[], to: Point): boolean => {
    const last = points.length - 1;
    for (let j = 0; j < last - 1; j++) {
      if (segmentsCross(points[j], points[j + 1], points[last], to)) return true;
    }
    if (last >= 1) {
      const mid = { x: (points[last].x + to.x) / 2, y: (points[last].y + to.y) / 2 };
      if (onSegment(points[last - 1], points[last], mid)) return true;
    }
    return false;
  };

  // --- 折れ線 -------------------------------------------------------------

  // 折れ線の頂点を順に作る。交差しない候補が見つからなくなったら、
  // そこで打ち切る (指定より本数が少なくなる)
  const buildPoints = (): Point[] => {
    let x = settings.start === "center" ? size / 2 : p.random(size);
    let y = settings.start === "center" ? size / 2 : p.random(size);
    let angle = p.random(p.TWO_PI);

    // 交差しないのは、1本まるごと直線で引くときだけ
    const avoid = settings.curve === "straight" && settings.cross === "avoid";
    const points: Point[] = [{ x, y }];

    for (let i = 0; i < settings.count; i++) {
      let placed = false;

      // 候補を引き直す。向きも長さもランダムなら毎回別の候補になり、
      // 一定に固定しているときは長さを詰めることで隙間を探す
      for (let attempt = 0; attempt < (avoid ? 80 : 1); attempt++) {
        // 前半は素直に引き直し、それでも駄目なら少しずつ短くして隙間を探す。
        // 長さを「一定」にしているときは縮めない (長さが揃わなくなるため)
        const shrink =
          attempt < 30 || settings.length === "fixed"
            ? 1
            : Math.pow(0.93, attempt - 30);
        const len = nextLength() * shrink;
        const next = fitAngle(x, y, nextAngle(angle, i), len);
        const to = {
          x: x + Math.cos(next) * len,
          y: y + Math.sin(next) * len,
        };
        if (avoid && crossesPlaced(points, to)) continue;

        // 次の線は、いま描いた線の終点から始める = 接続する
        angle = next;
        x = to.x;
        y = to.y;
        points.push(to);
        placed = true;
        break;
      }

      // 行き止まり。まわりを自分の線で囲まれていて、どこへも伸ばせない
      if (!placed) break;
    }
    return points;
  };

  // どの線を直線にするか。true の線だけ「かたち」を無視して直線で引く
  const buildStraightFlags = (count: number): boolean[] => {
    const flags = new Array<boolean>(count).fill(false);
    if (settings.curve === "straight") return flags.fill(true);

    switch (settings.mix) {
      case "random":
        for (let i = 0; i < count; i++) flags[i] = p.random() < settings.mixRatio;
        return flags;
      case "alternate":
        for (let i = 0; i < count; i++) flags[i] = i % 2 === 1;
        return flags;
      case "run": {
        // 直線 / 曲線 を数本ずつのかたまりで交互に。
        // 割合が大きいほど直線のかたまりが長く、曲線のかたまりが短くなる
        let straight = p.random() < 0.5;
        for (let i = 0; i < count; ) {
          const weight = straight ? settings.mixRatio : 1 - settings.mixRatio;
          const run = Math.max(1, Math.round(p.random(2, 6) * weight * 2));
          for (let j = 0; j < run && i < count; j++, i++) flags[i] = straight;
          straight = !straight;
        }
        return flags;
      }
      default:
        return flags;
    }
  };

  // なめらかモードで使う、各頂点の接線 (向きと強さを持ったベクトル)。
  // 前後の点を結んだ向きなので、頂点をはさむ 2本の曲線が同じ接線を共有する
  const buildTangents = (points: Point[], straights: boolean[]): Point[] =>
    points.map((_, i) => {
      const prev = points[Math.max(i - 1, 0)];
      const next = points[Math.min(i + 1, points.length - 1)];
      // 端の点は、隣との差をそのまま使う (前後どちらかが自分自身になるため)
      const scale = i === 0 || i === points.length - 1 ? 1 : 0.5;
      const base = {
        x: (next.x - prev.x) * scale,
        y: (next.y - prev.y) * scale,
      };

      // 片側だけが直線の頂点では、接線をその直線の向きに合わせる。
      // 曲線が直線の延長として出入りするので、切り替わりに折れ目ができない
      const inStraight = i > 0 && straights[i - 1];
      const outStraight = i < straights.length && straights[i];
      if (inStraight === outStraight) return base;

      const dir = inStraight
        ? { x: points[i].x - points[i - 1].x, y: points[i].y - points[i - 1].y }
        : { x: points[i + 1].x - points[i].x, y: points[i + 1].y - points[i].y };
      const dirLen = Math.hypot(dir.x, dir.y) || 1;
      // 強さ (曲線のふくらみ具合) は元の接線のままにして、向きだけ差し替える
      const baseLen = Math.hypot(base.x, base.y);
      return { x: (dir.x / dirLen) * baseLen, y: (dir.y / dirLen) * baseLen };
    });

  const buildSegments = () => {
    const points = buildPoints();
    const straights = buildStraightFlags(points.length - 1);
    const tangents =
      settings.curve === "smooth"
        ? buildTangents(points, straights)
        : undefined;
    // 制御点が canvas の外へ出ると曲線もはみ出すので、枠の中に留める
    const clamp = (v: number) => p.constrain(v, 0, size);

    segments = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      let c1x: number;
      let c1y: number;
      let c2x: number;
      let c2y: number;

      if (straights[i]) {
        // 直線。制御点を端点の間に等分に置くと、ベジェはそのまま直線になる
        c1x = a.x + dx / 3;
        c1y = a.y + dy / 3;
        c2x = b.x - dx / 3;
        c2y = b.y - dy / 3;
      } else if (settings.curve === "smooth" && tangents) {
        // 接線の 1/3 だけ伸ばした点を制御点にすると、
        // 頂点を通り接線に沿う曲線になる (Catmull-Rom -> ベジェ の変換)
        const k = settings.curveAmount / 3;
        c1x = a.x + tangents[i].x * k;
        c1y = a.y + tangents[i].y * k;
        c2x = b.x - tangents[i + 1].x * k;
        c2y = b.y - tangents[i + 1].y * k;
      } else {
        // 線に対して直角の向きへ制御点をずらす = 弓なりにふくらむ
        const len = Math.hypot(dx, dy) || 1;
        const side =
          settings.curve === "arcAlt"
            ? i % 2 === 0
              ? 1
              : -1
            : p.random() < 0.5
              ? 1
              : -1;
        const bulge = settings.curveAmount * 0.5 * len * side;
        const nx = (-dy / len) * bulge;
        const ny = (dx / len) * bulge;
        c1x = a.x + dx / 3 + nx;
        c1y = a.y + dy / 3 + ny;
        c2x = b.x - dx / 3 + nx;
        c2y = b.y - dy / 3 + ny;
      }

      segments.push({
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        c1x: clamp(c1x),
        c1y: clamp(c1y),
        c2x: clamp(c2x),
        c2y: clamp(c2y),
      });
    }
  };

  // --- 描画 ---------------------------------------------------------------

  const drawSegment = (seg: Segment) => {
    p.stroke(0);
    p.strokeWeight(settings.weight);
    p.strokeCap(p.ROUND);
    p.noFill();
    p.bezier(
      seg.x1,
      seg.y1,
      seg.c1x,
      seg.c1y,
      seg.c2x,
      seg.c2y,
      seg.x2,
      seg.y2,
    );

    if (settings.joint === "dot") {
      p.noStroke();
      p.fill(0);
      p.circle(seg.x2, seg.y2, settings.weight * 3);
    }
  };

  // 再生成。canvas を白で塗り直して、1本目から描き始める
  const reseed = () => {
    buildSegments();
    // 交差しない設定では、指定より少ない本数で終わることがある
    statusEl?.html(
      segments.length < settings.count
        ? `交差しない設定のため ${segments.length} 本で行き止まり (指定 ${settings.count} 本)`
        : "",
    );
    drawn = 0;
    progress = 0;
    lastMillis = p.millis();
    p.background(255);
    if (settings.speed === 0) {
      for (const seg of segments) drawSegment(seg);
      drawn = segments.length;
      p.noLoop();
    } else {
      p.loop();
    }
  };

  // --- 設定 UI ------------------------------------------------------------

  const labelStyle = (el: p5.Element) => {
    el.style("color", "#ddd");
    el.style("font", "13px/1.6 sans-serif");
    el.style("letter-spacing", "0.04em");
  };

  const addSelect = <T extends string>(
    parent: p5.Element,
    title: string,
    options: [string, T][],
    current: T,
    onChange: (value: T) => void,
  ) => {
    const field = p.createDiv();
    field.parent(parent);
    field.style("display", "flex");
    field.style("flex-direction", "column");
    field.style("gap", "6px");

    const label = p.createDiv(title);
    label.parent(field);
    labelStyle(label);

    const select = p.createSelect() as SelectElement;
    select.parent(field);
    select.style("padding", "6px 8px");
    select.style("font", "13px sans-serif");
    select.style("background", "#1c1c1c");
    select.style("color", "#eee");
    select.style("border", "1px solid #444");
    select.style("border-radius", "4px");
    for (const [text] of options) select.option(text);
    select.selected(options.find(([, value]) => value === current)![0]);
    select.changed(() => {
      const picked = options.find(([text]) => text === select.value());
      if (picked) onChange(picked[1]);
    });
    return { field, label };
  };

  const numberOptions = (values: number[]) =>
    values.map((n) => [String(n), String(n)] as [string, string]);

  const buildUI = () => {
    const panel = p.createDiv();
    panel.style("width", `${size}px`);
    panel.style("box-sizing", "border-box");
    panel.style("padding", "20px 24px 28px");
    panel.style("display", "flex");
    panel.style("gap", "24px");
    panel.style("align-items", "flex-end");
    panel.style("flex-wrap", "wrap");
    panel.style("background", "#111");

    addSelect<string>(
      panel,
      "本数",
      numberOptions([5, 10, 30, 50, 100, 500]),
      String(settings.count),
      (value) => {
        settings.count = Number(value);
        reseed();
      },
    );

    addSelect<DirectionMode>(
      panel,
      "向き",
      [
        ["ランダム / 自由", "free"],
        ["ランダム / 8方向", "dir8"],
        ["ランダム / 縦横", "dir4"],
        ["ランダム / 前の向きから曲がる", "wander"],
        ["一定 / 毎回おなじ角度で曲がる", "turn"],
        ["一定 / まっすぐ進む", "fixed"],
      ],
      settings.direction,
      (value) => {
        settings.direction = value;
        applyFields();
        reseed();
      },
    );

    // wander / turn のときだけ効く
    const turnField = addSelect<string>(
      panel,
      "曲がる角度 (度)",
      numberOptions([10, 30, 45, 60, 90, 120, 150]),
      String(settings.turnAngle),
      (value) => {
        settings.turnAngle = Number(value);
        reseed();
      },
    ).field;

    addSelect<LengthMode>(
      panel,
      "長さ",
      [
        ["ランダム", "random"],
        ["一定", "fixed"],
      ],
      settings.length,
      (value) => {
        settings.length = value;
        applyFields();
        reseed();
      },
    );

    const lengthLabel = addSelect<string>(
      panel,
      "長さ (px)",
      numberOptions([10, 20, 40, 80, 160, 320]),
      String(settings.baseLength),
      (value) => {
        settings.baseLength = Number(value);
        reseed();
      },
    ).label;

    addSelect<CurveMode>(
      panel,
      "かたち",
      [
        ["直線", "straight"],
        ["曲線 / なめらかに通す", "smooth"],
        ["曲線 / 交互にふくらむ", "arcAlt"],
        ["曲線 / ランダムにふくらむ", "arcRandom"],
      ],
      settings.curve,
      (value) => {
        settings.curve = value;
        applyFields();
        reseed();
      },
    );

    // 曲線のときだけ効く
    const curveField = addSelect<string>(
      panel,
      "曲がり具合",
      numberOptions([0.3, 0.6, 1, 1.5, 2]),
      String(settings.curveAmount),
      (value) => {
        settings.curveAmount = Number(value);
        reseed();
      },
    ).field;

    // かたちが「直線」のときだけ効く
    const crossField = addSelect<CrossMode>(
      panel,
      "交差",
      [
        ["許す", "allow"],
        ["交差しない", "avoid"],
      ],
      settings.cross,
      (value) => {
        settings.cross = value;
        reseed();
      },
    ).field;

    // 曲線のなかに直線をまぜる。かたちが「直線」のときは意味がないので隠す
    const mixField = addSelect<MixMode>(
      panel,
      "直線をまぜる",
      [
        ["まぜない", "none"],
        ["ランダムに", "random"],
        ["1本おきに", "alternate"],
        ["数本ずつのかたまりで", "run"],
      ],
      settings.mix,
      (value) => {
        settings.mix = value;
        applyFields();
        reseed();
      },
    ).field;

    const mixRatioField = addSelect<string>(
      panel,
      "直線の割合",
      numberOptions([0.25, 0.5, 0.75]),
      String(settings.mixRatio),
      (value) => {
        settings.mixRatio = Number(value);
        reseed();
      },
    ).field;

    addSelect<StartMode>(
      panel,
      "描き始め",
      [
        ["中央", "center"],
        ["ランダム", "random"],
      ],
      settings.start,
      (value) => {
        settings.start = value;
        reseed();
      },
    );

    addSelect<string>(
      panel,
      "線の太さ",
      numberOptions([0.5, 1, 2, 3, 5, 8]),
      String(settings.weight),
      (value) => {
        settings.weight = Number(value);
        reseed();
      },
    );

    addSelect<JointMode>(
      panel,
      "つなぎ目",
      [
        ["なし", "none"],
        ["点を打つ", "dot"],
      ],
      settings.joint,
      (value) => {
        settings.joint = value;
        reseed();
      },
    );

    addSelect<string>(
      panel,
      "描く速さ (本/秒)",
      [["一度に全部", "0"], ...numberOptions([5, 20, 60, 200])],
      String(settings.speed),
      (value) => {
        settings.speed = Number(value);
        reseed();
      },
    );

    // 効かない設定は隠す / ラベルだけ変える
    const applyFields = () => {
      const usesTurn =
        settings.direction === "wander" || settings.direction === "turn";
      turnField.style("display", usesTurn ? "flex" : "none");
      const curved = settings.curve !== "straight";
      curveField.style("display", curved ? "flex" : "none");
      crossField.style("display", curved ? "none" : "flex");
      mixField.style("display", curved ? "flex" : "none");
      mixRatioField.style(
        "display",
        curved && (settings.mix === "random" || settings.mix === "run")
          ? "flex"
          : "none",
      );
      lengthLabel.html(
        settings.length === "fixed" ? "長さ (px)" : "長さの上限 (px)",
      );
    };
    applyFields();

    const hint = p.createDiv(
      "canvas をクリックで再生成 / s キーで PNG 保存",
    );
    hint.parent(panel);
    labelStyle(hint);
    hint.style("color", "#777");
    hint.style("margin-left", "auto");

    statusEl = p.createDiv("");
    statusEl.parent(panel);
    labelStyle(statusEl);
    statusEl.style("color", "#c9a227");
    // 1行まるごと使う
    statusEl.style("flex-basis", "100%");
  };
  // -----------------------------------------------------------------------

  p.setup = () => {
    p.createCanvas(size, size);
    p.frameRate(60);
    // canvas の下の設定パネルまでスクロールできるようにする
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    buildUI();
    reseed();
  };

  p.draw = () => {
    const now = p.millis();
    const delta = (now - lastMillis) / 1000;
    lastMillis = now;

    progress = Math.min(progress + delta * settings.speed, segments.length);
    const target = Math.floor(progress);
    // 前のフレームの続きだけを描き足す
    for (; drawn < target; drawn++) drawSegment(segments[drawn]);
    if (drawn >= segments.length) p.noLoop();
  };

  p.mousePressed = () => {
    if (p.mouseX < 0 || p.mouseX > size || p.mouseY < 0 || p.mouseY > size)
      return;
    reseed();
  };

  p.keyPressed = () => {
    if (p.key === "s" || p.key === "S") {
      p.saveCanvas(`connected-lines-${settings.count}-${Date.now()}`, "png");
    }
  };
};
