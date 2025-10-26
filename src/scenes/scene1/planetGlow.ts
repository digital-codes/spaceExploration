import {
    Scene,  MeshBuilder, Camera,
    Vector3, Color3, GlowLayer,
    PBRMaterial,
    type Nullable,
    AbstractMesh
} from '@babylonjs/core';

// activate glow ring 
export default function planetGlow(scene: Scene, planet: AbstractMesh, camera: Camera) {
    // create / reuse a single shared glow layer for selections
    let selectionGlow = (scene as any).__selectionGlow as Nullable<GlowLayer> | undefined;
    if (!selectionGlow) {
        selectionGlow = new GlowLayer("selectionGlow", scene);
        selectionGlow.intensity = 0.8;
        (scene as any).__selectionGlow = selectionGlow;
    }

    // remove any previous selection rings so we don't leak multiple rings
    scene.meshes
        .filter(m => m.metadata && (m.metadata as any).isSelectionRing)
        .forEach(m => {
            try { m.dispose(); } catch { /* ignore dispose errors */ }
        });

    // compute ring size from the planet diameter (fallback to bounding sphere if missing)
    // const diam = (planet as Mesh).getBoundingInfo().boundingSphere.radius * 2 || 1;
    const ringDiameter = 1.2 // diam * 1.2;
    // const ringThickness = Math.max(diam * 0.06, 0.02);
    const ringThickness = Math.max(0.06, 0.02);

    // create a torus (donut) and attach it to the planet
    const ring = MeshBuilder.CreateTorus(`selectionRing_${planet.name}`, {
        diameter: ringDiameter,
        thickness: ringThickness,
        tessellation: 64
    }, scene);

    ring.parent = planet;
    ring.position = Vector3.Zero();
    // orient the torus so it looks like a Saturn-style ring (around the planet's equator)
    ring.rotation = new Vector3(Math.PI / 2, 0, 0);
    ring.isPickable = false;
    ring.metadata = { isSelectionRing: true, planetName: planet.name };

    // emissive material so the glow layer can pick it up
    const ringMat = new PBRMaterial(`ringMat_${planet.name}`, scene);
    ringMat.albedoColor = new Color3(0.2, 0.45, 1.0);
    ringMat.emissiveColor = new Color3(0.2, 0.6, 1.0);
    ringMat.emissiveIntensity = 3;
    ringMat.disableLighting = true;
    ringMat.alpha = 0.85;
    ring.material = ringMat;

    // include the ring in the glow layer (use API if available, otherwise push into includedOnlyMeshes)
    if ((selectionGlow as any).addIncludedOnlyMesh) {
        (selectionGlow as any).addIncludedOnlyMesh(ring);
    } else if ((selectionGlow as any).includedOnlyMeshes) {
        (selectionGlow as any).includedOnlyMeshes.push(ring);
    }
}
