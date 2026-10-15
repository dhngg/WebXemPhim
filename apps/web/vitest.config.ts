import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Kế thừa alias `@` và cấu hình test từ vite.config.ts; chỉ bổ sung các tùy chọn riêng của vitest.
export default defineConfig((env) =>
  mergeConfig(
    viteConfig(env),
    defineConfig({ test: { restoreMocks: true, clearMocks: true } }),
  ),
);
