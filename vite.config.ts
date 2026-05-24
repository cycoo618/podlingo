import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/podlingo/',
  build: {
    // lightningcss (the default CSS minifier in Vite 8) cannot parse escaped
    // bracket notation in class selectors like `.bg-\[#0d0f14\]` when they
    // appear inside compound selectors such as `[data-theme='day'] .bg-\[…\]`.
    // Disabling CSS minification is safe — CSS is tiny vs. the JS bundle.
    cssMinify: false,
  },
})
