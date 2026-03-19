const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch all files in the monorepo
config.watchFolders = [workspaceRoot];

// Resolve packages from both local and root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Fix pnpm symlink resolution — use symlinked paths instead of real .pnpm paths
// This prevents Metro from generating broken ../../node_modules/.pnpm/... URLs
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
