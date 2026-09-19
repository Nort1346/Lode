// @ts-check
import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default defineConfig(
  { ignores: ['dist', 'node_modules', 'eslint.config.mjs'] },
  {
    files: [tseslint.globs.ts],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname
      },
      globals: {
        ...globals.node
      }
    },
    rules: {
      'no-console': 'off',
      eqeqeq: ['error', 'always'],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'as' }],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  }
)
