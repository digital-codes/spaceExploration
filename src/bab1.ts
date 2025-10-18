// import * as BABYLON from 'babylonjs';
import { Scene, Engine, FreeCamera, HemisphericLight, MeshBuilder, Mesh, Vector3 } from 'babylonjs';

const buildCanvas = (elem: HTMLElement) => {
    // Get the canvas DOM element
    var canvas: HTMLCanvasElement | null = document.getElementById(elem.id) as HTMLCanvasElement;
    if (!canvas) {
        throw new Error('Canvas element not found');
    }
    // Load the 3D engine

    var engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    // CreateScene function that creates and return the scene
    // call the createScene function
    var scene = createScene(engine, canvas);

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


var createScene = function (engine: Engine, canvas: HTMLCanvasElement): Scene {
    // Create a basic BJS Scene object
    var scene = new Scene(engine);
    // Create a FreeCamera, and set its position to {x: 0, y: 5, z: -10}
    var camera = new FreeCamera('camera1', new Vector3(0, 5, -10), scene);
    // Target the camera to scene origin
    camera.setTarget(Vector3.Zero());
    // Attach the camera to the canvas
    camera.attachControl(canvas, false);
    // Create a basic light, aiming 0, 1, 0 - meaning, to the sky
    var light = new HemisphericLight('light1', new Vector3(0, 1, 0), scene);
    // Create a built-in "sphere" shape using the SphereBuilder
    var sphere = MeshBuilder.CreateSphere('sphere1', { segments: 16, diameter: 2, sideOrientation: Mesh.FRONTSIDE }, scene);
    // Move the sphere upward 1/2 of its height
    sphere.position.y = 1;
    // Create a built-in "ground" shape;
    var ground = MeshBuilder.CreateGround("ground1", { width: 6, height: 6, subdivisions: 2, updatable: false }, scene);
    // Return the created scene
    return scene;
}


export default buildCanvas;
