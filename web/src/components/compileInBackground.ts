import type * as THREE from 'three';

/**
 * Starts compiling every shader `scene` needs and resolves once the GPU reports them all ready
 * (KHR_parallel_shader_compile), so the first frame that shows the scene doesn't freeze the page
 * while the driver compiles. Resolves after `timeoutMs` regardless, and never throws: at worst the
 * next render compiles synchronously, exactly as it would have without this.
 *
 * Why not `renderer.compileAsync`: in three r185 its readiness poll throws inside a timer
 * ("reading 'isReady'") when the scene holds a material no object renders yet, and its promise then
 * never settles. This polls the programs the renderer actually created instead.
 */
export function compileInBackground(renderer: THREE.WebGLRenderer, scene: THREE.Object3D, camera: THREE.Camera, timeoutMs = 6000): Promise<void> {
  try {
    renderer.compile(scene, camera);
  } catch {
    return Promise.resolve();
  }
  const started = performance.now();
  return new Promise((resolve) => {
    const check = () => {
      const programs = (renderer.info.programs ?? []) as unknown as Array<{ isReady?: () => boolean }>;
      let ready = true;
      try {
        ready = programs.every((p) => typeof p.isReady !== 'function' || p.isReady());
      } catch {
        ready = true;
      }
      if (ready || performance.now() - started > timeoutMs) resolve();
      else setTimeout(check, 16);
    };
    check();
  });
}
