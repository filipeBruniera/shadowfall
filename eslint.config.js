import jsdoc from 'eslint-plugin-jsdoc';
import prettierConfig from 'eslint-config-prettier';

export default [
  { ignores: ['node_modules', '.vercel', 'tests/multipeer.mjs', 'tests/browser.mjs', 'coverage'] },
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        canvas: 'readonly',
        Peer: 'readonly',
        matchMedia: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        localStorage: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
        process: 'readonly',
      },
    },
    plugins: { jsdoc },
    rules: {
      ...prettierConfig.rules,
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/valid-types': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'off',
    },
  },
];
