import {
    Scene, Engine, HemisphericLight, MeshBuilder,
    Mesh, AbstractMesh, Vector3, Color3, Color4, StandardMaterial,
    Texture, CubeTexture, PointLight, GlowLayer,
    DynamicTexture, Frustum,
    ArcRotateCamera, PBRMaterial,
    TransformNode, DirectionalLight,
    type Nullable
} from '@babylonjs/core';
import { AppendSceneAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF"; // Enable GLTF/GLB loader


import { Button, AdvancedDynamicTexture, Rectangle, TextBlock } from "@babylonjs/gui";

import system from '../assets/data/objects.json';
console.log(system);

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
    camMode: 'default', // other options: 'arcRotate', 'free', 'follow'
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

const createGround = function (scene: Scene) {
    const checker = false
    // Create a built-in "ground" shape.
    //const ground = MeshBuilder.CreateGround('ground1', { width: 6, height: 6, subdivisions: 2 }, scene);
    // 4a – Create a fairly large checkerboard ground (size 50 × 50 units)
    const ground = MeshBuilder.CreateGround(
        'checkerGround',
        { width: 100, height: 60, subdivisions: 2 },
        scene
    );

    if (!checker) {
        // Simple green material
        const groundMat = new StandardMaterial("groundMat", scene);
        groundMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
        groundMat.specularColor = new Color3(0, 0, 0);
        try {
            // Load a PNG texture for the ground (path relative to your served assets)
            const groundTex = new Texture('img/map/mercator_world_with_capitals_cropped.png', scene, true, false, Texture.TRILINEAR_SAMPLINGMODE,
                () => { console.log('Ground texture loaded'); },
                (message, exception) => { console.warn('Ground texture failed to load:', message, exception); }
            );
            // Mirror the PNG horizontally (flip along the image's vertical axis)
            //groundTex.uScale = -1;
            //groundTex.vScale = -1;
            //groundTex.uOffset = 1;

            // Option (alternative): rotate the UVs 180° in the UV plane (uncomment if you prefer rotation and your Babylon version supports it)
            groundTex.uAng = Math.PI;
            // now the camera looks at japan (east). extends to west along depth (z)

            groundMat.diffuseTexture = groundTex;
        } catch (err) {
            console.warn('Error creating ground texture:', err);
            // fallback: keep simple color material already configured
        }
        ground.material = groundMat;
        return;
    }
    // 2) Build a checkerboard texture with 10x10 squares (each square = 1 unit)
    const squares = 10;
    const texSize = 1024; // power of 2 for good mipmapping
    const dt = new DynamicTexture("checkerDT", { width: texSize, height: texSize }, scene, false);
    // 👇 Cast the context to the DOM type so TypeScript allows text drawing methods
    const ctx = dt.getContext() as CanvasRenderingContext2D;
    const cell = texSize / squares;

    // Set text style
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.floor(cell * 0.4)}px Arial`;



    for (let row = 0; row < squares; row++) {
        for (let col = 0; col < squares; col++) {
            const even = (row + col) % 2 === 0;
            ctx.fillStyle = even ? "#ffffff" : "#333333";
            ctx.fillRect(col * cell, row * cell, cell, cell);

            const textColor = even ? "#000000" : "#ffffff";
            ctx.fillStyle = textColor;

            // World-relative coordinate labels
            const labelX = col - squares / 2;
            const labelZ = squares / 2 - row - 1;

            const centerX = col * cell + cell / 2;
            const centerY = row * cell + cell / 2;

            ctx.fillText(`x${labelX}`, centerX, centerY - cell * 0.15);
            ctx.fillText(`z${labelZ}`, centerX, centerY + cell * 0.15);
        }
    }
    dt.update();

    // Configure texture properties directly on dt
    dt.wrapU = Texture.CLAMP_ADDRESSMODE;
    dt.wrapV = Texture.CLAMP_ADDRESSMODE;
    dt.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE);


    // 3) Apply to a simple material and set it on the ground
    const mat = new StandardMaterial("checkerMat", scene);
    mat.diffuseTexture = dt;
    mat.specularColor = new Color3(0, 0, 0);
    ground.material = mat;

}

/**
 * create a planet from data
 * @param {Object} planetData custom data object holding relevant information to create a planet 
 * and its orbit.
 */
const createPlanet = function (planetData: any, scene: Scene) {

    planetData.mesh = MeshBuilder.CreateSphere(planetData.name, { segments: 16, diameter: planetData.diameter }, scene);

    planetData.mesh.position.x = planetData.xpos;
    planetData.mesh.position.y = planetData.ypos;
    planetData.mesh.position.z = planetData.zpos;

    // Wrap planetary map texture.

    // --- Create transparent sphere ---
    const sphereMat = new StandardMaterial("sphereMat", scene);
    sphereMat.alpha = 0.3; // make it see-through
    sphereMat.diffuseColor = new Color3(0.6, 0.8, 1);
    planetData.mesh.material = sphereMat;

    // --- Create a poster (double-sided plane inside) ---
    // get diameter from planet
    const diameter = planetData.diameter;
    console.log('Creating poster for ' + planetData.name + ' with diameter ' + diameter);
    const poster = MeshBuilder.CreatePlane("poster", { width: diameter * .7, height: diameter * .7, sideOrientation: Mesh.DOUBLESIDE }, scene);
    poster.parent = planetData.mesh;

    // Slightly offset it forward (inside the sphere)
    poster.position = new Vector3(0, 0, 0); // stays centered in local space


    // --- Apply the PNG texture ---
    const posterMat = new StandardMaterial("posterMat", scene);
    posterMat.diffuseTexture = new Texture(planetData.img, scene);
    posterMat.diffuseTexture.hasAlpha = true; // if PNG has transparency
    posterMat.backFaceCulling = false;        // show both front & back
    poster.material = posterMat;


};


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

const createScene = async function (engine: Engine, canvas: HTMLCanvasElement): Promise<{ scene: Scene, camera: ArcRotateCamera }> {
    // Create a basic BJS Scene object
    var scene = new Scene(engine);
    if (!scene) {
        throw new Error('Scene creation failed');
    }
    // Create a FreeCamera, and set its position to {x: 0, y: 5, z: -10}
    var camera = new ArcRotateCamera('camera1', 0, 1.2, 50, Vector3.Zero(), scene);
    if (!camera) {
        throw new Error('Camera creation failed');
    }
    // Target the camera to scene origin
    camera.setTarget(Vector3.Zero());
    // Attach the camera to the canvas
    camera.attachControl(canvas, false);

    // --- Smoothness tweaks ---
    camera.wheelPrecision = 100;                // 🟢 smaller = faster zoom; larger = slower
    camera.wheelDeltaPercentage = 0.01;         // 🟢 smooth zoom with percentage-based delta
    camera.inertia = 0.9;                       // 🟢 smoothing after movement (0 = immediate)
    camera.panningInertia = 0.9;                // 🟢 same for panning
    camera.lowerRadiusLimit = 2;                // optional min zoom distance
    camera.upperRadiusLimit = 100;              // optional max zoom distance

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
    const skybox = MeshBuilder.CreateBox('skybox', {
        size: 1000               // Uniform side length; you could also use width/height/depth
    }, scene);

    skybox.infiniteDistance = true;

    // skybox material.
    const skyboxMaterial = new StandardMaterial("skyBox", scene);
    skyboxMaterial.backFaceCulling = false;
    skyboxMaterial.diffuseColor = new Color3(0, 0, 0);
    skyboxMaterial.specularColor = new Color3(0, 0, 0);

    // Cubemap.
    skyboxMaterial.reflectionTexture = new CubeTexture('img/textures/skybox/skybox',
        scene, ['_px.png', '_py.png', '_pz.png', '_nx.png', '_ny.png', '_nz.png']);

    skyboxMaterial.reflectionTexture.coordinatesMode = Texture.SKYBOX_MODE;
    skybox.material = skyboxMaterial;
    

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

const createGlider = async function (scene: Scene) {
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


const resizeGame = function () {
    console.log("Resizing game canvas.");
    if (engine) {
        engine.resize();
    }
}

export { buildCanvas, setCb, disposeEngine, getParams, setParams, resizeGame, setThrusters };
