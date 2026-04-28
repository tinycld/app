import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { ScreenHeader } from '@tinycld/core/components/ScreenHeader'

interface Column {
    label: string
    flex?: number
    width?: number
}

interface DataTableHeaderProps {
    columns: Column[]
    trailing?: ReactNode
}

export function DataTableHeader({ columns, trailing }: DataTableHeaderProps) {
    return (
        <ScreenHeader>
            <View className="flex-row px-3 py-2">
                {columns.map((col, i) => (
                    <Text
                        key={col.label || `col-${i}`}
                        className="text-[11px] font-semibold uppercase tracking-wide text-muted"
                        style={{ flex: col.flex, width: col.width }}
                    >
                        {col.label}
                    </Text>
                ))}
                {trailing}
            </View>
        </ScreenHeader>
    )
}
