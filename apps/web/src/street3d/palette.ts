/*
 * The street's colours, sampled from the approved café picture (hero-b.webp) with a script, not picked by eye.
 * They are the colours of a face lit from above: the toon ramp in the shader makes the left (lit) and right (shade)
 * faces from them, in linear light, which is how the picture's own faces relate (top 1, left 0.91, right 0.5).
 */
export const C = {
  /** Paper and cream walls, lit from above. */
  paper: 0xf8f0e5,
  /** Cream a touch warmer, for walls and trims. */
  cream: 0xf3e9db,
  /** The pavement's tiles and their grout. */
  tile: 0xf3e6d6,
  /** The street's own pavement, a shade under the plinths so the stations stand out as in the pictures. */
  pave: 0xece0cf,
  grout: 0xd7c9b9,
  /** The lane's smaller setts, a step darker than the tiles. */
  sett: 0xe9dccb,
  /** The slab's and the plinths' side faces (the picture's left side face is #A3988C). */
  stone: 0xb2a597,
  /** The bevel highlight along a slab's top edge. */
  bevel: 0xfbeedd,
  /** Charcoal: tops, chairs, frames (the picture's lit charcoal is #38373A, its shade #222020). */
  coal: 0x38373a,
  coalDeep: 0x2a292c,
  /** Gold: lit, a shade deeper, and its highlight. */
  gold: 0xebb745,
  goldDeep: 0xd5a63e,
  goldHi: 0xf3d27e,
  /** Plates and the brightest paper. */
  white: 0xfbf7f2,
  /** Leaves: dark, middle, light (the picture's are warm greys with a hint of green). */
  leafDark: 0x5a5853,
  leafMid: 0x7f7c75,
  leafLight: 0xb1ada5,
  /** A tree's crown: the plants' leaf grey, a touch greener. */
  crown: 0x8a8e80,
  /** The pot's cream. */
  pot: 0xf0e4d4,
  /** Ink for the outlines. */
  ink: 0x1b1917,
  /** A lamp's bulb, off and lit. */
  bulbOff: 0xe9e1d2,
  bulbOn: 0xfff3c8,
  /** The warm light of a lit lamp. */
  glow: 0xffd77a,
} as const;
