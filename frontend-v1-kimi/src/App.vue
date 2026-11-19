<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from './components/AppSidebar.vue'
import AppTopbar from './components/AppTopbar.vue'
import ToastStack from './components/ToastStack.vue'

const route = useRoute()
const immersiveHome = computed(() => route.path === '/')
</script>

<template>
  <div class="app-shell" :class="{ 'home-mode': immersiveHome }">
    <AppSidebar v-if="!immersiveHome" />
    <div class="app-main">
      <AppTopbar v-if="!immersiveHome" />
      <main class="page-container">
        <RouterView v-slot="{ Component }">
          <Transition name="page" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </main>
    </div>
    <ToastStack />
  </div>
</template>
