import {
    Scene, Engine, HemisphericLight, MeshBuilder,
    Mesh, Vector3, Color3, Color4, StandardMaterial,
    PointLight, AbstractMesh, Viewport,
    FollowCamera, FreeCamera,
    ArcRotateCamera, FlyCamera,
    DirectionalLight,
    type Nullable
} from '@babylonjs/core';

// scene construction imports
import createGround from './ground';
import { createGlider, setThrusters, glider, updateGlider } from './glider';
import createPlanet from './planets';
import createSkybox from './skybox';
import raySelect from './raySelect';


// load system data
interface PlanetObject {
    mesh: Nullable<Mesh> | null;
    idx: number;
    name: string;
    emissive: boolean;
    map: string | null;
    img: string;
    xpos: number;
    ypos: number;
    zpos: number;
    parm_a: number;
    parm_b: number;
    parm_c: number;
    diameter?: number;
    rotation: {
        speed: number;
        angle: number;
        active: boolean;
    };
    orbit: {
        radius: number;
        speed: number;
        angle: number;
        active: boolean;
    };
    // allow extra fields from JSON
    [key: string]: any;
}

export type InputState = {
    thrust: number;
    roll: number;
    yaw: number;
    pitch: number;
};

const inputState: InputState = { thrust: 0, roll: 0, yaw: 0, pitch: 0 };
const inputState_: InputState = { ...inputState };


// import raw JSON and assert the typed shape
import rawSystem from '@/assets/data/objects.json';
import planetGlow from './planetGlow';
const system: PlanetObject[] = (rawSystem as unknown) as PlanetObject[];
console.log(system);

// main scene builder
let callback: (msg: string, id: number) => void;

const setCb = (cb: (msg: string, id: number) => void) => {
    console.log("SetCB called");
    callback = cb;
};

export interface SceneParams {
    renderLoop?: boolean;
    cameraDistance?: number;
    cameraAngle?: number;
    shipSpeed?: number;
    gravity?: number;
    buoyance?: number;
    cluster?: number;
    camMode?: string;
    thrustersOn?: boolean;
}


const sysParms: SceneParams = {
    renderLoop: false,
    gravity: 1.0,
    buoyance: 1.0,
    cluster: 1.0,
    camMode: 'free', // other options: default, 'arcRotate', 'free', 'follow', 'fly'
    thrustersOn: false,
}

const getParams = function (): SceneParams {
    return sysParms;
}

const setParams = function <K extends keyof SceneParams>(key: K, value: SceneParams[K]) {
    if (!Object.prototype.hasOwnProperty.call(sysParms, key)) {
        throw new Error(`Invalid parameter key: ${String(key)}`);
    }
    (sysParms as SceneParams)[key] = value;
    console.log(`Parameter ${String(key)} set to ${value}`);
}

let engine: Engine | null = null;

const disposeEngine = function () {
    if (engine) {
        engine.stopRenderLoop();
        window.removeEventListener('resize', function () {
            engine?.resize();
        });
        engine.dispose();
        engine = null;
        console.log("Engine disposed.");
         // --- Remove keyboard listeners ---
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
    }
}

// control functions
// --- Event handler definitions ---
function onKeyDown(e: KeyboardEvent) {
        console.log("KeyDown:", e.code);
    switch (e.code) {
        case "KeyQ": inputState.yaw = 1; break;
        case "KeyE": inputState.yaw = -1; break;
        case "KeyA": inputState.pitch = 1; break;
        case "KeyD": inputState.pitch = -1; break;
        case "KeyW": inputState.thrust = 1; break;
        case "KeyS": inputState.thrust = -1; break;
    }
}
function onKeyUp(e: KeyboardEvent) {
    console.log("KeyUp:", e.code);
    if (["KeyQ", "KeyE"].includes(e.code)) inputState.yaw = 0;
    if (["KeyA", "KeyD"].includes(e.code)) inputState.pitch = 0;
    if (["KeyW", "KeyS"].includes(e.code)) inputState.thrust = 0;
}

/*
let pointerLocked = false;
function onMouseMove(e: MouseEvent) {
    if (!pointerLocked) return;
    inputState.pitchDelta -= e.movementY * 0.0015;
}
*/

const buildCanvas = async (canvas: HTMLCanvasElement) => {
    if (!canvas) {
        throw new Error('Canvas element not found');
    }
    // Load the 3D engine
    if (engine) {
        console.log("Disposing existing engine.");
        disposeEngine();
    }
    engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    if (!engine) {
        throw new Error('Engine creation failed');
    }
    // CreateScene function that creates and return the scene
    const { scene, camera, birdCam } = await createScene(engine, canvas);
    if (!scene || !camera || !engine.scenes[0]) {
        throw new Error('Scene or Camera creation failed');
    }
    // define the object update function, before the scene renders.

    // --- Distance logic ---
    const SHOW_DISTANCE = 8; // threshold in world units
    let planetSelected: number | null = null;

    // controls
    // ---- Input (keyboard + mouse) ----
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);


    engine.scenes[0].beforeRender = function () {
        const dt = scene.getEngine().getDeltaTime() / 1000;

        if (glider.mesh) {
            // update thruster colors based on parameter
            if (sysParms.thrustersOn !== glider.thrustersOn) {
                glider.thrustersOn = sysParms.thrustersOn || false;
                setThrusters(glider.thrustersOn);
            }
            const needsUpdate = (inputState.pitch != 0 || inputState.yaw != 0 ||
                inputState.roll != 0 ||
                inputState.thrust != 0)
            if (needsUpdate) {
                console.log("Input State Changed:", inputState);
            }
            updateGlider(camera as FreeCamera, "free", birdCam, dt, inputState, needsUpdate);
            Object.assign(inputState_, inputState);
            if (glider.marker) {
                // negate due to inverse birdcam
                glider.marker.position.x = -glider.mesh.position.x;
                glider.marker.position.z = glider.mesh.position.z;
                glider.marker.position.y = 40;  // just below birdcam
            }
        }


        // --- Object selection logic ---
        const { name: closestName } = raySelect(scene, camera, camera.getTarget(), SHOW_DISTANCE, undefined);
        if (closestName) {
            console.log("Ray Select:", "Closest:", closestName);
            console.log("Planet Selected:", planetSelected);
            console.log("Cam Position", camera.position);
            console.log("Cam Target", camera.getTarget());
            console.log("Planet Position:", system.find(p => p.name === closestName)?.mesh?.position);
            // extract trailing number from names like "obj123" -> 123
            const idx = (parseInt(closestName.substring(3)) - 1) || undefined;
            if (idx === undefined) {
                console.warn("Invalid object name:", closestName);
                return;
            }
            const planet = system.find(p => p.name === closestName);
            if (!planet) {
                console.warn("No planet found for name:", closestName);
                return;
            }
            // show popup
            if (!planetSelected || planetSelected !== idx) {
                planetSelected = idx;
                if (callback) {
                    callback("on", idx);
                }
                planetGlow(scene, planet.mesh as AbstractMesh, planet.diameter || 1);
                console.log("Showing popup for " + planetSelected);
            }
        } else {
            // hide popup
            if (planetSelected) {
                console.log("Hiding popup for " + planetSelected);
                if (callback) {
                    callback("off", planetSelected);
                }
            }
            planetSelected = null;
            // remove any previous selection rings so we don't leak multiple rings
            scene.meshes
                .filter(m => m.metadata && (m.metadata as any).isSelectionRing)
                .forEach(m => {
                    try { m.dispose(); } catch { /* ignore dispose errors */ }
                });
        }
    }

    // test positions 
    // Argentina -18.1042668809, -10.5421525959
    // "crop_x_px": 956.87, "crop_y_px": 1521 956.87, 1521
    // adjust like so: (px - 1500) / 30 for x, and -(py - 904) / 30 for z
    // russia crop_x_px": 2307.29, "crop_y_px": 538
    const marker = MeshBuilder.CreateBox("redCubeMarker", { size: 1 }, scene);
    marker.position = new Vector3((2307.29 - 1500) / 30, .7, -(538 - 904) / 30);
    const markerMat = new StandardMaterial("redCubeMat", scene);
    markerMat.diffuseColor = new Color3(1, 0, 0); // red
    markerMat.specularColor = new Color3(0, 0, 0);
    marker.material = markerMat;

    const marker2 = MeshBuilder.CreateBox("blueCubeMarker", { size: 1 }, scene);
    marker2.position = new Vector3((956 - 1500) / 30, .7, -(1521 - 904) / 30);
    const markerMat2 = new StandardMaterial("blueCubeMat", scene);
    markerMat2.diffuseColor = new Color3(0, 0, 1); // blue
    markerMat2.specularColor = new Color3(0, 0, 0);
    marker2.material = markerMat2;
    // 



    console.log("Env Texture:", scene.environmentTexture);             // should be a valid environment texture (HDR .env)
    console.log("Tone Mapping Enabled:", scene.imageProcessingConfiguration.toneMappingEnabled); // true if HDR tone mapping active
    // Guard access because scene.getEngine() returns AbstractEngine in types; cast or check before reading isHDR
    const _eng = scene.getEngine();
    console.log('isHDR' in _eng ? (_eng as any).isHDR : false);              // Babylon 8+ engine-level HDR flag


    // call resize from parent, if required

    // run the render loop
    engine.runRenderLoop(function () {
        if (sysParms.renderLoop) {
            scene.render();
        }
    });

    return canvas;
}

const createScene = async function (engine: Engine, canvas: HTMLCanvasElement): Promise<{ scene: Scene, 
    camera: FreeCamera | ArcRotateCamera | FlyCamera | FollowCamera, birdCam: FreeCamera }> {
    // Create a basic BJS Scene object
    var scene = new Scene(engine);
    if (!scene) {
        throw new Error('Scene creation failed');
    }
    // Create a FreeCamera, and set its position to {x: 0, y: 5, z: -10}
    let camera: ArcRotateCamera | FlyCamera | FreeCamera | FollowCamera;

    switch (sysParms.camMode) {
        case 'arcRotate':
            camera = new ArcRotateCamera("ArcRotateCamera", Math.PI / 2, Math.PI / 4, sysParms.cameraDistance || 20, Vector3.Zero(), scene);
            (camera as ArcRotateCamera).attachControl(canvas, true);
            // --- Smoothness tweaks ---
            (camera as ArcRotateCamera).wheelPrecision = 100;                // 🟢 smaller = faster zoom; larger = slower
            (camera as ArcRotateCamera).wheelDeltaPercentage = 0.01;         // 🟢 smooth zoom with percentage-based delta
            (camera as ArcRotateCamera).inertia = 0.9;                       // 🟢 smoothing after movement (0 = immediate)
            (camera as ArcRotateCamera).panningInertia = 0.9;                // 🟢 same for panning
            (camera as ArcRotateCamera).lowerRadiusLimit = 2;                // optional min zoom distance
            (camera as ArcRotateCamera).upperRadiusLimit = 100;              // optional max zoom distance
            // Target the camera to scene origin
            (camera as ArcRotateCamera).setTarget(Vector3.Zero());
            break;
        case 'fly':
            camera = new FlyCamera("FlyCamera", new Vector3(0, 5, -10), scene);
            (camera as FlyCamera).speed = .1;
            (camera as FlyCamera).inertia = 0.9;
            (camera as FlyCamera).angularSensibility = 5000;
            (camera as FlyCamera).attachControl(true);
            (camera as FlyCamera).applyGravity = false;
            (camera as FlyCamera).checkCollisions = false;
            break;
        case 'free':
            camera = new FreeCamera("FreeCamera", new Vector3(0, 5, -10), scene);
            (camera as unknown as FreeCamera).attachControl(canvas, true);
            (camera as unknown as FreeCamera).minZ = 0.1;
            (camera as unknown as FreeCamera).speed = 10.9;
            (camera as unknown as FreeCamera).inertia = 0.5;
            break;
        case 'follow':
            camera = new FollowCamera("FollowCamera", new Vector3(0, 5, -10), scene);
            (camera as FollowCamera).attachControl(true);
            //The goal distance of camera from target
            camera.radius = 3;
            // The goal height of camera above local origin (centre) of target
            camera.heightOffset = 2;
            // The goal rotation of camera around local origin (centre) of target in x y plane
            camera.rotationOffset = 0;
            //Acceleration of camera in moving from current to goal position
            camera.cameraAcceleration = 0.05;
            //The speed at which acceleration is halted
            camera.maxCameraSpeed = 10.0;
            // apply additional settings
            camera.minZ = 0.1;
            camera.speed = 0.5;
            camera.inertia = 0.6;
            break;
        default:
            camera = new ArcRotateCamera("ArcRotateCamera", Math.PI / 2, Math.PI / 4, sysParms.cameraDistance || 20, Vector3.Zero(), scene);
            (camera as ArcRotateCamera).attachControl(canvas, true);
            // --- Smoothness tweaks ---
            (camera as ArcRotateCamera).wheelPrecision = 100;                // 🟢 smaller = faster zoom; larger = slower
            (camera as ArcRotateCamera).wheelDeltaPercentage = 0.01;         // 🟢 smooth zoom with percentage-based delta
            (camera as ArcRotateCamera).inertia = 0.9;                       // 🟢 smoothing after movement (0 = immediate)
            (camera as ArcRotateCamera).panningInertia = 0.9;                // 🟢 same for panning
            (camera as ArcRotateCamera).lowerRadiusLimit = 2;                // optional min zoom distance
            (camera as ArcRotateCamera).upperRadiusLimit = 100;              // optional max zoom distance
            break;

    }


    // --- Bird’s-eye camera (top-down) ---
    const birdCam = new FreeCamera("birdCam", new Vector3(0, 50, 0), scene);
    birdCam.mode = FreeCamera.ORTHOGRAPHIC_CAMERA;
    const halfSizeX = 50;
    const halfSizeY = 30;
    birdCam.orthoLeft   = -halfSizeX;
    birdCam.orthoRight  =  halfSizeX;
    birdCam.orthoTop    =  halfSizeY;
    birdCam.orthoBottom = -halfSizeY;
    //birdCam.setTarget(Vector3.Zero());
    birdCam.rotation = new Vector3(Math.PI / 2, 0, 0); // look straight down


    //birdCam.rotation.z = Math.PI;      // rotate 180° around Y
    //birdCam.rotation.y = 0;


    // Set each camera’s viewport
    // (x, y, width, height) are normalized 0–1
    camera.viewport = new Viewport(0, 0, 1.0, 1.0);          // full screen
    //birdCam.viewport  = new Viewport(.80, 0.88, 0.20, 0.12);  // small upper-right corner
    birdCam.viewport  = new Viewport(.70, 0.80, 0.30, 0.20);  // small upper-right corner

    // Add both cameras to scene
    scene.activeCameras = [camera, birdCam];


    /*
    scene.createDefaultEnvironment({
        environmentTexture: undefined, // use built-in neutral HDR if none provided
    });
    */

    scene.clearColor = new Color4(0, 0, 0, 1);


    // Have the Camera orbit the sun (third value moves camera away from center).

    const galacticlight = new HemisphericLight('galacticlight', new Vector3(0, 1, 0), scene);

    galacticlight.intensity = 0.5;

    galacticlight.groundColor = new Color3(0.5, 0.5, 1.0);

    // some direct light for the glider
    // Directional sunlight
    const sun = new DirectionalLight("sun", new Vector3(-1, -2, 1), scene);
    sun.position = new Vector3(10, 20, -10);
    sun.intensity = 2.0;


    // skybox.
    createSkybox(scene);

    // Create the objects
    system.forEach(object => {
        createPlanet(object, scene);
        if (object.name === 'obj1') {
            console.log('Adding sunlight for ' + object.name);
            var sunLight = new PointLight('sunlight', Vector3.Zero(), scene);
            sunLight.intensity = 20.2;
        }
    });
    // Create the ground
    createGround(scene);

    await createGlider(scene);

    if (!glider.mesh) {
        throw new Error('Glider creation failed');
    } else {
        console.log('Glider created successfully');
        // OPTION
        if (birdCam) {
            // --- Bird’s-eye mini-map follows glider position ---
            birdCam.position.x = glider.mesh.position.x;
            birdCam.position.z = glider.mesh.position.z;
            //birdCam.setTarget(glider.mesh.position);
        }

        if (sysParms.camMode == "follow") {
            camera.lockedTarget = glider.mesh;
        }

        /* don't do this here - ground looses light and textures
        // attach the camera to the glider
        if (sysParms.camMode === 'free' || sysParms.camMode === 'fly') {
            // set parent to the glider's mesh (not the glider state object) and cast to any to satisfy TS
            camera.parent = glider.mesh as any;

            // move the camera back and up a little in glider's local space
            camera.position = new Vector3(0, 1.5, -6);

            // make it look forward relative to glider
            camera.rotation = new Vector3(0, 0, 0);
        }
            */
    }

    // create a small red disc or sphere
    const glMarker = MeshBuilder.CreateDisc("marker", { radius: 2.0, tessellation: 16 }, scene);
    glMarker.rotation.x = Math.PI / 2;            // flat on ground
    const mat = new StandardMaterial("markerMat", scene);
    mat.diffuseColor = new Color3(1, 0, 0);
    mat.emissiveColor = new Color3(1, 1, 0); // stays bright even in shade
    glMarker.material = mat;
    glMarker.isPickable = false;                   // optional
    glMarker.layerMask = 0xFFFFFFFF;               // visible to all cameras
    if (glider.mesh) {
        glider.marker = glMarker
    }


    return { scene, camera, birdCam };
}


const resizeGame = function () {
    console.log("Resizing game canvas.");
    if (engine) {
        engine.resize();
    }
}

export { buildCanvas, setCb, disposeEngine, getParams, setParams, resizeGame, setThrusters };
