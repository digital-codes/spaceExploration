// import * as BABYLON from 'babylonjs';
import {
    Scene, Engine, FreeCamera, HemisphericLight, MeshBuilder,
    Mesh, Vector3, Color3, Color4, StandardMaterial,
    Texture, CubeTexture, PointLight,
    ArcRotateCamera, VRDeviceOrientationFreeCamera, VRDeviceOrientationArcRotateCamera
} from 'babylonjs';



var system = {

    sun: {
        mesh: null,
        name: 'sun', emissive: true,
        map: 'sun.jpg', diameter: 4, xpos: 0,
        rotation: {
            speed: 0,
            angle: 0
        },
        orbit: {
            radius: 0,
            speed: 0,
            angle: 0
        }
    },

    mercury: {
        mesh: null, name: 'mercury', emissive: false,
        map: 'mercury.jpg', diameter: 1, xpos: 4,
        rotation: {
            speed: 0.4,
            angle: 1
        },
        orbit: {
            radius: 4,
            speed: 0.01,
            angle: 0.1
        }
    },

    venus: {
        mesh: null, name: 'venus', emmissive: false,
        map: 'venus.jpg', 'diameter': 1.5, xpos: 7,
        rotation: {
            speed: 0.0001,
            angle: 0.1
        },
        orbit: {
            radius: 7,
            speed: 0.005,
            angle: 0.1
        }
    },

    earth: {
        mesh: null, name: 'earth', emissive: false,
        map: 'earth.jpg', 'diameter': 1.55, xpos: 10,
        rotation: {
            speed: 0.1,
            angle: 0.1
        },
        orbit: {
            radius: 14,
            speed: 0.002,
            angle: 0.1
        }

    }

};


/**
 * create a planet from data
 * @param {Object} planetData custom data object holding relevant information to create a planet 
 * and its orbit.
 */
const createPlanet = function (planetData: any, scene: Scene) {

    planetData.mesh = MeshBuilder.CreateSphere(planetData.name, { segments: 16, diameter: planetData.diameter }, scene);

    planetData.mesh.position.x = planetData.xpos;

    // Wrap planetary map texture.

    var planetMaterial = new StandardMaterial(planetData.name, scene);

    var materialPath = 'img/textures/' + planetData.map;

    //console.log('materialPath:' + materialPath);

    if (planetData.emissive) {

        planetMaterial.emissiveTexture = new Texture(materialPath, scene);

        planetMaterial.diffuseColor = new Color3(0, 0, 0);

        planetMaterial.specularColor = new Color3(0, 0, 0);

    } else {

        planetMaterial.diffuseTexture = new Texture(materialPath, scene);

    }

    // Remove specular highlight.

    planetMaterial.specularColor = new Color3(0, 0, 0); //gets rid of highlight

    planetData.mesh.material = planetMaterial;

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

        for (const key of Object.keys(system) as Array<keyof typeof system>) {
            const planet = system[key];
            // console.log(planet.name);
            if (!planet.mesh) {
                // skip planets that haven't been created yet
                continue;
            }
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
    // Create a built-in "sphere" shape using the SphereBuilder
    var sphere = MeshBuilder.CreateSphere('sphere1', { segments: 16, diameter: 2, sideOrientation: Mesh.FRONTSIDE }, scene);
    // Move the sphere upward 1/2 of its height
    sphere.position.y = 1;


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

    // Create the Sun.
    createPlanet(system.sun, scene);
    var sunLight = new PointLight('sunlight', Vector3.Zero(), scene);
    sunLight.intensity = 2.2;

    // First Planet.
    createPlanet(system.mercury, scene);
    // Second Planet.
    createPlanet(system.venus, scene);
    // Third Planet.
    createPlanet(system.earth, scene);

    return scene;
}


export default buildCanvas;
