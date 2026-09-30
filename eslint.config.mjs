// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
import vueI18n from '@intlify/eslint-plugin-vue-i18n'
import prettierConfig from 'eslint-config-prettier'
import { fileURLToPath } from 'node:url'

const tsconfigRootDir = fileURLToPath(new URL('.', import.meta.url))

export default withNuxt(
  // Prettier must be last
  prettierConfig,

  // Strict TypeScript - server files
  {
    files: ['server/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir
      }
    },
    rules: {
      'no-console': 'off',
      eqeqeq: ['error', 'always'],

      // Safety
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',

      // Strict boolean / expressions
      '@typescript-eslint/strict-boolean-expressions': 'warn',
      '@typescript-eslint/restrict-plus-operands': 'error',
      '@typescript-eslint/restrict-template-expressions': 'warn',

      // Promises
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',

      // Unused / naming
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],

      // Style / consistency
      '@typescript-eslint/consistent-type-assertions': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'warn',
      '@typescript-eslint/require-array-sort-compare': 'error',
      '@typescript-eslint/no-deprecated': 'warn'
    }
  },

  // Strict TypeScript - app files
  {
    files: ['app/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir
      }
    },
    rules: {
      'no-console': 'warn',
      eqeqeq: ['error', 'always'],

      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],
      '@typescript-eslint/consistent-type-assertions': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'warn'
    }
  },

  // Strict TypeScript - app Vue components
  {
    files: ['app/**/*.vue'],
    languageOptions: {
      parserOptions: {
        projectService: {
          extraFileExtensions: ['.vue']
        },
        tsconfigRootDir
      }
    },
    rules: {
      'no-console': 'warn',
      eqeqeq: ['error', 'always'],

      // Safety
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',

      // Strict boolean / expressions
      '@typescript-eslint/strict-boolean-expressions': 'warn',
      '@typescript-eslint/restrict-plus-operands': 'error',
      '@typescript-eslint/restrict-template-expressions': 'warn',

      // Promises
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',

      // Unused / naming
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],

      // Style / consistency
      '@typescript-eslint/consistent-type-assertions': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'warn',
      '@typescript-eslint/require-array-sort-compare': 'error',
      '@typescript-eslint/no-deprecated': 'warn'
    }
  },

  // Test files
  {
    files: ['test/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir
      }
    },
    rules: {
      'import/first': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/no-floating-promises': 'off'
    }
  },

  // vue-i18n: parser setup for .vue and .json files (flat/base = no rules)
  ...vueI18n.configs.base,

  // vue-i18n: shared settings - localeDir globs i18n/locales/*.json (locale = filename)
  {
    settings: {
      'vue-i18n': {
        localeDir: './i18n/locales/*.json',
        messageSyntaxVersion: '^11.0.0'
      }
    }
  },

  // vue-i18n: every locale file must contain the same keys (en is source of truth)
  {
    files: ['i18n/locales/*.json'],
    rules: {
      '@intlify/vue-i18n/no-missing-keys-in-other-locales': 'error'
    }
  },

  // vue-i18n: t()/tc() calls must reference keys that exist in the locale files
  {
    files: ['app/**/*.vue', 'app/**/*.ts'],
    rules: {
      '@intlify/vue-i18n/no-missing-keys': 'error'
    }
  },

  // Global ignores (cli/ is a standalone project with its own eslint config)
  {
    ignores: ['dist/**', '.output/**', '.nuxt/**', 'node_modules/**', 'cli/**']
  }
)
