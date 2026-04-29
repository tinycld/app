import { randomUUID } from 'expo-crypto'
import { polyfillGlobal } from 'react-native/Libraries/Utilities/PolyfillFunctions'

const existing = (globalThis as { crypto?: object }).crypto ?? {}
polyfillGlobal('crypto', () => ({ ...existing, randomUUID }))
