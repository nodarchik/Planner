import js from '@eslint/js';
import globals from 'globals';

const rules = { 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }], 'no-empty': 'off' };
export default [
  js.configs.recommended,
  { files: ['src/**/*.js'], languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.browser }, rules },
  { files: ['api/**/*.js'], languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.node }, rules }
];
