const js = require('@eslint/js');
const security = require('eslint-plugin-security');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  security.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'security/detect-object-injection': 'off', // Mongoose dynamic queries often trigger this
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-unsafe-regex': 'warn'
    }
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    },
    rules: {
      'security/detect-non-literal-fs-filename': 'off'
    }
  },
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'dist/**'
    ]
  }
];
