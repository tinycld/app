import { packageSidebars } from '@tinycld/app-generated/package-sidebars'
import { Suspense, useCallback, useEffect } from 'react'
import { Pressable, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePackage } from '@tinycld/core/lib/packages/use-packages'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { PackageSidebarFallback } from './PackageSidebarFallback'
import { useWorkspaceLayout } from './useWorkspaceLayout'

const PANEL_WIDTH = 280
const EDGE_WIDTH = 20
const VELOCITY_THRESHOLD = 500

const SPRING_CONFIG = {
    damping: 25,
    stiffness: 200,
    mass: 0.8,
}

interface MobileDrawerProps {
    isVisible: boolean
}

export function MobileDrawer({ isVisible }: MobileDrawerProps) {
    const overlayBg = useThemeColor('overlay-backdrop')
    const sidebarBg = useThemeColor('sidebar-background')
    const insets = useSafeAreaInsets()
    const { activePkgSlug, setDrawerOpen } = useWorkspaceLayout()
    const pkg = usePackage(activePkgSlug ?? '')
    const translateX = useSharedValue(-PANEL_WIDTH)

    const openDrawer = useCallback(() => setDrawerOpen(true), [setDrawerOpen])
    const closeDrawer = useCallback(() => setDrawerOpen(false), [setDrawerOpen])

    useEffect(() => {
        translateX.value = withSpring(isVisible ? 0 : -PANEL_WIDTH, SPRING_CONFIG)
    }, [isVisible, translateX])

    const edgeGesture = Gesture.Pan()
        .activeOffsetX(10)
        .onUpdate(e => {
            translateX.value = Math.max(-PANEL_WIDTH, Math.min(0, -PANEL_WIDTH + e.translationX))
        })
        .onEnd(e => {
            const shouldOpen =
                e.velocityX > VELOCITY_THRESHOLD ||
                (e.velocityX > -VELOCITY_THRESHOLD && translateX.value > -PANEL_WIDTH / 2)
            translateX.value = withSpring(shouldOpen ? 0 : -PANEL_WIDTH, SPRING_CONFIG)
            runOnJS(shouldOpen ? openDrawer : closeDrawer)()
        })

    const closeGesture = Gesture.Pan()
        .activeOffsetX(-10)
        .onUpdate(e => {
            translateX.value = Math.max(-PANEL_WIDTH, Math.min(0, e.translationX))
        })
        .onEnd(e => {
            const shouldOpen =
                e.velocityX > VELOCITY_THRESHOLD ||
                (e.velocityX > -VELOCITY_THRESHOLD && translateX.value > -PANEL_WIDTH / 2)
            translateX.value = withSpring(shouldOpen ? 0 : -PANEL_WIDTH, SPRING_CONFIG)
            runOnJS(shouldOpen ? openDrawer : closeDrawer)()
        })

    const panelStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }))

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: (translateX.value + PANEL_WIDTH) / PANEL_WIDTH,
    }))

    const SidebarComponent = pkg ? packageSidebars[pkg.slug] : null

    return (
        <>
            {!isVisible ? (
                <GestureDetector gesture={edgeGesture}>
                    <Animated.View
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            bottom: 0,
                            width: EDGE_WIDTH,
                            zIndex: 200,
                        }}
                    />
                </GestureDetector>
            ) : null}
            <GestureDetector gesture={closeGesture}>
                <View
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: isVisible ? 200 : -1,
                    }}
                    pointerEvents={isVisible ? 'auto' : 'none'}
                >
                    <Animated.View
                        style={[
                            { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
                            backdropStyle,
                        ]}
                    >
                        <Pressable
                            className="flex-1"
                            style={{
                                backgroundColor: overlayBg,
                            }}
                            onPress={() => setDrawerOpen(false)}
                        />
                    </Animated.View>
                    <Animated.View
                        style={[
                            {
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                bottom: 0,
                                width: PANEL_WIDTH,
                                zIndex: 201,
                                backgroundColor: sidebarBg,
                                paddingTop: insets.top,
                                paddingBottom: insets.bottom,
                            },
                            panelStyle,
                        ]}
                    >
                        {SidebarComponent ? (
                            <Suspense fallback={null}>
                                <SidebarComponent isCollapsed={false} />
                            </Suspense>
                        ) : (
                            <PackageSidebarFallback
                                pkgSlug={pkg?.slug ?? ''}
                                pkgLabel={pkg?.nav?.label ?? 'Menu'}
                            />
                        )}
                    </Animated.View>
                </View>
            </GestureDetector>
        </>
    )
}
