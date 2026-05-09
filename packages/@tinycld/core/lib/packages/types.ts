export interface PackageManifest {
    name: string
    slug: string
    version: string
    description: string

    routes?: {
        directory: string
    }

    publicRoutes?: {
        directory: string
    }

    nav?: {
        label: string
        icon: string
        order?: number
        /**
         * Single character that registers a `t <letter>` jump to this
         * package's root screen. Must be unique across installed packages
         * (validated at generation time).
         */
        shortcut?: string
    }

    migrations?: {
        directory: string
    }

    hooks?: {
        directory: string
    }

    collections?: {
        register: string
        types: string
    }

    sidebar?: {
        component: string
    }

    hideSidebar?: boolean

    settings?: {
        slug: string
        component: string
        label: string
    }[]

    seed?: {
        script: string
    }

    tests?: {
        directory: string
    }

    server?: {
        package: string
        module: string
    }

    dependencies?: string[]
}
