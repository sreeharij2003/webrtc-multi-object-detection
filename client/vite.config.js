import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: 'index.html',
        phone: 'phone.html'
      },
      output: {
        manualChunks: {
          'socket': ['socket.io-client']
        }
      }
    },
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
        drop_debugger: true
      }
    }
  },
  server: {
    port: 5173,
    host: true,
    cors: true
  },
  optimizeDeps: {
    include: [
      'socket.io-client',
      'onnxruntime-web',
      '@tensorflow/tfjs',
      '@tensorflow/tfjs-backend-wasm'
    ]
  },
  esbuild: {
    target: 'es2020',
    supported: {
      'bigint': true
    }
  },
  define: {
    global: 'globalThis'
  }
});
