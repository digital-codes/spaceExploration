// import * as BABYLON from 'babylonjs';
import {
    Scene, Engine, HemisphericLight, MeshBuilder,
    Mesh, Vector3, Color3, Color4, StandardMaterial,
    Texture, CubeTexture, PointLight,
    DynamicTexture, 
    ArcRotateCamera
} from 'babylonjs';

import system from './assets/data/objects.json';
console.log(system);

const createGround = function (scene: Scene) {
    // Create a built-in "ground" shape.
    //const ground = MeshBuilder.CreateGround('ground1', { width: 6, height: 6, subdivisions: 2 }, scene);
    // 4a – Create a fairly large checkerboard ground (size 50 × 50 units)
    const ground = MeshBuilder.CreateGround(
        'checkerGround',
        { width: 50, height: 50, subdivisions: 2 },
        scene
    );

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


const buildCanvas = (elem: HTMLElement) => {
    // Get the canvas DOM element
    var canvas: HTMLCanvasElement | null = document.getElementById(elem.id) as HTMLCanvasElement;
    if (!canvas) {
        throw new Error('Canvas element not found');
    }
    // Load the 3D engine
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    // CreateScene function that creates and return the scene
    const scene = createScene(engine, canvas);

    // define the object update function, before the scene renders.

    engine.scenes[0].beforeRender = function () {
        for (const idx in system) {
            const planet = system[idx];
            // console.log(planet.name);
            if (!planet.mesh) {
                // skip planets that haven't been created yet
                continue;
            }
            // (planet.mesh as Mesh).position.y = 3;
            if (planet.orbit.angle != 0) {
                (planet.mesh as Mesh).position.x = planet.orbit.radius * Math.sin(planet.orbit.angle);
                (planet.mesh as Mesh).position.z = planet.orbit.radius * Math.cos(planet.orbit.angle);
                planet.orbit.angle += planet.orbit.speed;
            }
            //TODO: individual rotations for each Planet in this range.
            (planet.mesh as Mesh).rotate(new Vector3(0, 1, 0), 0.01);
        }
    };

    // the canvas/window resize event handler
    window.addEventListener('resize', function () {
        engine.resize();
    })


    // run the render loop
    engine.runRenderLoop(function () {
        scene.render();
    });

    return canvas;
}

const createScene = function (engine: Engine, canvas: HTMLCanvasElement): Scene {
    // Create a basic BJS Scene object
    var scene = new Scene(engine);
    // Create a FreeCamera, and set its position to {x: 0, y: 5, z: -10}
    var camera = new ArcRotateCamera('camera1', 0, 0, 10, Vector3.Zero(), scene);
    // Target the camera to scene origin
    camera.setTarget(Vector3.Zero());
    // Attach the camera to the canvas
    camera.attachControl(canvas, false);


    scene.clearColor = new Color4(0, 0, 0, 1);

    // Have the Camera orbit the sun (third value moves camera away from center).

    const galacticlight = new HemisphericLight('galacticlight', new Vector3(0, 1, 0), scene);

    galacticlight.intensity = 0.5;

    galacticlight.groundColor = new Color3(0.5, 0.5, 1.0);

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
        if (object.name === 'sun') {
            var sunLight = new PointLight('sunlight', Vector3.Zero(), scene);
            sunLight.intensity = 2.2;
        }
    });
    // Create the ground
    createGround(scene);

    return scene;
}


export default buildCanvas;
