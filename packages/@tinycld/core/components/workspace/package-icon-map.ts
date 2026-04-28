import {
    Building2,
    Calendar,
    CircleHelp,
    HardDrive,
    Home,
    type LucideIcon,
    Mail,
    PenLine,
    Settings,
    Table,
    User,
    Users,
} from 'lucide-react-native'

const iconMap: Record<string, LucideIcon> = {
    users: Users,
    home: Home,
    mail: Mail,
    calendar: Calendar,
    settings: Settings,
    user: User,
    building: Building2,
    'hard-drive': HardDrive,
    'pen-line': PenLine,
    table: Table,
}

export function getIcon(name: string): LucideIcon {
    return iconMap[name] ?? CircleHelp
}
