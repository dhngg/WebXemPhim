import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'playwright-report', 'test-results'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      // Cần khi lint cả monorepo từ thư mục gốc (nhiều tsconfig ứng viên).
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Chỉ ảnh hưởng HMR khi dev; tắt để `npm run lint` gốc (--max-warnings=0) không fail vì cấu trúc file hiện có.
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
