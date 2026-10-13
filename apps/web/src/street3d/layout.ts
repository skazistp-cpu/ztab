/*
 * Where everything stands. Units are tiles (one pavement tile = 1). The street runs along +x (on screen: down and to
 * the right at 30 degrees); the stations stand at its back (-z) on plinths, their fronts facing +z, the lane and its
 * kerbs run in front of them, and the front pavement is nearest the viewer. Seams fall on whole tiles so the grout
 * drawn by the shader meets them.
 */

/** The five stations' x, along the street. */
export const STATION_X = [0, 10, 20, 30, 40] as const;

/** A station's plinth: 5 x 5, a step above the pavement, laid with 4 x 4 larger tiles (as in the pictures). */
export const PLINTH = { half: 2.5, z: -2.5, top: 0.24, tile: 1.25 } as const;

/** The street's slab, the lane in it, and the kerbs either side of the lane. */
export const SLAB = { x0: -9, x1: 49, z0: -8.7, z1: 5.2, bottom: -0.46 } as const;
/** The far side's shopfronts: their fronts stand on this line. */
export const SHOP_Z = -6.5;
export const LANE = { z0: 1.3, z1: 3.7, top: -0.1 } as const;
export const KERB_A = { z0: 1.0, z1: 1.3 } as const;
export const KERB_B = { z0: 3.7, z1: 4.0 } as const;

/** The lamps stand between the stations, at the back edge of the lane. */
export const LAMP_X = [-5, 5, 15, 25, 35, 45] as const;
export const LAMP_Z = 0.6;
/** The posts across the lane that the string lights hang to. */
export const POST_Z = 4.6;
