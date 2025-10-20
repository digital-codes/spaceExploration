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


import { ref, onMounted } from "@vue/runtime-core";
import { buildCanvas, setCb } from "../scenes/scene1";

/*
const emit = defineEmits<{
  (e: 'message', msg: string, id: number): void
}>();
*/

const bjsCanvas = ref<HTMLCanvasElement | null>(null);
onMounted(async () => {
  if (bjsCanvas.value) {
    await buildCanvas(bjsCanvas.value);
  }
  setCb(rxMessage) // set callback
});

const rxMessage = (msg: string, id: number) => {
  console.log("GamePane received message:", msg, id);
};



</script>

<template>
  <canvas ref="bjsCanvas" width="500" height="500" />
</template>

<style scoped>
</style>