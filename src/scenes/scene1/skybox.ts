import {
    Scene, MeshBuilder, Color3, 
    StandardMaterial, Texture, CubeTexture,
} from '@babylonjs/core';


export default function createSkybox(scene: Scene) {
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
    
}
