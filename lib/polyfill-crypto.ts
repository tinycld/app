import { randomUUID } from 'expo-crypto'

type CryptoLike = { randomUUID?: () => string }
const g = globalThis as unknown as { crypto?: CryptoLike }
const c: CryptoLike = g.crypto ?? {}
if (!c.randomUUID) c.randomUUID = randomUUID
g.crypto = c
