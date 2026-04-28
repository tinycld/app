import { type Control, type FieldValues, type Path, useController } from 'react-hook-form'
import { Pressable, Text, View, type ViewProps } from 'react-native'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'

export type SelectOption = {
    label: string
    value: string
}

export type SelectInputProps<T extends FieldValues = Record<string, unknown>> = {
    name: Path<T>
    control: Control<T>
    label: string
    options: SelectOption[]
    hint?: string
    horizontal?: boolean
    wrapperProps?: ViewProps
}

export function SelectInput<T extends FieldValues = Record<string, unknown>>({
    name,
    control,
    label,
    options,
    hint,
    horizontal = false,
    wrapperProps = {},
}: SelectInputProps<T>) {
    const {
        field,
        fieldState: { error },
    } = useController({ name, control })

    const primaryColor = useThemeColor('primary')
    const borderColor = useThemeColor('border')
    const primaryFgColor = useThemeColor('primary-foreground')
    const fgColor = useThemeColor('foreground')

    const hasError = !!error

    return (
        <View className="gap-1.5 mb-3" {...wrapperProps}>
            {label ? <Text className="text-sm font-semibold text-foreground">{label}</Text> : null}
            <View className={horizontal ? 'flex-row gap-2 flex-wrap' : 'flex-col gap-1'}>
                {options.map(option => {
                    const isSelected = field.value === option.value
                    return (
                        <Pressable
                            key={option.value}
                            onPress={() => field.onChange(option.value)}
                            className="border rounded-lg py-2 px-4 items-center"
                            style={{
                                borderColor: isSelected ? primaryColor : borderColor,
                                backgroundColor: isSelected ? primaryColor : 'transparent',
                                flex: horizontal ? 1 : undefined,
                                minWidth: horizontal ? 80 : undefined,
                            }}
                        >
                            <Text
                                style={{
                                    fontSize: 14,
                                    fontWeight: '500',
                                    color: isSelected ? primaryFgColor : fgColor,
                                }}
                            >
                                {option.label}
                            </Text>
                        </Pressable>
                    )
                })}
            </View>
            {hint && !hasError ? <Text className="text-xs text-muted">{hint}</Text> : null}
            {hasError ? <Text className="text-xs text-danger">{error.message}</Text> : null}
        </View>
    )
}
