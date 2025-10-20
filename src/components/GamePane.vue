<script setup lang="ts">
/*
CSS triggers
If you plan to use an HTML GUI overlay over the BabylonJS canvas, pay attention to browser reflows and repaints. 
Especially animated alpha transparent divs can degrade performance. You can read more about the topic in general 
here and have this cheat-sheet always prepared: CSS Triggers.

Vue reactivity, friend or foe?
If you want to expose scene information to Vue, keep in mind, that exposing the 'wrong' objects may put Vue and 
BabylonJS in a recursive redraw loop and it will dramatically degrade performance. As a thumb of rule never make 
the BabylonJS Engine or Scene object reactive. If you suspect such behaviour, test your scene without Vue.

*/


import { ref, onMounted, onBeforeUnmount, nextTick } from "@vue/runtime-core";
import { buildCanvas, setCb, disposeEngine, getParams, setParams, resizeGame } from "../scenes/scene1";

/*
const emit = defineEmits<{
  (e: 'message', msg: string, id: number): void
}>();
*/

const gameMsg = ref<string>(""); 
const gameContainer = ref<HTMLDivElement | null>(null);
const bjsCanvas = ref<HTMLCanvasElement | null>(null);

let resizeObserver: ResizeObserver | null = null;

onMounted(async () => {
  if (bjsCanvas.value) {
    await buildCanvas(bjsCanvas.value);
  }
  setCb(rxMessage) // set callback
  const params = getParams();
  console.log("Initial scene params:", params);
  await nextTick()
  if (params.gravity === 1.0) {
    setParams("gravity", 2.0);
    console.log("Updated gravity to:", 2.0);
  }
  // Resize observer to detect CSS size changes
  resizeObserver = new ResizeObserver(() => {
    resizeGame();
  });
  resizeObserver.observe(gameContainer.value!);

});


onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  disposeEngine();
});

const rxMessage = (msg: string, id: number) => {
  console.log("GamePane received message:", msg, id);
  gameMsg.value = msg + ": " + id; // Update the game message
};



</script>

<template>
  <div>
    <h2>BabylonJS Vue3 Game Pane</h2>
    <p >{{ gameMsg }}</p>
  </div>
  <div class="gamepane-canvas">
  <canvas ref="bjsCanvas" style="width: 100%; height: 100%; display: block;"></canvas>
</div>
</template>

<style scoped>
.gamepane-canvas {
  box-sizing: border-box;
  width: 100%; 
  height: 50vh;
  border: 2px solid #ccc;
  border-radius: 8px;
  overflow: hidden;
}

</style>