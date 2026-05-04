import NetInfo from '@react-native-community/netinfo'
import { useEffect } from 'react'
import { useConnectivityStore } from '@tinycld/core/lib/stores/connectivity-store'

const OFFLINE_DEBOUNCE_MS = 1500

export function useConnectivityDetector(): void {
    useEffect(() => {
        const { setOnline } = useConnectivityStore.getState()
        let offlineTimer: ReturnType<typeof setTimeout> | null = null

        const unsubscribe = NetInfo.addEventListener(state => {
            const reachable = state.isInternetReachable !== false
            const online = Boolean(state.isConnected) && reachable

            if (online) {
                if (offlineTimer) {
                    clearTimeout(offlineTimer)
                    offlineTimer = null
                }
                setOnline(true)
                return
            }

            if (offlineTimer) return
            offlineTimer = setTimeout(() => {
                setOnline(false)
                offlineTimer = null
            }, OFFLINE_DEBOUNCE_MS)
        })

        return () => {
            unsubscribe()
            if (offlineTimer) clearTimeout(offlineTimer)
        }
    }, [])
}
