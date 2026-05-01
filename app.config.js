// Dynamic Expo config that overlays app.json with values that need to be
// computed at build time. The only thing we use this for today is
// experiments.baseUrl, which expo-cli reads from `exp.experiments.baseUrl`
// (not from any env var) and bakes into every asset URL during
// `expo export`. Setting it here lets the Dockerfile pass /v/<RELEASE_ID>
// via EXPO_BASE_URL.
module.exports = ({ config }) => {
    const baseUrl = process.env.EXPO_BASE_URL
    if (baseUrl) {
        config.experiments = { ...(config.experiments || {}), baseUrl }
    }
    return config
}
