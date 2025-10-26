import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    chunkSizeWarningLimit: 1000, // Increase warning limit to 1MB
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendor chunks to reduce main bundle size
          react: ['react', 'react-dom'],
          d3: ['d3'],
          mermaid: ['mermaid'],
          markdown: ['react-markdown', 'remark-gfm', 'rehype-highlight'],
          // Large libraries in their own chunks
          katex: ['katex'],
          cytoscape: ['cytoscape'],
        },
      },
    },
  },
});
