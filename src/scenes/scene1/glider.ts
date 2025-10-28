import {
    Scene, AbstractMesh, Vector3, Color3, GlowLayer,
    PBRMaterial, Quaternion,
    TransformNode,
    type Nullable,
    Mesh, FreeCamera,
    Matrix,
} from '@babylonjs/core';
import { AppendSceneAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF"; // Enable GLTF/GLB loader

import type { InputState } from "@/scenes/scene1/main.ts";

// glider
const glider = {
    mesh: null as Nullable<TransformNode> | null,
    marker: null as Nullable<TransformNode> | null,
    speed: 0.0,
    yaw: 0.0,
    pitch: 0.0,
    roll: 0.0,
    rotationQuat: Quaternion.Identity(),
    posX: -20,
    posY: 1,
    posZ: -10,
    extendsX: 50,
    extendsZ: 30,
    maxSpeed: 15.0,
    accel: 10.0,
    decel: 10.0,
    thrustersOn: true,
    thrustOffColor: new Color3(0.0, 0.0, 0.0), // default black
    thrustOnColor: new Color3(0.1, 0.7, 1.0), // icy blue
    tl: null as AbstractMesh | null,
    tr: null as AbstractMesh | null,
}


const createGlider = async (scene: Scene) => {
    console.log("Loading glider model...");
    // space-glider.glb
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
    // 💡 Fix orientation: rotate 180° around Y so engines are at rear
    glider.mesh.rotationQuaternion = Quaternion.FromEulerAngles(0, 0, 0);
    // glider.mesh.rotation = new Vector3(glider.yaw, glider.pitch, glider.roll);
    glider.mesh.scaling = new Vector3(.2, .2, .2);


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


const updateGlider = (camera: FreeCamera, cameraType: string, birdCam: FreeCamera | null, dt: number, dirs: InputState, needsUpdate: boolean) => {
    const gm = glider.mesh as Mesh;

    if (gm) {
        // Update rotation (yaw, pitch, roll)

        if (needsUpdate) {
            console.log(`Glider input state: yaw=${dirs.yaw.toFixed(2)}, pitch=${dirs.pitch.toFixed(2)}, thrust=${dirs.thrust}`);
            const yawRate = 1.5;
            const pitchRate = 1.2;

            // per-frame input angles (small deltas, not absolute values)
            const yawDelta = dirs.yaw * yawRate * dt;
            const pitchDelta = dirs.pitch * pitchRate * dt;


            // 1. get local axes from current orientation
            //const right = Vector3.TransformNormal(Vector3.Right(), gm.getWorldMatrix()).normalize();
            const up = Vector3.TransformNormal(Vector3.Up(), gm.getWorldMatrix()).normalize();

            // 2. build incremental rotations around those LOCAL axes
            const qYawLocal = Quaternion.RotationAxis(up, yawDelta);
            //const qPitchLocal = Quaternion.RotationAxis(right, pitchDelta);

            // 3. apply them to current orientation
            //glider.rotationQuat = qYawLocal.multiply(qPitchLocal).multiply(glider.rotationQuat);
            glider.rotationQuat = qYawLocal.multiply(glider.rotationQuat);
            glider.rotationQuat.normalize();
            gm.rotationQuaternion = glider.rotationQuat;


            // --- Direction: nose points forward, roll tilts climb ---
            //const localForward = new Vector3(0, 0, -1);
            //const forward = Vector3.TransformNormal(localForward, gm.getWorldMatrix()).normalize();
            //const forward = Vector3.TransformNormal(new Vector3(0, 0, 1), gm.getWorldMatrix()).normalize();
            // local forward is now -Z because of the 180° flip above
            //const forwardLocal = new Vector3(0, 0, -1);
            //const forward = Vector3.TransformNormal(forwardLocal, gm.getWorldMatrix()).normalize();

            // change y position by pitchDelta to simulate climb/dive
            gm.position.y += pitchDelta;
        }

        // Update speed
        if (dirs.thrust > 0) glider.speed = Math.min(glider.maxSpeed, glider.speed + glider.accel * dt);
        else if (dirs.thrust < 0) glider.speed = Math.max(0, glider.speed - glider.decel * dt);
        //else glider.speed *= 0.99; // drag

        // check if position goes beyond x/z extends + 5%. bounce back if yes
        const bounds = 5; // 5% boundary

        if (Math.abs(gm.position.x) > glider.extendsX * (1 + bounds / 100)) {
            gm.position.x = glider.extendsX * (1 + bounds / 100) * Math.sign(gm.position.x);
            glider.speed = 0; // reset speed on bounce
            setThrusters(false);
        }
        if (Math.abs(gm.position.x) < -glider.extendsX * (1 + bounds / 100)) {
            gm.position.x = -glider.extendsX * (1 + bounds / 100) * Math.sign(gm.position.x);
            glider.speed = 0; // reset speed on bounce
            setThrusters(false);
        }
        if (Math.abs(gm.position.z) > glider.extendsZ * (1 + bounds / 100)) {
            gm.position.z = glider.extendsZ * (1 + bounds / 100) * Math.sign(gm.position.z);
            glider.speed = 0; // reset speed on bounce
            setThrusters(false);
        }
        if (Math.abs(gm.position.z) < -glider.extendsZ * (1 + bounds / 100)) {
            gm.position.z = -glider.extendsZ * (1 + bounds / 100) * Math.sign(gm.position.z);
            glider.speed = 0; // reset speed on bounce
            setThrusters(false);
        }

        if (needsUpdate) {
            setThrusters(glider.speed != 0);
        }
        

        // Update position
        const rotationMatrix = new Matrix();
        Matrix.FromQuaternionToRef(glider.rotationQuat, rotationMatrix);
        const forward = Vector3.TransformNormal(
            Vector3.Forward(),
            rotationMatrix
        ).normalize();
        gm.position.addInPlace(forward.scale(glider.speed * dt));



        // 
        /*
        console.log(`Glider speed: ${glider.speed.toFixed(2)}`);
        console.log(`Glider position: ${gm.position.toString()}`);
        console.log(`Glider rotation (yaw,pitch,roll): (${glider.yaw.toFixed(2)}, ${glider.pitch.toFixed(2)}, ${glider.roll.toFixed(2)})`);
        */
       
        // ---- Always-visible camera ----
        if (cameraType === 'free') {
            const maxLerp = 1.0;  // .1;
            // Desired position = behind + above glider in world space
            const rearOffset = new Vector3(0, 2, -4);
            const offsetWorld = Vector3.TransformCoordinates(rearOffset, gm.getWorldMatrix());

            // Smooth follow (optional)
            camera.position = Vector3.Lerp(camera.position, offsetWorld, maxLerp);

            // Camera always looks slightly ahead of glider (not its back)
            const lookAhead = Vector3.TransformCoordinates(new Vector3(0, 0, 10), gm.getWorldMatrix());
            camera.setTarget(Vector3.Lerp(camera.getTarget(), lookAhead, maxLerp));

            // Keep horizon upright: reset upVector each frame
            camera.upVector = Vector3.Up();
        }
        if (birdCam) {
            // --- Bird’s-eye mini-map follows glider position ---
            birdCam.position.x = -gm.position.x;
            birdCam.position.z = gm.position.z;
            //birdCam.setTarget(gm.position);
        }
    }
};

export { createGlider, setThrusters, glider, updateGlider };