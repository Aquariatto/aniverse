<script setup lang="ts">
import { ref } from 'vue'

const STORAGE_KEY = 'aniverse.notice.ack.v1'
const open = ref(false)
try {
  open.value = !localStorage.getItem(STORAGE_KEY)
} catch {
  open.value = false
}

const acknowledge = () => {
  try { localStorage.setItem(STORAGE_KEY, new Date().toISOString()) } catch { /* 隐私模式下忽略 */ }
  open.value = false
}
</script>

<template>
  <Teleport to="body">
    <Transition name="notice">
      <div v-if="open" class="notice-mask" role="dialog" aria-modal="true" aria-label="使用声明">
        <div class="notice-card">
          <span class="notice-badge">NOTICE</span>
          <h2>使用声明</h2>
          <p class="notice-lead">本项目为课程作业，仅供课程学习、演示与教学交流参考，非商业产品。</p>
          <ul class="notice-list">
            <li>角色、剧情、对白与 AI 生成图像均为虚构内容，与任何真实作品或人物无关。</li>
            <li>AI 生成内容可能存在偏差或不准确之处，请勿作为事实依据引用。</li>
            <li>所有交互数据保存在本机浏览器中，清理缓存或更换设备后不再保留。</li>
            <li>生成式图像与第三方数据（AniList）版权归各自权利人所有，请勿用于商业用途。</li>
          </ul>
          <button class="btn btn-primary notice-action" type="button" @click="acknowledge">我已了解，开始体验</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.notice-mask {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(18, 14, 30, .55);
  backdrop-filter: blur(6px);
}
.notice-card {
  width: min(460px, 100%);
  max-height: 88vh;
  overflow-y: auto;
  padding: 26px 26px 22px;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 32px 80px rgba(28, 20, 48, .34);
}
.notice-badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 6px;
  background: #f1ecfd;
  color: #7b66c8;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 1.6px;
}
.notice-card h2 {
  margin-top: 12px;
  font-size: 18px;
  color: #322b42;
  letter-spacing: .2px;
}
.notice-lead {
  margin-top: 9px;
  color: #6d6579;
  font-size: 12px;
  line-height: 1.85;
}
.notice-list {
  margin: 14px 0 0;
  padding: 14px 16px;
  list-style: none;
  border: 1px solid #efeaf8;
  border-radius: 12px;
  background: #fbfafd;
}
.notice-list li {
  position: relative;
  padding-left: 13px;
  color: #7d7589;
  font-size: 11px;
  line-height: 1.9;
}
.notice-list li + li { margin-top: 6px; }
.notice-list li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #b3a2e4;
}
.notice-action {
  width: 100%;
  margin-top: 18px;
  min-height: 42px;
  font-size: 12px;
}
.notice-enter-active,
.notice-leave-active { transition: opacity .24s ease; }
.notice-enter-active .notice-card,
.notice-leave-active .notice-card { transition: transform .28s cubic-bezier(.22, 1, .36, 1); }
.notice-enter-from,
.notice-leave-to { opacity: 0; }
.notice-enter-from .notice-card,
.notice-leave-to .notice-card { transform: translateY(14px) scale(.97); }
@media (max-width: 480px) {
  .notice-mask { padding: 16px; }
  .notice-card { padding: 22px 18px 18px; border-radius: 16px; }
  .notice-card h2 { font-size: 16px; }
}
</style>
