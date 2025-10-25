import {
    Scene, Engine, HemisphericLight, MeshBuilder,
    Mesh, Vector3, Color3, Color4, StandardMaterial,
    PointLight, GlowLayer,
    Frustum, FreeCamera,
    ArcRotateCamera, PBRMaterial, FlyCamera,
    DirectionalLight,
    type Nullable
} from '@babylonjs/core';

import { Button, AdvancedDynamicTexture, Rectangle, TextBlock } from "@babylonjs/gui";

// scene construction imports
import createGround  from './ground';
import {createGlider, setThrusters, glider}  from './glider';
import createPlanet  from './planets';
import createSkybox  from './skybox';

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

// import raw JSON and assert the typed shape
import rawSystem from '@/assets/data/objects.json';
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
    camMode: 'arcRotate', // other options: default, 'arcRotate', 'free', 'follow', 'fly'
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
    const SHOW_DISTANCE = 5; // threshold in world units
    let popupVisible = false;
    let popId: string | null = null;

    // --- GUI Popup logic ---
    const gui = AdvancedDynamicTexture.CreateFullscreenUI("UI", true, scene);
    const popup = new Rectangle("popup");
    popup.width = "240px";
    popup.height = "100px";
    popup.cornerRadius = 12;
    popup.color = "#333";
    popup.thickness = 2;
    popup.background = "rgba(255,255,255,0.9)";
    popup.isVisible = false;
    gui.addControl(popup);

    const text = new TextBlock();
    text.text = "This is the sphere object!";
    text.color = "#000";
    text.fontSize = 18;
    popup.addControl(text);

    // --- Clickable link ---
    const linkBtn = Button.CreateSimpleButton("linkBtn", "🔗 Open More Info");
    linkBtn.width = "200px";
    linkBtn.height = "40px";
    linkBtn.color = "#0066cc";
    linkBtn.cornerRadius = 8;
    linkBtn.thickness = 1;
    linkBtn.background = "#e8f0ff";
    linkBtn.top = "40px";
    popup.addControl(linkBtn);

    let currentLink: string | null = "https://www.babylonjs.com";

    // --- Link action ---
    linkBtn.onPointerClickObservable.add(() => {
        if (currentLink) window.open(currentLink, "_blank");
    });

    engine.scenes[0].beforeRender = function () {
        if (glider.mesh) {
            // update thruster colors based on parameter
            if (sysParms.thrustersOn !== glider.thrustersOn) {
                glider.thrustersOn = sysParms.thrustersOn || false;
                setThrusters(glider.thrustersOn);
            }
            // update glider x,y,z position from last position and speed
            glider.posX += glider.speedX;
            glider.posY += glider.speedY;
            glider.posZ += glider.speedZ;
            /* The above code is setting the position of a mesh object named "glider" using the values of its posX,
            posY, and posZ properties. It is creating a new Vector3 object with these values and assigning it to
            the position property of the glider.mesh object. */
            //glider.mesh.position = new Vector3(glider.posX, glider.posY, glider.posZ);  
        }
        const camPos = camera.position;
        for (let idx = 0; idx < system.length; idx++) {
            const planet = system[idx];
            if (!planet) continue;
            // console.log(planet.name);
            if (!planet.mesh) {
                // skip planets that haven't been created yet
                console.log('Skipping ' + planet.name + ' - no mesh yet.');
                continue;
            }
            // (planet.mesh as Mesh).position.y = 3;
            /*
            if (planet.orbit.angle != 0 && planet.orbit.active) {
                (planet.mesh as Mesh).position.x = planet.orbit.radius * Math.sin(planet.orbit.angle);
                (planet.mesh as Mesh).position.z = planet.orbit.radius * Math.cos(planet.orbit.angle);
                planet.orbit.angle += planet.orbit.speed;
            }
                */
            //TODO: individual rotations for each Planet in this range.
            if (planet.rotation.active) {
                (planet.mesh as Mesh).rotate(new Vector3(0, 1, 0), planet.rotation.speed);
            }

            // check distance to camera
            const objPos = (planet.mesh as Mesh).getAbsolutePosition();
            const dist = Vector3.Distance(camPos, objPos);
            if (dist < SHOW_DISTANCE) {
                // Check if object is in camera's field of view
                const frustumPlanes = Frustum.GetPlanes(camera.getTransformationMatrix());
                const inView = (planet.mesh as Mesh).isInFrustum(frustumPlanes);
                if (!inView) {
                    if (popupVisible && popId === planet.name) {
                        popupVisible = false;
                        popup.isVisible = false;
                        //console.log("Object " + planet.name);
                        //console.log('Hiding popup (out of view), distance: ' + dist);
                        planet.rotation.active = true;
                        planet.orbit.active = true;
                        popId = null;
                        if (callback) {
                            callback("off", idx);
                        }
                        // remove any previous selection rings so we don't leak multiple rings
                        scene.meshes
                            .filter(m => m.metadata && (m.metadata as any).isSelectionRing)
                            .forEach(m => {
                                try { m.dispose(); } catch { /* ignore dispose errors */ }
                            });

                    }
                    continue; // skip to next object
                }
                // now we are close ... 
                if (!popupVisible) {
                    popId = planet.name;
                    text.text = "This is the sphere object: " + popId;
                    //console.log('Updating popup text for ' + popId);
                    popupVisible = true;
                    // popup.isVisible = true; // !!!!!!!! use parent to display message 
                    //console.log("Object " + planet.name);
                    //console.log('Showing popup, distance: ' + dist);
                    // stop object rotation
                    planet.rotation.active = false;
                    planet.orbit.active = false;
                    if (callback) {
                        callback("on", idx);
                    }
                    // activate glow ring 
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
                    const diam = planet.diameter || ((planet.mesh as Mesh).getBoundingInfo().boundingSphere.radius * 2) || 1;
                    const ringDiameter = diam * 1.6;
                    const ringThickness = Math.max(diam * 0.06, 0.02);

                    // create a torus (donut) and attach it to the planet
                    const ring = MeshBuilder.CreateTorus(`selectionRing_${planet.name}`, {
                        diameter: ringDiameter,
                        thickness: ringThickness,
                        tessellation: 64
                    }, scene);

                    ring.parent = planet.mesh;
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
            } else {
                // console.log('Object ' + planet.name + ' is far, distance: ' + dist);
                // we are far away
                if (popupVisible && popId === planet.name) {
                    popupVisible = false;
                    popup.isVisible = false;
                    popId = null;
                    //console.log("Object " + planet.name);
                    //console.log('Hiding popup, distance: ' + dist);
                    planet.rotation.active = true;
                    planet.orbit.active = true;
                    if (callback) {
                        callback("off", idx);
                    }
                    // remove any previous selection rings so we don't leak multiple rings
                    scene.meshes
                        .filter(m => m.metadata && (m.metadata as any).isSelectionRing)
                        .forEach(m => {
                            try { m.dispose(); } catch { /* ignore dispose errors */ }
                        });


                }
            }
        };
    }

    // test positions 
    // Argentina -18.1042668809, -10.5421525959
    // "crop_x_px": 956.87, "crop_y_px": 1521 956.87, 1521
    // adjust like so: (px - 1500) / 30 for x, and -(py - 904) / 30 for z
    // russia crop_x_px": 2307.29, "crop_y_px": 538
    const marker = MeshBuilder.CreateBox("redCubeMarker", { size: 1 }, scene);
    marker.position = new Vector3((2307.29-1500)/30, .7, -(538-904)/30);
    const markerMat = new StandardMaterial("redCubeMat", scene);
    markerMat.diffuseColor = new Color3(1, 0, 0); // red
    markerMat.specularColor = new Color3(0, 0, 0);
    marker.material = markerMat;

    const marker2 = MeshBuilder.CreateBox("blueCubeMarker", { size: 1 }, scene);
    marker2.position = new Vector3((956-1500)/30, .7, -(1521-904)/30);
    const markerMat2 = new StandardMaterial("blueCubeMat", scene);
    markerMat2.diffuseColor = new Color3(0, 0, 1); // blue
    markerMat2.specularColor = new Color3(0, 0, 0);
    marker2.material = markerMat2;
    // 



    console.log("Env Texture:", scene.environmentTexture);             // should be a valid environment texture (HDR .env)
    console.log("Tone Mapping Enabled:", scene.imageProcessingConfiguration.toneMappingEnabled); // true if HDR tone mapping active
    // Guard access because scene.getEngine() returns AbstractEngine in types; cast or check before reading isHDR
    const _eng = scene.getEngine();
    console.log('isHDR' in _eng ? ( _eng as any ).isHDR : false);              // Babylon 8+ engine-level HDR flag


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

    if (camera instanceof FlyCamera) {
        camera.speed = .1;
        camera.inertia = 0.9;
        camera.angularSensibility = 5000;
        camera.attachControl(true);
        camera.applyGravity = false;
        camera.checkCollisions = false;

    } else {
        camera.attachControl(canvas, true);
        // --- Smoothness tweaks ---
        camera.wheelPrecision = 100;                // 🟢 smaller = faster zoom; larger = slower
        camera.wheelDeltaPercentage = 0.01;         // 🟢 smooth zoom with percentage-based delta
        camera.inertia = 0.9;                       // 🟢 smoothing after movement (0 = immediate)
        camera.panningInertia = 0.9;                // 🟢 same for panning
        camera.lowerRadiusLimit = 2;                // optional min zoom distance
        camera.upperRadiusLimit = 100;              // optional max zoom distance
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
