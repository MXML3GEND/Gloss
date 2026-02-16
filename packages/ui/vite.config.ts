import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5178,
    proxy: {
      "/api": "http://localhost:5179",
    },
  },
});