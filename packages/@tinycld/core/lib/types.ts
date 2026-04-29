export interface UserSession {
    id: string
    name: string
    email: string
    primaryOrgSlug?: string
    /** True for sandboxed demo accounts. Outbound side effects (mail send,
     *  invite email, share email, expo push) are suppressed server-side. The
     *  UI uses this flag to show a persistent "Demo mode" banner. */
    isDemo: boolean
}
