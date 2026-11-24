import * as THREE from 'three';

const MAX_DPR = 2;
const PIXEL_BUDGET = 1_800_000;

// Canvas artwork and framebuffer copies already contain display-encoded sRGB bytes.
export function screenQuad(texture, transparent = false) {
  const material = new THREE.ShaderMaterial({
    uniforms: { pixels: { value: texture } },
    vertexShader: `
      varying vec2 texCoord;
      void main() {
        texCoord = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D pixels;
      varying vec2 texCoord;
      void main() {
        gl_FragColor = texture2D(pixels, texCoord);
      }`,
    transparent,
    premultipliedAlpha: transparent,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  return { scene, camera: new THREE.Camera(), material };
}

export class MiniDisplay {
  constructor(window, context) {
    this.window = window;
    this.context = context;
    this.maxTextureSize = context.getParameter(context.MAX_TEXTURE_SIZE);
    this.canCopy = context.getContextAttributes?.()?.alpha !== false;
    this.sceneRatio = 1;
    this.size = new THREE.Vector2();
    this.origin = new THREE.Vector2(0, 0);
    this.quad = screenQuad(null);
  }

  resize(renderer) {
    const { innerWidth: w, innerHeight: h, devicePixelRatio } = this.window;
    const ratio = Math.min(devicePixelRatio || 1, MAX_DPR, Math.sqrt(PIXEL_BUDGET / (w * h)),
      this.maxTextureSize / Math.max(w, h));
    const size = renderer.getSize(this.size);
    if (size.x !== w || size.y !== h || renderer.getPixelRatio() !== ratio) renderer.setDrawingBufferSize(w, h, ratio);
  }

  drawScene(renderer, scene, camera) {
    const ratio = renderer.getPixelRatio();
    if (!this.canCopy || this.sceneRatio >= ratio) {
      renderer.render(scene, camera);
      return;
    }
    const { x: w, y: h } = renderer.getSize(this.size);
    const width = Math.max(1, Math.floor(w * this.sceneRatio));
    const height = Math.max(1, Math.floor(h * this.sceneRatio));
    const uniform = this.quad.material.uniforms.pixels;
    const texture = uniform.value;
    const changed = !texture || texture.image.width !== width || texture.image.height !== height;
    if (changed) {
      texture?.dispose();
      uniform.value = new THREE.FramebufferTexture(width, height);
      uniform.value.minFilter = uniform.value.magFilter = THREE.LinearFilter;
    }
    // Draw the 3D scene at the selected quality. Copy its resolved pixels without
    // another color-space conversion, then draw the HUD at the display resolution.
    renderer.setViewport(0, 0, width / ratio, height / ratio);
    try {
      renderer.render(scene, camera);
      renderer.copyFramebufferToTexture(this.origin, uniform.value);
      // The default RGB buffer on some WebGL 1 hosts cannot copy into RGBA.
      if (changed && this.context.getError() !== this.context.NO_ERROR) {
        this.canCopy = false;
        uniform.value.dispose();
        uniform.value = null;
      }
    } finally {
      renderer.setViewport(0, 0, w, h);
    }
    if (this.canCopy) renderer.render(this.quad.scene, this.quad.camera);
    else renderer.render(scene, camera);
  }
}

export function installCanvasColorFallback() {
  const fallback = THREE.ImageUtils.sRGBToLinear;
  const canvases = new WeakMap();
  const linear = Uint8ClampedArray.from({ length: 256 }, (_, byte) => {
    const v = byte / 255;
    return (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4) * 255;
  });
  // Three r162's WebGL 1 CPU fallback recognizes DOM canvases and applies
  // the sRGB transfer function to alpha too. The WeChat canvas is not a DOM node.
  THREE.ImageUtils.sRGBToLinear = (image) => {
    if (typeof image?.getContext !== 'function') return fallback(image);
    const src = image.getContext('2d');
    if (!src?.getImageData) return fallback(image);
    const { width, height } = image;
    const pixels = src.getImageData(0, 0, width, height);
    const rgba = pixels.data;
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = linear[rgba[i]];
      rgba[i + 1] = linear[rgba[i + 1]];
      rgba[i + 2] = linear[rgba[i + 2]];
    }
    let output = canvases.get(image);
    if (!output) {
      output = wx.createCanvas();
      canvases.set(image, output);
    }
    if (output.width !== width) output.width = width;
    if (output.height !== height) output.height = height;
    output.getContext('2d').putImageData(pixels, 0, 0);
    return output;
  };
}
