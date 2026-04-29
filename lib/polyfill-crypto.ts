import { randomUUID } from 'expo-crypto'
import { polyfillGlobal } from 'react-native/Libraries/Utilities/PolyfillFunctions'

// On web, the browser already provides crypto.randomUUID. expo-crypto's web
// implementation of randomUUID delegates back to globalThis.crypto.randomUUID,
// so installing it here would make globalThis.crypto.randomUUID call itself
// recursively → "Maximum call stack size exceeded" on first use.
const existing = (globalThis as { crypto?: Partial<Crypto> }).crypto
if (!existing?.randomUUID) {
    polyfillGlobal('crypto', () => ({ ...(existing ?? {}), randomUUID }))
}
