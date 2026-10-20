// Learn more: https://docs.expo.dev/guides/customizing-metro/
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const coreRoot = path.resolve(projectRoot, '../../packages/core');
const coreEntry = path.join(coreRoot, 'src/index.ts');

const config = getDefaultConfig(projectRoot);

// The shared core is consumed from source without a symlinked workspace, so the
// repo works on machines where symlinks and junctions are blocked.
config.watchFolders = [...(config.watchFolders ?? []), coreRoot];

const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@inkypos/core') {
    return { type: 'sourceFile', filePath: coreEntry };
  }
  // Bare imports made from inside the core (e.g. "zod") resolve against the
  // app's node_modules so the bundle carries one copy of each dependency.
  if (context.originModulePath.startsWith(coreRoot) && !moduleName.startsWith('.')) {
    const fromApp = { ...context, originModulePath: path.join(projectRoot, 'package.json') };
    return (defaultResolve ?? context.resolveRequest)(fromApp, moduleName, platform);
  }
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
