## 2025-03-12 - Infinite Loops and Inline Callbacks
**Learning:** When passing state-updating callbacks (like `() => setVersion(v => v + 1)`) to custom hooks that use them inside `useEffect` dependency arrays, inline functions cause new reference creation on every render, leading to infinite render/re-mount loops.
**Action:** Always wrap state-updating callbacks passed as hook dependencies in `React.useCallback` with an empty dependency array.

## 2025-03-12 - Three.js Material Union Typing
**Learning:** When working with Three.js Material unions (e.g., `THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial`), TypeScript's `tsc` throws errors if you attempt to access specific properties like `.isMeshStandardMaterial` directly on the union type.
**Action:** Use explicit type assertions (e.g., `(mat as THREE.MeshStandardMaterial).isMeshStandardMaterial`) when checking properties specific to individual types within a union.
