#!/bin/bash
cat << 'INNER_EOF' > /tmp/patch_frame.diff
--- frontend/src/components/robot/useRobotFrameLoop.ts
+++ frontend/src/components/robot/useRobotFrameLoop.ts
@@ -256,6 +256,7 @@
   }
 };

+// Performance Optimization: Iterates over a flat cache instead of recursive group.traverse()
 const applyCombatGlow = (materials: (THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial)[], currentState: State, scarRoughnessBoost: number) => {
   const emissiveMap: Partial<Record<State, string>> = {
     [State.HOVERING]: '#000000',
@@ -395,6 +396,8 @@
   const hoverTimerRef = useRef(0);
   const materialsRef = useRef<(THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial)[]>([]);

+  // Performance Optimization: Cache materials with a useEffect hook
+  // This prevents running an expensive group.traverse() inside the useFrame loop
   useEffect(() => {
     const group = groupRef.current;
     if (!group) return;
INNER_EOF
patch -p0 < /tmp/patch_frame.diff
