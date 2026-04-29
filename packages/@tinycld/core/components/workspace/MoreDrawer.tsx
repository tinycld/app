import { useRouter } from 'expo-router'
import { Bell, LogOut, Settings, User, X } from 'lucide-react-native'
import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { OrgLogo } from '@tinycld/core/components/OrgLogo'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated'
import { useAuth } from '@tinycld/core/lib/auth'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { navigateToOrg } from '@tinycld/core/lib/org-url'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { useOrgSlug } from '@tinycld/core/lib/use-org-slug'
import { useSortedPackages } from '@tinycld/core/lib/use-sorted-packages'
import { MAX_VISIBLE_TABS } from './MobileTabBar'
import { getIcon } from './package-icon-map'
import { useUserOrgs } from './useUserOrgs'
import { useWorkspaceLayout } from './useWorkspaceLayout'

const SPRING_CONFIG = {
    damping: 28,
    stiffness: 220,
    mass: 0.8,
}

export function MoreDrawer() {
    const { isMoreOpen, setMoreOpen, activePkgSlug, setNotificationsOpen } = useWorkspaceLayout()
    const railBg = useThemeColor('rail-background')
    const railText = useThemeColor('rail-text')
    const railActive = useThemeColor('rail-active-text')
    const borderColor = useThemeColor('border')
    const overlayBg = useThemeColor('overlay-backdrop')
    const router = useRouter()
    const orgHref = useOrgHref()
    const orgSlug = useOrgSlug()
    const { user, logout } = useAuth()
    const orgs = useUserOrgs()
    const sorted = useSortedPackages()
    const textColor = railText
    const activeColor = railActive

    const overflowPkgs = sorted.length > MAX_VISIBLE_TABS ? sorted.slice(MAX_VISIBLE_TABS) : []

    const drawerHeight = useSharedValue(600)
    const translateY = useSharedValue(600)
    const backdropOpacity = useSharedValue(0)
    const [mounted, setMounted] = useState(false)

    const close = useCallback(() => setMoreOpen(false), [setMoreOpen])

    useEffect(() => {
        if (isMoreOpen) {
            setMounted(true)
            translateY.value = withSpring(0, SPRING_CONFIG)
            backdropOpacity.value = withTiming(1, { duration: 200 })
        } else if (mounted) {
            translateY.value = withSpring(drawerHeight.value, SPRING_CONFIG)
            backdropOpacity.value = withTiming(0, { duration: 150 })
            const timeout = setTimeout(() => setMounted(false), 300)
            return () => clearTimeout(timeout)
        }
    }, [isMoreOpen, translateY, backdropOpacity, mounted, drawerHeight])

    const panGesture = Gesture.Pan()
        .activeOffsetY(10)
        .onUpdate(e => {
            translateY.value = Math.max(0, e.translationY)
        })
        .onEnd(e => {
            if (e.translationY > 100 || e.velocityY > 500) {
                translateY.value = withSpring(drawerHeight.value, SPRING_CONFIG)
                backdropOpacity.value = withTiming(0, { duration: 150 })
                runOnJS(close)()
            } else {
                translateY.value = withSpring(0, SPRING_CONFIG)
            }
        })

    const drawerStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }))

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: backdropOpacity.value,
    }))

    if (!mounted) return null

    const handleNav = (action: () => void) => {
        action()
        close()
    }

    return (
        <View style={styles.container} pointerEvents={isMoreOpen ? 'auto' : 'none'}>
            <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
                <Pressable
                    style={[StyleSheet.absoluteFill, { backgroundColor: overlayBg }]}
                    onPress={close}
                />
            </Animated.View>

            <GestureDetector gesture={panGesture}>
                <Animated.View
                    onLayout={e => {
                        drawerHeight.value = e.nativeEvent.layout.height
                    }}
                    style={[styles.drawer, { backgroundColor: railBg }, drawerStyle]}
                >
                    <View style={styles.handleBar}>
                        <View style={[styles.handle, { backgroundColor: borderColor }]} />
                    </View>

                    <View style={styles.drawerHeader}>
                        <View style={styles.drawerHeaderLeft}>
                            <View
                                style={[
                                    styles.avatar,
                                    { backgroundColor: 'rgba(255,255,255,0.15)' },
                                ]}
                            >
                                <User size={18} color={activeColor} />
                            </View>
                            <Text style={[styles.userName, { color: activeColor }]}>
                                {user.name}
                            </Text>
                        </View>
                        <Pressable onPress={close} hitSlop={12}>
                            <X size={20} color={textColor} />
                        </Pressable>
                    </View>

                    <View style={styles.drawerContent}>
                        <Pressable
                            style={styles.drawerItem}
                            onPress={() => {
                                close()
                                setNotificationsOpen(true)
                            }}
                        >
                            <Bell size={20} color={textColor} />
                            <Text style={[styles.drawerItemLabel, { color: textColor }]}>
                                Notifications
                            </Text>
                        </Pressable>

                        <Pressable
                            style={styles.drawerItem}
                            onPress={() =>
                                handleNav(() => router.push(orgHref('settings/personal')))
                            }
                        >
                            <Settings size={20} color={textColor} />
                            <Text style={[styles.drawerItemLabel, { color: textColor }]}>
                                Settings
                            </Text>
                        </Pressable>

                        {orgs.length > 1 ? (
                            <>
                                <View
                                    style={[styles.separator, { backgroundColor: borderColor }]}
                                />
                                <Text style={[styles.sectionLabel, { color: textColor }]}>
                                    Organizations
                                </Text>
                                {orgs.map(org => {
                                    const isActive = org.slug === orgSlug
                                    const color = isActive ? activeColor : textColor
                                    return (
                                        <Pressable
                                            key={org.id}
                                            style={styles.drawerItem}
                                            onPress={() => handleNav(() => navigateToOrg(org.slug))}
                                        >
                                            <OrgLogo org={org} size={20} />
                                            <Text style={[styles.drawerItemLabel, { color }]}>
                                                {org.name}
                                            </Text>
                                        </Pressable>
                                    )
                                })}
                            </>
                        ) : null}

                        <View style={[styles.separator, { backgroundColor: borderColor }]} />

                        <Pressable style={styles.drawerItem} onPress={() => handleNav(logout)}>
                            <LogOut size={20} color={textColor} />
                            <Text style={[styles.drawerItemLabel, { color: textColor }]}>
                                Sign out
                            </Text>
                        </Pressable>

                        {overflowPkgs.length > 0 ? (
                            <>
                                <View
                                    style={[styles.separator, { backgroundColor: borderColor }]}
                                />
                                {overflowPkgs.map(pkg => {
                                    const Icon = getIcon(pkg.nav?.icon ?? '')
                                    const isActive = activePkgSlug === pkg.slug
                                    const color = isActive ? activeColor : textColor
                                    return (
                                        <Pressable
                                            key={pkg.slug}
                                            style={styles.drawerItem}
                                            onPress={() =>
                                                handleNav(() =>
                                                    router.push(`/a/${orgSlug}/${pkg.slug}`)
                                                )
                                            }
                                        >
                                            <Icon size={20} color={color} />
                                            <Text style={[styles.drawerItemLabel, { color }]}>
                                                {pkg.nav?.label}
                                            </Text>
                                        </Pressable>
                                    )
                                })}
                            </>
                        ) : null}
                    </View>
                </Animated.View>
            </GestureDetector>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 5,
    },
    drawer: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
    },
    handleBar: {
        alignItems: 'center',
        paddingVertical: 10,
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
    },
    drawerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingBottom: 12,
    },
    drawerHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    avatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    userName: {
        fontSize: 17,
        fontWeight: '600',
    },
    drawerContent: {
        paddingHorizontal: 8,
        paddingBottom: 16,
    },
    separator: {
        height: StyleSheet.hairlineWidth,
        marginVertical: 8,
        marginHorizontal: 12,
    },
    sectionLabel: {
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        opacity: 0.5,
        paddingHorizontal: 16,
        paddingTop: 4,
        paddingBottom: 8,
    },
    drawerItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 10,
    },
    drawerItemLabel: {
        fontSize: 16,
        fontWeight: '500',
    },
})
