import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { TabList, TabSlot, Tabs, TabTrigger } from 'expo-router/ui'
import { Pressable, Text } from 'react-native'

export default function TabsLayout() {
    const surfaceBg = useThemeColor('surface-secondary')
    const borderColor = useThemeColor('border')
    const primaryColor = useThemeColor('primary')
    const mutedColor = useThemeColor('muted-foreground')

    return (
        <Tabs className="flex-1">
            <TabSlot />
            <TabList
                className="flex-row py-2"
                style={{
                    borderTopWidth: 1,
                    backgroundColor: surfaceBg,
                    borderTopColor: borderColor,
                }}
            >
                <TabTrigger name="home" href="/tabs" asChild>
                    <CustomTab primaryColor={primaryColor} mutedColor={mutedColor}>
                        Home
                    </CustomTab>
                </TabTrigger>
                <TabTrigger name="profile" href="/tabs/profile" asChild>
                    <CustomTab primaryColor={primaryColor} mutedColor={mutedColor}>
                        Profile
                    </CustomTab>
                </TabTrigger>
                <TabTrigger name="settings" href="/tabs/settings" asChild>
                    <CustomTab primaryColor={primaryColor} mutedColor={mutedColor}>
                        Settings
                    </CustomTab>
                </TabTrigger>
            </TabList>
        </Tabs>
    )
}

interface CustomTabProps {
    children: React.ReactNode
    isFocused?: boolean
    primaryColor: string
    mutedColor: string
    [key: string]: unknown
}

function CustomTab({ children, isFocused, primaryColor, mutedColor, ...props }: CustomTabProps) {
    return (
        <Pressable
            {...props}
            className="flex-1 items-center justify-center py-3"
            style={[
                isFocused && {
                    borderBottomWidth: 2,
                    borderBottomColor: primaryColor,
                },
            ]}
        >
            <Text
                style={[
                    { fontSize: 14 },
                    { color: isFocused ? primaryColor : mutedColor },
                    isFocused && { fontWeight: '600' },
                ]}
            >
                {children}
            </Text>
        </Pressable>
    )
}
