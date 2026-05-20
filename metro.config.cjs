const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')
const { withUniwindConfig } = require('uniwind/metro')

const config = getDefaultConfig(__dirname)

// Workspace lives one level up; watch it so Metro bundles member source that
// resolves through node_modules/@tinycld/* symlinks.
const workspaceRoot = path.resolve(__dirname, '..')
config.watchFolders = [workspaceRoot]

// `@tinycld/app-generated/*` — package-generator output written to
// lib/generated/. A build-time contract (NOT a symlink artifact): core imports
// these by name and the app supplies the files. Metro doesn't read tsconfig
// paths, so alias here. (Phase 3 keeps a generated subset; this stays.)
const APP_GENERATED_DIR = path.join(__dirname, 'lib', 'generated')
const originalResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName.startsWith('@tinycld/app-generated/')) {
        const subpath = moduleName.slice('@tinycld/app-generated/'.length)
        return context.resolveRequest(context, path.join(APP_GENERATED_DIR, subpath), platform)
    }
    return (originalResolveRequest ?? context.resolveRequest)(context, moduleName, platform)
}

module.exports = withUniwindConfig(config, {
    cssEntryFile: './global.css',
    dtsFile: './uniwind-types.d.ts',
    extraThemes: ['dark'],
})
