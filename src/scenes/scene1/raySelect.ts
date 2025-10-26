// TypeScript/JS (Babylon.js v8)
import { AbstractMesh, Ray, Vector3, Scene, Camera, PickingInfo } from "@babylonjs/core";
import { name } from "@babylonjs/gui";

/**
 * Find all intersects between camera.position and a lookAt point,
 * and return the closest hit to the camera.
 */
export default function pickBetweenCameraAndLookAt(
    scene: Scene,
    camera: Camera,
    lookAt: Vector3, // the point the camera is looking at (e.g. arcCam.target)
    cutOff: number = 10, // max distance
    predicate?: (mesh: AbstractMesh) => boolean // optional filter
): { name: string | undefined } {
    const origin = camera.globalPosition ?? camera.position;
    const dir = lookAt.subtract(origin);
    const length = dir.length();

    if (length === 0) return { name: undefined };

    const ray = new Ray(origin, dir.normalize(), length);

    // Only consider pickable & enabled meshes unless you provide a custom predicate
    const defaultPredicate = (m: AbstractMesh) =>
        m.isPickable !== false && m.isEnabled() && m.isVisible;

    const hits = scene.multiPickWithRay(ray, predicate ?? defaultPredicate) || [];

    // multiPickWithRay already returns hits sorted by distance (closest first).
    const closest = hits.find(h => h.hit);
    // attach the mesh that actually owns the picked point (if any)
    const owningMesh = closest?.pickedMesh as AbstractMesh | undefined;
    if (owningMesh) {
        const owningMeshName = owningMesh?.name;
        if (!owningMeshName) {
            console.warn("Owning mesh has no name or id:", owningMesh);
            return { name: undefined };
        }
        const objPos = (owningMesh).getAbsolutePosition();
        const dist = Vector3.Distance(origin, objPos);
        if (dist <= cutOff && dist > .5) {
            return { name: owningMesh.name };
        }
    }

    return { name: undefined };
}
