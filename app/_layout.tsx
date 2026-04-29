// polyfill-crypto MUST run before configure-core: @tanstack/db's collection
// constructor calls crypto.randomUUID() at module init, and Hermes has no
// global crypto.
import '~/lib/polyfill-crypto'
// configure-core MUST be the first import after the polyfill — it calls
// configureCore(appConfig) at module-init time so every other module in the
// static-import graph sees the registered config on its first read.
import '~/lib/configure-core'
import '~/global.css'
import { MinimalProviders } from '@tinycld/core/components/MinimalProviders'
import { initSentry } from '@tinycld/core/lib/sentry'
import {
    getResolvedAddress,
    readCached,
    resolveEnvAddress,
    setResolvedAddress,
    subscribeResolvedAddress,
} from '@tinycld/core/lib/server-address'
import { router, Slot, usePathname } from 'expo-router'
import { type ComponentType, type ReactNode, useEffect, useState } from 'react'
import { View } from 'react-native'

initSentry()

type ProvidersComponent = ComponentType<{ children: ReactNode }>

type GateState =
    | { status: 'resolving' }
    | { status: 'resolved'; Providers: ProvidersComponent }
    | { status: 'unresolved' }

function useServerAddressGate(pathname: string): GateState {
    const [state, setState] = useState<GateState>(() => {
        const env = resolveEnvAddress()
        if (env) {
            setResolvedAddress(env)
            return { status: 'resolving' }
        }
        return { status: 'resolving' }
    })

    useEffect(() => {
        let cancelled = false

        async function resolve() {
            if (!getResolvedAddress()) {
                const cached = await readCached()
                if (cached) setResolvedAddress(cached)
            }

            if (cancelled) return

            if (getResolvedAddress()) {
                const mod = await import('@tinycld/core/components/Providers')
                if (cancelled) return
                setState({ status: 'resolved', Providers: mod.Providers })
            } else {
                setState({ status: 'unresolved' })
            }
        }

        resolve()
        const unsubscribe = subscribeResolvedAddress(() => {
            if (cancelled) return
            resolve()
        })
        return () => {
            cancelled = true
            unsubscribe()
        }
    }, [])

    useEffect(() => {
        if (state.status !== 'unresolved') return
        if (pathname === '/connect') return
        const backTo = encodeURIComponent(pathname || '/')
        router.replace(`/connect?backTo=${backTo}`)
    }, [state.status, pathname])

    return state
}

export default function Layout() {
    const pathname = usePathname()
    const state = useServerAddressGate(pathname)

    if (state.status === 'resolving') {
        return (
            <MinimalProviders>
                <View className="flex-1 bg-background" />
            </MinimalProviders>
        )
    }

    if (state.status === 'unresolved') {
        if (pathname === '/connect') {
            return (
                <MinimalProviders>
                    <Slot />
                </MinimalProviders>
            )
        }
        return (
            <MinimalProviders>
                <View className="flex-1 bg-background" />
            </MinimalProviders>
        )
    }

    const { Providers } = state
    return (
        <Providers>
            <Slot />
        </Providers>
    )
}
