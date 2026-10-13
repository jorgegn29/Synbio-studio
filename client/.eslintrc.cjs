module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    warnOnUnsupportedTypeScriptVersion: false,
  },
  env: {
    es2020: true,
    node: true,
    mocha: true,
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended'],
  ignorePatterns: ['dist/', 'coverage/', 'out/'],
  rules: {
    'no-console': 'off',
    'no-undef': 'off',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
  },
};