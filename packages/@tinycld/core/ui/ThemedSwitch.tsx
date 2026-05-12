import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Switch, type SwitchProps } from 'react-native'

export function ThemedSwitch(props: SwitchProps) {
    const borderColor = useThemeColor('border')
    const primaryColor = useThemeColor('primary')

    return <Switch trackColor={{ false: borderColor, true: primaryColor }} {...props} />
}
