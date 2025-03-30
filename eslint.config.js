import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import shopifyEslintPlugin from '@shopify/eslint-plugin';

export default tseslint.config(
  { ignores: ['dist', '.yarn', '.pnp.*', 'vite-env.d.ts'] },
  {
    extends: [...shopifyEslintPlugin.configs.esnext, js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
)
