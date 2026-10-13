import {
  BufferGeometry, DepthTexture, DoubleSide, Float32BufferAttribute, LessEqualCompare, LinearFilter, Matrix4, Mesh, MeshBasicMaterial,
  NearestFilter, OrthographicCamera, Scene, UnsignedByteType, UnsignedIntType, Vector3, WebGLRenderTarget, WebGLRenderer,
} from 'three';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { inkMaterial, shared } from './materials.ts';
import { CASTERS, type World } from './world.ts';

/*
 * One frame: (1) the sun's shadow map, only when something that casts moved; (2) the street into two targets at once,
 * colour and info (view normal, part, crease flag), with depth; (3) the ink pass: outlines from the info and depth,
 * laid over the colour; (4) SMAA (edges, weights, blend) to the canvas, so lines and stripes never step; (5) the
 * glows (halos, scan beams) over that.
 */

const SHADOW_SIZE = 2048;

export class Pipeline {
  readonly renderer: WebGLRenderer;
  readonly target: WebGLRenderTarget;
  readonly shadowTarget: WebGLRenderTarget;
  /** The inked picture, before anti-aliasing. */
  readonly inked: WebGLRenderTarget;
  private readonly smaa: SMAAPass;
  readonly sun = new OrthographicCamera(-10, 10, 10, -10, 0.5, 120);
  private readonly ink = inkMaterial();
  private readonly inkScene = new Scene();
  private readonly inkCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly depthOnly = new MeshBasicMaterial({ colorWrite: false, side: DoubleSide });
  private readonly bias = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  width = 1;
  height = 1;
  dpr = 1;

  constructor(canvas: HTMLCanvasElement, context: WebGL2RenderingContext) {
    this.renderer = new WebGLRenderer({ canvas, context, antialias: false, alpha: true, premultipliedAlpha: true, stencil: false, depth: true, powerPreference: 'high-performance' });
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    this.renderer.setClearColor(0x000000, 0);
    this.target = new WebGLRenderTarget(1, 1, {
      count: 2,
      type: UnsignedByteType,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthBuffer: true,
      depthTexture: new DepthTexture(1, 1, UnsignedIntType),
      generateMipmaps: false,
    });
    for (const t of this.target.textures) { t.minFilter = NearestFilter; t.magFilter = NearestFilter; t.generateMipmaps = false; }
    this.inked = new WebGLRenderTarget(1, 1, { type: UnsignedByteType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false, generateMipmaps: false });
    this.smaa = new SMAAPass();
    // Eight-bit edges and weights (SMAA's own formats), so it runs where half floats cannot be drawn to.
    const inner = this.smaa as unknown as { _edgesRT: WebGLRenderTarget; _weightsRT: WebGLRenderTarget };
    inner._edgesRT.texture.type = UnsignedByteType;
    inner._weightsRT.texture.type = UnsignedByteType;
    this.smaa.clear = true;
    this.smaa.renderToScreen = true;
    const shadowDepth = new DepthTexture(SHADOW_SIZE, SHADOW_SIZE, UnsignedIntType);
    shadowDepth.compareFunction = LessEqualCompare;
    shadowDepth.minFilter = LinearFilter;
    shadowDepth.magFilter = LinearFilter;
    this.shadowTarget = new WebGLRenderTarget(SHADOW_SIZE, SHADOW_SIZE, { depthBuffer: true, depthTexture: shadowDepth, generateMipmaps: false });
    shared.uShadowMap.value = shadowDepth;
    shared.uShadowTexel.value.set(1 / SHADOW_SIZE, 1 / SHADOW_SIZE);
    this.sun.layers.set(CASTERS);

    const tri = new BufferGeometry();
    tri.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const quad = new Mesh(tri, this.ink);
    quad.frustumCulled = false;
    this.inkScene.add(quad);
    this.ink.uniforms.tColor.value = this.target.textures[0];
    this.ink.uniforms.tInfo.value = this.target.textures[1];
    this.ink.uniforms.tDepth.value = this.target.depthTexture;
  }

  setSize(width: number, height: number, dpr: number, line: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    this.target.setSize(w, h);
    this.inked.setSize(w, h);
    this.smaa.setSize(w, h);
    this.ink.uniforms.uLine.value = line * dpr;
  }

  /** Points the sun's camera at the ground under the view, covering `radius` around it (snapped to its texels). */
  aimSun(centre: Vector3, radius: number): void {
    const dir = shared.uSunDir.value;
    const r = Math.max(2, radius);
    this.sun.left = -r; this.sun.right = r; this.sun.top = r; this.sun.bottom = -r;
    this.sun.near = 0.5; this.sun.far = 120;
    this.sun.updateProjectionMatrix();
    // Snap the centre to whole shadow texels in the sun's view, so shadows do not crawl as the camera glides.
    this.sun.position.copy(dir).multiplyScalar(60);
    this.sun.lookAt(0, 0, 0);
    this.sun.updateMatrixWorld();
    const inv = this.sun.matrixWorldInverse;
    const c = centre.clone().applyMatrix4(inv);
    const texel = (2 * r) / SHADOW_SIZE;
    c.x = Math.round(c.x / texel) * texel;
    c.y = Math.round(c.y / texel) * texel;
    const snapped = c.applyMatrix4(this.sun.matrixWorld);
    this.sun.position.copy(snapped).addScaledVector(dir, 60);
    this.sun.lookAt(snapped);
    this.sun.updateMatrixWorld();
    shared.uShadowMatrix.value.copy(this.bias).multiply(this.sun.projectionMatrix).multiply(this.sun.matrixWorldInverse);
  }

  /** Starts a frame's counters (draw calls, triangles). */
  begin(): void {
    this.renderer.info.reset();
  }

  renderShadow(world: World): void {
    const r = this.renderer;
    r.setRenderTarget(this.shadowTarget);
    r.clear(true, true, false);
    world.scene.overrideMaterial = this.depthOnly;
    r.render(world.scene, this.sun);
    world.scene.overrideMaterial = null;
    shared.uShadowOn.value = 1;
  }

  render(world: World, camera: OrthographicCamera): void {
    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    world.halos.mesh.visible = false;
    r.render(world.scene, camera);
    // Ink, then SMAA to the canvas.
    r.setRenderTarget(this.inked);
    r.clear(true, false, false);
    this.ink.uniforms.uDepthK.value = camera.far - camera.near;
    r.render(this.inkScene, this.inkCam);
    this.smaa.render(r, null as unknown as WebGLRenderTarget, this.inked, 0, false);
    // Glows over it.
    const hm = world.halos.material;
    hm.uniforms.tDepth.value = this.target.depthTexture;
    hm.uniforms.uRes.value.set(this.target.width, this.target.height);
    hm.uniforms.uNear.value = camera.near;
    hm.uniforms.uFar.value = camera.far;
    hm.uniforms.uSlack.value = 0.35 / (camera.far - camera.near);
    world.halos.mesh.visible = true;
    r.render(world.halos.mesh, camera);
    for (const o of world.overlays) {
      const mat = (o as Mesh).material as { uniforms?: Record<string, { value: unknown }> };
      if (mat.uniforms?.tDepth) mat.uniforms.tDepth.value = this.target.depthTexture;
      if (mat.uniforms?.uRes) (mat.uniforms.uRes.value as { set(x: number, y: number): void }).set(this.target.width, this.target.height);
      if (mat.uniforms?.uNear) mat.uniforms.uNear.value = camera.near;
      if (mat.uniforms?.uFar) mat.uniforms.uFar.value = camera.far;
      if (o.visible) r.render(o, camera);
    }
  }

  dispose(): void {
    this.target.dispose();
    this.inked.dispose();
    this.smaa.dispose();
    this.shadowTarget.dispose();
    this.ink.dispose();
    this.depthOnly.dispose();
    this.renderer.dispose();
  }
}
