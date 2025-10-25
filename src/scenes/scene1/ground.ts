import {
    Scene, MeshBuilder,
    StandardMaterial,
    Texture, 
    DynamicTexture, Color3,
} from '@babylonjs/core';

export default function createGround(scene: Scene) {
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
        // add a dark underside so the ground looks black from below
        const underside = MeshBuilder.CreateGround('underside', { width: 100, height: 60, subdivisions: 1 }, scene);
        // place it just below the visible textured ground to avoid z-fighting
        underside.position.y = -0.01;
        underside.receiveShadows = false;
        underside.isPickable = false;

        const undersideMat = new StandardMaterial('undersideMat', scene);
        // fully black on both sides and unaffected by scene lighting
        undersideMat.diffuseColor = new Color3(0, 0, 0);
        undersideMat.specularColor = new Color3(0, 0, 0);
        undersideMat.backFaceCulling = false;
        undersideMat.disableLighting = true;
        underside.material = undersideMat;
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
