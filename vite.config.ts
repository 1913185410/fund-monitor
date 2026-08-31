import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import Components from 'unplugin-vue-components/vite'
import { ArcoResolver } from 'unplugin-vue-components/resolvers'

// https://vite.dev/config/
export default defineConfig({
  // 前端托管在腾讯云 SCF Web 函数根路径下，资源直接用根路径前缀
  base: '/',
  plugins: [
    vue(),
    // Arco 按需引入：模板中的 a-* / icon-* 自动按需加载对应组件与样式，显著减小打包体积
    Components({
      resolvers: [ArcoResolver({ resolveIcons: true })],
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
    // 开发时把 /api 转发到本地后端代理（node server/index.mjs），解决跨域并模拟真实数据源
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
})