import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import './style.css'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'hall', component: () => import('./views/HallView.vue') },
    { path: '/create', name: 'create', component: () => import('./views/CreateView.vue') },
    { path: '/chat/:characterId', name: 'chat', component: () => import('./views/ChatView.vue') },
    { path: '/memory/:characterId', name: 'memory', component: () => import('./views/MemoryView.vue') },
    { path: '/story/:sessionId', name: 'story', component: () => import('./views/StoryView.vue') },
    { path: '/gallery', name: 'gallery', component: () => import('./views/GalleryView.vue') },
    { path: '/catalog', name: 'catalog', component: () => import('./views/CatalogView.vue') },
    { path: '/dashboard', name: 'dashboard', component: () => import('./views/DashboardView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

createApp(App).use(createPinia()).use(router).mount('#app')
