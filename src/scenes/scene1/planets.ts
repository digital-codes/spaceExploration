import {
    Scene,  MeshBuilder, Mesh, Vector3, Color3, 
    StandardMaterial, Texture, 
} from '@babylonjs/core';


/**
 * create a planet from data
 * @param {Object} planetData custom data object holding relevant information to create a planet 
 * and its orbit.
 */
export default function createPlanet(planetData: any, scene: Scene) {

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

