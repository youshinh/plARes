import * as THREE from 'three';

// Lazily import recast-wasm to avoid blocking the initial render.
// recast-wasm exposes a factory function that returns a WASM module with
// the full Recast navigation mesh generation pipeline.
let Recast: any = null;
const loadRecast = async () => {
  if (!Recast) {
    const mod = await import('recast-wasm');
    Recast = await (mod.default as any)();
  }
  return Recast;
};

/**
 * NavMeshGenerator
 *
 * Architecture (Doc §2.4):
 * - Accepts a list of THREE.Vector3 hit-test surface points produced by useWebXRScanner.
 * - Converts them into a triangle mesh and feeds it into Recast.js (WASM) to compute
 *   the walkable NavMesh polygon soup.
 * - findPath() uses the resulting dtNavMesh + dtNavMeshQuery to compute an A* path
 *   between two world-space positions and returns a list of waypoints.
 *
 * The NavMesh is rebuilt whenever 'navmesh_ready' is dispatched from the scanner.
 */
export class NavMeshGenerator {
  private navMesh: any = null;
  private navMeshQuery: any = null;
  private recast: any = null;
  private built = false;

  async buildFromPoints(points: THREE.Vector3[]): Promise<void> {
    this.recast = await loadRecast();

    // Flatten points into a bounding-box-aligned triangle soup.
    // For a ground plane NavMesh we build simple triangulated quads from
    // adjacent hit-test points (poor-man's Delaunay).
    const verts: number[] = [];
    const tris: number[] = [];

    points.forEach(p => { verts.push(p.x, p.y, p.z); });

    // Simple fan-triangulation from first point (sufficient for initial AR ground)
    for (let i = 1; i < points.length - 1; i++) {
      tris.push(0, i, i + 1);
    }

    if (tris.length === 0) {
      console.warn('[NavMesh] Not enough points to triangulate.');
      return;
    }

    const rc = new this.recast.RecastConfig();
    rc.cs = 0.1;    // cell size
    rc.ch = 0.05;   // cell height
    rc.walkableSlopeAngle = 30;
    rc.walkableHeight = 2;
    rc.walkableClimb = 0.4;
    rc.walkableRadius = 0.2;
    rc.maxEdgeLen = 12;
    rc.maxSimplificationError = 1.3;
    rc.minRegionArea = 8;
    rc.mergeRegionArea = 20;
    rc.maxVertsPerPoly = 6;
    rc.detailSampleDist = 6;
    rc.detailSampleMaxError = 1;

    const vertsArray = new this.recast.FloatArray(verts.length);
    verts.forEach((v, i) => vertsArray.set(i, v));

    const trisArray = new this.recast.IntArray(tris.length);
    tris.forEach((t, i) => trisArray.set(i, t));

    const builder = new this.recast.NavMeshBuilder();
    const result = builder.build(vertsArray, verts.length / 3, trisArray, tris.length / 3, rc);

    if (!result.success) {
      console.error('[NavMesh] Recast build failed');
      return;
    }

    this.navMesh = result.navMesh;
    this.navMeshQuery = new this.recast.NavMeshQuery(this.navMesh);
    this.built = true;
    console.log('[NavMesh] Built successfully');
  }

  isReady(): boolean {
    return this.built;
  }

  /**
   * findPath – returns a list of world-space waypoints from start to end
   * using the Recast dtNavMeshQuery A* algorithm.
   * Falls back to a direct straight-line stub if NavMesh hasn't built yet.
   */
  findPath(start: THREE.Vector3, end: THREE.Vector3): THREE.Vector3[] {
    if (!this.built || !this.navMeshQuery) {
      // Graceful fallback while AR scan is still in progress
      return [start.clone(), end.clone()];
    }

    const half = new this.recast.Vec3(1, 1, 1);
    const startPoly = this.navMeshQuery.findNearestPoly(
      new this.recast.Vec3(start.x, start.y, start.z), half
    );
    const endPoly = this.navMeshQuery.findNearestPoly(
      new this.recast.Vec3(end.x, end.y, end.z), half
    );

    if (!startPoly.status.isSuccess() || !endPoly.status.isSuccess()) {
      return [start.clone(), end.clone()];
    }

    const pathResult = this.navMeshQuery.computePath(
      startPoly.nearestRef, startPoly.nearestPt,
      endPoly.nearestRef, endPoly.nearestPt
    );

    if (!pathResult.status.isSuccess()) {
      return [start.clone(), end.clone()];
    }

    const waypoints: THREE.Vector3[] = [];
    for (let i = 0; i < pathResult.pathCount; i++) {
      const pt = pathResult.straightPath[i];
      waypoints.push(new THREE.Vector3(pt.x, pt.y, pt.z));
    }
    return waypoints.length > 0 ? waypoints : [start.clone(), end.clone()];
  }
}

// Singleton accessible app-wide
export const navMesh = new NavMeshGenerator();
