import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient } from '@tanstack/react-query'
import { type MergedSchema, packageStores } from '@tinycld/app-generated/package-collections'
import { router } from 'expo-router'
import { BasicIndex, createCollection, createReactProvider, setLogger } from 'pbtsdb'
import PocketBase, { AsyncAuthStore } from 'pocketbase'
import { Platform } from 'react-native'
import type { Orgs, UserOrg, Users } from '@tinycld/core/types/pbSchema'
import { PB_SERVER_ADDR } from './config'
import { clearCached, resolveEnvAddress } from './server-address'
import type { UserSession } from './types'

export { eq } from '@tanstack/db'

if (Platform.OS !== 'web') {
    // Only polyfill EventSource on native — the browser has its own
    import('react-native-sse').then(mod => {
        global.EventSource = mod.default as unknown as typeof global.EventSource
    })
}

export { PB_SERVER_ADDR }

// Defer AsyncStorage access to avoid calling the native module during module evaluation,
// which crashes on React Native before the bridge is ready (AsyncStorage v3+)
const initialAuthPromise =
    typeof window !== 'undefined'
        ? new Promise<string | null>(resolve => {
              setTimeout(() => resolve(AsyncStorage.getItem('pb_auth')), 0)
          })
        : Promise.resolve(null)

const store = new AsyncAuthStore({
    save: async serialized => AsyncStorage.setItem('pb_auth', serialized),
    initial: initialAuthPromise,
    clear: async () => await AsyncStorage.removeItem('pb_auth'),
})

export const authStoreReady = initialAuthPromise.then(async storedAuth => {
    if (storedAuth) {
        let attempts = 0
        while (!store.token && attempts < 10) {
            await new Promise(resolve => setTimeout(resolve, 10))
            attempts++
        }
    }
})

export const pb = new PocketBase(PB_SERVER_ADDR, store)

pb.autoCancellation(false)

const RECOVERY_WINDOW_MS = 10_000
const RECOVERY_THRESHOLD = 2
const sessionStart = Date.now()
let networkFailures = 0

function isNetworkLevelFailure(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false
    const e = err as { status?: number; isAbort?: boolean; originalError?: unknown }
    if (e.isAbort) return false
    if (typeof e.status === 'number' && e.status > 0) return false
    return true
}

const origSend = pb.send.bind(pb)
pb.send = (async <T>(path: string, options: Parameters<typeof origSend>[1]) => {
    try {
        return (await origSend(path, options)) as T
    } catch (err) {
        if (resolveEnvAddress()) throw err
        if (Date.now() - sessionStart > RECOVERY_WINDOW_MS) throw err
        if (!isNetworkLevelFailure(err)) throw err
        networkFailures++
        if (networkFailures >= RECOVERY_THRESHOLD) {
            await clearCached()
            router.replace('/connect?backTo=/')
        }
        throw err
    }
}) as typeof pb.send

export function usePocketBase() {
    return pb
}

setLogger({
    debug: () => {},
    info: (_msg, context) => {
        if (context) {
        } else {
        }
    },
    warn: (_msg, context) => {
        if (context) {
        } else {
        }
    },
    error: (_msg, context) => {
        if (context) {
        } else {
        }
    },
})

const queryClient = new QueryClient()

const newCollection = createCollection<MergedSchema>(pb, queryClient)

const indexing = {
    collectionOptions: {
        autoIndex: 'eager' as const,
        defaultIndexType: BasicIndex,
    },
}

const users = newCollection('users', {
    omitOnInsert: ['created', 'updated', 'password', 'tokenKey'],
    ...indexing,
})

const orgs = newCollection('orgs', {
    omitOnInsert: ['created', 'updated'],
    ...indexing,
})

const user_org = newCollection('user_org', {
    omitOnInsert: ['created', 'updated'],
    expand: {
        user: users,
        org: orgs,
    },
    ...indexing,
})

const settings = newCollection('settings', {
    omitOnInsert: ['created', 'updated'],
    expand: { org: orgs },
    ...indexing,
})

const user_preferences = newCollection('user_preferences', {
    omitOnInsert: ['created', 'updated'],
    expand: { user: users },
    ...indexing,
})

const labels = newCollection('labels', {
    omitOnInsert: ['created', 'updated'],
    expand: { org: orgs, user_org },
    ...indexing,
})

const label_assignments = newCollection('label_assignments', {
    omitOnInsert: ['created', 'updated'],
    expand: { label: labels, user_org },
    ...indexing,
})

const org_pkg_access = newCollection('org_pkg_access', {
    omitOnInsert: ['created', 'updated'],
    expand: { user_org },
    ...indexing,
})

const pkg_registry = newCollection('pkg_registry', {
    omitOnInsert: ['created', 'updated'],
    ...indexing,
})

const org_pkg_enabled = newCollection('org_pkg_enabled', {
    omitOnInsert: ['created', 'updated'],
    expand: { org: orgs },
    ...indexing,
})

const audit_logs = newCollection('audit_logs', {
    omitOnInsert: ['created', 'updated'],
    expand: { actor: users },
    ...indexing,
})

const pkg_install_log = newCollection('pkg_install_log', {
    omitOnInsert: ['created', 'updated'],
    expand: { initiated_by: users },
    ...indexing,
})

const notifications = newCollection('notifications', {
    omitOnInsert: ['created', 'updated'],
    expand: { user: users, org: orgs },
    ...indexing,
})
export const notificationsCollection = notifications

const coreStores = {
    users,
    orgs,
    user_org,
    settings,
    user_preferences,
    labels,
    label_assignments,
    org_pkg_access,
    pkg_registry,
    org_pkg_enabled,
    audit_logs,
    pkg_install_log,
    notifications,
}
export type CoreStores = typeof coreStores

const stores = {
    ...coreStores,
    ...packageStores(newCollection, coreStores),
}

const { Provider: PBTSDBProvider, useStore } = createReactProvider(stores)

export function getUserFromAuthStore(primaryOrgSlug?: string | null): UserSession | null {
    const authRecord = pb.authStore.record as Users | null
    const authToken = pb.authStore.token

    if (!authRecord || !authToken || !pb.authStore.isValid) {
        return null
    }

    return {
        id: authRecord.id,
        name: authRecord.name,
        email: authRecord.email,
        primaryOrgSlug: primaryOrgSlug ?? undefined,
    }
}

export async function seedUserOrg(userRecord: Users, orgRecord: Orgs, userOrgRecord: UserOrg) {
    await Promise.all([stores.users.preload(), stores.orgs.preload(), stores.user_org.preload()])
    stores.users.utils?.writeUpsert(userRecord)
    stores.orgs.utils?.writeUpsert(orgRecord)
    stores.user_org.utils?.writeUpsert(userOrgRecord)
}

export async function preloadStores() {
    await Promise.all([
        stores.orgs.preload(),
        stores.user_org.preload(),
        stores.org_pkg_access.preload(),
        stores.pkg_registry.preload(),
        stores.org_pkg_enabled.preload(),
    ])
}

export async function fetchAndSeedUserOrg() {
    await Promise.all([stores.users.preload(), stores.orgs.preload(), stores.user_org.preload()])
    const userOrgs = await pb.collection('user_org').getFullList<UserOrg>()
    for (const userOrgRecord of userOrgs) {
        stores.user_org.utils?.writeUpsert(userOrgRecord)
    }
}

export async function clearStores() {
    for (const s of Object.values(stores)) {
        await s.cleanup()
    }
}

export { PBTSDBProvider, queryClient, stores, useStore }
