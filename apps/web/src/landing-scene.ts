/*
 * Where things are in the opening's picture of the dinner (Jarvis's isometric café table, art made for this page): the
 * bill folder in the middle of the table, the six phones round it and the lamps of the string lights, in the picture's
 * own pixels, measured on the picture. The ribbons, the light on each phone, the little cards and the lamps' glow are
 * drawn over the picture from these points, so they stay on the table at every size.
 *
 * There are two pictures: a wide one, and a tall one for phones that is drawn again (not cut out of the wide one), so
 * each has its own points.
 */

export type Point = readonly [number, number];

export interface Seat {
  /** The middle of the phone's screen: where its ribbon ends. */
  readonly phone: Point;
  /** The four corners of the phone's screen, for its light. */
  readonly screen: readonly Point[];
  /** The bottom middle of the person's card, floating over their phone. */
  readonly card: Point;
}

export interface Scene {
  /** The picture's size in pixels; everything below is in these pixels. */
  readonly w: number;
  readonly h: number;
  /** The picture's files under /landing/, by width. */
  readonly files: { readonly name: string; readonly widths: readonly number[] };
  /** Where the ribbons start: the bill folder on the table. */
  readonly bill: Point;
  /** The six places, in the order of LANDING_SAMPLE.shares (the organiser first). */
  readonly seats: readonly Seat[];
  /** The lamps whose glow comes and goes, and how big the glow is. */
  readonly lamps: readonly Point[];
  readonly glow: number;
  /** How high the ribbons arc over the table, and how thick they are, in the picture's pixels. */
  readonly lift: number;
  readonly stroke: number;
  /** The size of a card against the picture's width (its font size, in % of the picture's width). */
  readonly cardSize: number;
  /** Where steam rises from (the tops of the kiosk's two stacks of cups), and how tall a wisp is. */
  readonly steam: readonly Point[];
  readonly steamSize: number;
  /** The table's top, for the string lights' warm glow on it: its middle and its half width and depth. */
  readonly table: readonly [number, number, number, number];
  /** How far from the middle of the bill each ribbon leaves it, toward its phone. */
  readonly billRadius: number;
}

/** Lena is the near phone on the left; then round the table: Ana, Dragan, Tomás, Priya, and Jonas near on the right. */
export const WIDE: Scene = {
  w: 2400, h: 1350,
  files: { name: 'dinner-wide', widths: [1200, 1600, 2400] },
  bill: [1207, 660],
  seats: [
    { phone: [1088, 802], screen: [[1089, 764], [1127, 780], [1087, 837], [1049, 829]], card: [975, 770] },
    { phone: [943, 669], screen: [[896, 667], [979, 649], [990, 671], [906, 690]], card: [870, 632] },
    { phone: [1085, 506], screen: [[1052, 483], [1084, 473], [1121, 530], [1083, 540]], card: [1030, 455] },
    { phone: [1343, 506], screen: [[1342, 472], [1379, 483], [1343, 540], [1306, 528]], card: [1398, 455] },
    { phone: [1485, 669], screen: [[1448, 649], [1531, 667], [1522, 690], [1438, 671]], card: [1560, 632] },
    { phone: [1339, 802], screen: [[1338, 765], [1377, 828], [1340, 836], [1302, 778]], card: [1452, 770] },
  ],
  lamps: [[995, 168], [1165, 223], [1343, 262], [1532, 281], [1713, 281], [508, 396], [817, 353]],
  glow: 34,
  lift: 46,
  stroke: 4.2,
  cardSize: 0.7,
  billRadius: 52,
  steam: [[644, 424], [672, 394]],
  steamSize: 78,
  table: [1210, 662, 330, 190],
};

export const TALL: Scene = {
  w: 1080, h: 1350,
  files: { name: 'dinner-tall', widths: [720, 840, 1080] },
  bill: [553, 768],
  seats: [
    { phone: [471, 882], screen: [[474, 854], [498, 862], [469, 911], [444, 902]], card: [362, 906] },
    { phone: [370, 782], screen: [[334, 779], [397, 767], [405, 785], [345, 799]], card: [350, 752] },
    { phone: [469, 653], screen: [[444, 634], [470, 627], [494, 671], [468, 680]], card: [430, 612] },
    { phone: [660, 654], screen: [[663, 628], [684, 636], [657, 681], [634, 671]], card: [690, 612] },
    { phone: [745, 782], screen: [[719, 766], [779, 779], [771, 798], [710, 784]], card: [770, 752] },
    { phone: [650, 882], screen: [[622, 857], [646, 854], [677, 903], [653, 912]], card: [758, 906] },
  ],
  lamps: [[453, 189], [555, 234], [676, 279], [798, 296], [903, 296], [146, 432], [402, 397]],
  glow: 22,
  lift: 24,
  stroke: 5.2,
  cardSize: 1.85,
  billRadius: 26,
  steam: [[255, 461], [279, 433]],
  steamSize: 36,
  table: [556, 770, 250, 150],
};

export interface Ribbon {
  /** The curve, as an SVG path. */
  readonly d: string;
  /** Its length, near enough (from the samples). */
  readonly length: number;
  /** Points along it at equal steps of its length, each with the direction it runs in (degrees). */
  readonly at: readonly (readonly [number, number, number])[];
}

/** The ribbon from the bill to a phone: a curve that rises over the table and comes down onto the phone. */
export function ribbon(scene: Scene, seat: Seat, samples = 40): Ribbon {
  const p3 = seat.phone;
  const dx = p3[0] - scene.bill[0], dy = p3[1] - scene.bill[1];
  const span = Math.hypot(dx, dy);
  // Each ribbon leaves the bill from its own side, so they fan out instead of all rising from one point.
  const p0: Point = [scene.bill[0] + (dx / span) * scene.billRadius, scene.bill[1] + (dy / span) * scene.billRadius * 0.6];
  // A ribbon toward the near side of the table (down the picture) rises less: it would otherwise loop over the bill.
  const rise = (scene.lift + span * 0.12) * (dy > span * 0.3 ? 0.5 : 1);
  const p1: Point = [p0[0] + (p3[0] - p0[0]) * 0.3, p0[1] + (p3[1] - p0[1]) * 0.3 - rise];
  const p2: Point = [p0[0] + (p3[0] - p0[0]) * 0.72, p0[1] + (p3[1] - p0[1]) * 0.72 - rise * 0.85];
  const bez = (t: number): Point => {
    const u = 1 - t;
    return [
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ];
  };
  // Walk the curve finely, then pick points at equal steps of length.
  const fine: Point[] = [];
  for (let i = 0; i <= 400; i++) fine.push(bez(i / 400));
  const run = [0];
  for (let i = 1; i < fine.length; i++) run.push(run[i - 1] + Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1]));
  const length = run[run.length - 1];
  const at: [number, number, number][] = [];
  let j = 0;
  for (let k = 0; k <= samples; k++) {
    const want = (k / samples) * length;
    while (j < run.length - 2 && run[j + 1] < want) j++;
    const a = fine[j], b = fine[j + 1];
    const f = run[j + 1] > run[j] ? (want - run[j]) / (run[j + 1] - run[j]) : 0;
    at.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI]);
  }
  const f = (p: Point): string => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  return { d: `M${f(p0)}C${f(p1)} ${f(p2)} ${f(p3)}`, length, at };
}
