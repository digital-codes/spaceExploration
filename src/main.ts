import './style.css'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<canvas id="renderCanvasContainer" style="width: 800px; height: 600px; border: 1px solid black;"></canvas>
<div>
    <p class="read-the-docs">
      Click on the Vite and TypeScript logos to learn more
    </p>
  </div>
`;

import buildCanvas from './bab3';

buildCanvas(document.getElementById('renderCanvasContainer')!); 

