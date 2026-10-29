// Free GPU buffers for a subtree that is gone for good. Geometries and materials marked
// userData.shared (the primitive cache, ink outlines, shared kits) are left alone.
export function disposeTree(root) {
  root.traverse(o => {
    if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) if (!m.userData?.shared) m.dispose();
  });
}
