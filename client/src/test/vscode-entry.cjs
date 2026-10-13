// Extension-host entry for the VS Code E2E suite.
// The host can only require JavaScript; tsx then loads the TypeScript suite.
require('tsx/cjs');
module.exports = require('./vscode-suite.ts');
