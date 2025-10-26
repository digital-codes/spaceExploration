import {
    Scene, Engine, HemisphericLight, MeshBuilder,
    Mesh, Vector3, Color3, Color4, StandardMaterial,
    PointLight, AbstractMesh,
    Frustum, FreeCamera, Quaternion,
    ArcRotateCamera, PBRMaterial, FlyCamera,
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
    forward: number;
    right: number;
    up: number;
    yaw: number;
    pitch: number;
};
const inputState: InputState = { forward: 0, right: 0, up: 0, yaw: 0, pitch: 0 };


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
    }
}


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
    const { scene, camera } = await createScene(engine, canvas);
    if (!scene || !camera || !engine.scenes[0]) {
        throw new Error('Scene or Camera creation failed');
    }
    // define the object update function, before the scene renders.

    // --- Distance logic ---
    const SHOW_DISTANCE = 8; // threshold in world units
    let planetSelected: number | null = null;

    // controls
    // --- DESKTOP CONTROLS (WASDQE + Mouse) ---
    window.addEventListener("keydown", (e) => {
        if (e.code === "KeyW") inputState.forward = 1;
        if (e.code === "KeyS") inputState.forward = -1;
        if (e.code === "KeyA") inputState.right = -1;
        if (e.code === "KeyD") inputState.right = 1;
        if (e.code === "KeyE") inputState.up = 1;
        if (e.code === "KeyQ") inputState.up = -1;
    });
    window.addEventListener("keyup", (e) => {
        if (["KeyW", "KeyS"].includes(e.code)) inputState.forward = 0;
        if (["KeyA", "KeyD"].includes(e.code)) inputState.right = 0;
        if (["KeyQ", "KeyE"].includes(e.code)) inputState.up = 0;
    });


    engine.scenes[0].beforeRender = function () {
        const dt = scene.getEngine().getDeltaTime() / 1000;

        if (glider.mesh) {
            // update thruster colors based on parameter
            if (sysParms.thrustersOn !== glider.thrustersOn) {
                glider.thrustersOn = sysParms.thrustersOn || false;
                setThrusters(glider.thrustersOn);
            }
            updateGlider(camera as FreeCamera, new Vector3(0,0,0), dt, inputState); // empty input state for now

        }


        // --- Object selection logic ---
        const { name: closestName } = raySelect(scene, camera, camera.getTarget(), SHOW_DISTANCE, undefined);
        //console.log("Ray Select:", "Closest:", closestName);
        if (closestName) {
            // extract trailing number from names like "obj123" -> 123
            const idx = parseInt(closestName.substring(3)) || undefined;
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
                planetGlow(scene, planet.mesh as AbstractMesh, camera);
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

const createScene = async function (engine: Engine, canvas: HTMLCanvasElement): Promise<{ scene: Scene, camera: FreeCamera | ArcRotateCamera | FlyCamera }> {
    // Create a basic BJS Scene object
    var scene = new Scene(engine);
    if (!scene) {
        throw new Error('Scene creation failed');
    }
    // Create a FreeCamera, and set its position to {x: 0, y: 5, z: -10}
    var camera: ArcRotateCamera | FlyCamera;
    if (sysParms.camMode === 'arcRotate') {
        camera = new ArcRotateCamera('camera1', -1.6, 1.2, 50, Vector3.Zero(), scene);
    } else if (sysParms.camMode === 'fly') {
        camera = new FlyCamera('camera1', new Vector3(0, 5, -10), scene);
    } else {
        // default to fly camera
        camera = new ArcRotateCamera('camera1', -1.6, 1.2, 50, Vector3.Zero(), scene);
    }
    if (!camera) {
        throw new Error('Camera creation failed');
    }
    // Target the camera to scene origin
    camera.setTarget(Vector3.Zero());
    // Attach the camera to the canvas


    switch (sysParms.camMode) {
        case 'arcRotate':
            (camera as ArcRotateCamera).attachControl(canvas, true);
            // --- Smoothness tweaks ---
            (camera as ArcRotateCamera).wheelPrecision = 100;                // 🟢 smaller = faster zoom; larger = slower
            (camera as ArcRotateCamera).wheelDeltaPercentage = 0.01;         // 🟢 smooth zoom with percentage-based delta
            (camera as ArcRotateCamera).inertia = 0.9;                       // 🟢 smoothing after movement (0 = immediate)
            (camera as ArcRotateCamera).panningInertia = 0.9;                // 🟢 same for panning
            (camera as ArcRotateCamera).lowerRadiusLimit = 2;                // optional min zoom distance
            (camera as ArcRotateCamera).upperRadiusLimit = 100;              // optional max zoom distance
            break;
        case 'fly':
            (camera as FlyCamera).speed = .1;
            (camera as FlyCamera).inertia = 0.9;
            (camera as FlyCamera).angularSensibility = 5000;
            (camera as FlyCamera).attachControl(true);
            (camera as FlyCamera).applyGravity = false;
            (camera as FlyCamera).checkCollisions = false;
            break;
        case 'free':
            (camera as unknown as FreeCamera).attachControl(canvas, true);
            (camera as unknown as FreeCamera).minZ = 0.1;
            (camera as unknown as FreeCamera).speed = 0.5;
            (camera as unknown as FreeCamera).inertia = 0.6;
            break;
        default:
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


    return { scene, camera };
}


const resizeGame = function () {
    console.log("Resizing game canvas.");
    if (engine) {
        engine.resize();
    }
}

export { buildCanvas, setCb, disposeEngine, getParams, setParams, resizeGame, setThrusters };
