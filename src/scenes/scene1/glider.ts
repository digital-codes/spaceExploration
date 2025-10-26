import {
    Scene, AbstractMesh, Vector3, Color3, GlowLayer,
    PBRMaterial, Quaternion, 
    TransformNode,
    type Nullable,
    Mesh, FreeCamera,
} from '@babylonjs/core';
import { AppendSceneAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF"; // Enable GLTF/GLB loader

import type {InputState} from "@/scenes/scene1/main.ts";

// glider
const glider = {
    mesh: null as Nullable<TransformNode> | null,
    speedX: 0.002,
    speedY: 0.004,
    speedZ: 0.003,
    rotX: 0.0,
    rotY: 0.0,
    rotZ: 0.0,
    posX: 2,
    posY: 1,
    posZ: 3,
    thrustersOn: true,
    thrustOffColor: new Color3(0.0, 0.0, 0.0), // default black
    thrustOnColor: new Color3(0.1, 0.7, 1.0), // icy blue
    tl: null as AbstractMesh | null,
    tr: null as AbstractMesh | null,
}


const createGlider = async (scene: Scene) => {
    console.log("Loading glider model...");
    await AppendSceneAsync("models/glider/space_glider.glb", scene, {
        onProgress: (ev) => {
            if (ev.lengthComputable) {
                console.log(`Loading: ${(ev.loaded / ev.total * 100).toFixed(1)}%`);
            }
        },
    });
    // Helper to get thruster meshes
    const gliderMesh = scene.getTransformNodeByName("SpaceGlider");
    if (!gliderMesh) {
        throw new Error("Glider transform node not found in loaded model.");
    }
    glider.mesh = gliderMesh
    const TLmesh = scene.getMeshByName("ThrusterLeft");        // same-named mesh node
    const TRmesh = scene.getMeshByName("ThrusterRight");
    if (!glider.mesh || !TLmesh || !TRmesh) {
        throw new Error("Glider mesh not found in loaded model.");
    }
    console.log("Glider model loaded.");
    // materials
    const lmat = new PBRMaterial("ThrusterLeftMat", scene);
    lmat.albedoColor = Color3.Black();
    lmat.metallic = 0;
    lmat.roughness = 1;
    lmat.disableLighting = true;  // rely purely on emissive
    lmat.emissiveColor = glider.thrustOnColor;
    lmat.emissiveIntensity = 8;
    TLmesh.material = lmat;

    const rmat = new PBRMaterial("ThrusterLeftMat", scene);
    rmat.albedoColor = Color3.Black();
    rmat.metallic = 0;
    rmat.roughness = 1;
    rmat.disableLighting = true;  // rely purely on emissive
    rmat.emissiveColor = glider.thrustOnColor;
    rmat.emissiveIntensity = 8;
    TRmesh.material = rmat;


    glider.tl = TLmesh;
    glider.tr = TRmesh;
    glider.mesh.position = new Vector3(glider.posX, glider.posY, glider.posZ);
    glider.mesh.rotation = new Vector3(glider.rotX, glider.rotY, glider.rotZ);
    glider.mesh.scaling = new Vector3(1.0, 1.0, 1.0);


    // 2️⃣ Add a glow layer (this makes emissive visible)
    const glow = new GlowLayer("glow", scene);
    glow.intensity = .7;

}

const setThrusters = (on: boolean) => {
    console.log(`Setting thrusters ${on ? 'ON' : 'OFF'}`);
    const color = on ? glider.thrustOnColor : glider.thrustOffColor;

    [glider.tl, glider.tr].forEach(m => {
        if (!m || !m.material) return;
        const mat: any = m.material;
        console.log("Coloring thruster:", m.name, "to", color.toString());
        if (on) {
            if (mat && mat instanceof PBRMaterial) {
                mat.emissiveColor = color;
                mat.emissiveIntensity = 5;      // stronger glow
                mat.disableLighting = true;    // keep PBR lighting
            } else {
                console.log("Thruster material is not PBRMaterial");
            }
        } else {
            if (mat && mat instanceof PBRMaterial) {
                mat.emissiveColor = color;
                mat.emissiveIntensity = 1;
                mat.disableLighting = false;   
            } else {
                console.log("Thruster material is not PBRMaterial");
            }
        }
    });
    
};

const followOffset = new Vector3(0, 1.2, -4); // rear-top position relative to glider


const updateGlider = (camera: FreeCamera, cameraTarget: Vector3, dt: number, dirs: InputState) => {
    const speed = 6;
    const gm = glider.mesh as Mesh;
    let forward = Vector3.TransformNormal(new Vector3(0, 0, 1), gm.getWorldMatrix());
    let right = Vector3.TransformNormal(new Vector3(1, 0, 0), gm.getWorldMatrix());
    let up = Vector3.TransformNormal(new Vector3(0, 1, 0), gm.getWorldMatrix());

    if (gm) {
        // Update glider orientation (yaw/pitch)
        const yawQuat = Quaternion.RotationAxis(Vector3.Up(), dirs.yaw);
        const pitchQuat = Quaternion.RotationAxis(Vector3.Right(), dirs.pitch);
        gm.rotationQuaternion = new Quaternion();
        yawQuat.multiplyToRef(pitchQuat, gm.rotationQuaternion);

        // Forward, right, and up vectors
        forward = Vector3.TransformNormal(new Vector3(0, 0, 1), gm.getWorldMatrix());
        right = Vector3.TransformNormal(new Vector3(1, 0, 0), gm.getWorldMatrix());
        up = Vector3.TransformNormal(new Vector3(0, 1, 0), gm.getWorldMatrix());

        // Move glider
        gm.position.addInPlace(forward.scale(dirs.forward * speed * dt));
        gm.position.addInPlace(right.scale(dirs.right * speed * dt));
        gm.position.addInPlace(up.scale(dirs.up * speed * dt));

    }
    // --- CAMERA FOLLOWS GLIDER ---
    cameraTarget.copyFrom(gm.position);
    const rotatedOffset = Vector3.TransformCoordinates(followOffset, gm.getWorldMatrix());
    camera.position.copyFrom(rotatedOffset);
    camera.setTarget(gm.position.add(forward.scale(5))); // camera looks ahead a bit
};

export { createGlider, setThrusters, glider, updateGlider };