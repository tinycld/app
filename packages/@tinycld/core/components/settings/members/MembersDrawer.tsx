import { Check, Mail, Send, Trash2, UserPlus, X } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import { useAuth } from '@tinycld/core/lib/auth'
import { handleMutationErrorsWithForm } from '@tinycld/core/lib/errors'
import { mutation, useMutation } from '@tinycld/core/lib/mutations'
import { pb, useStore } from '@tinycld/core/lib/pocketbase'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { useOrgInfo } from '@tinycld/core/lib/use-org-info'
import {
    Drawer,
    DrawerBackdrop,
    DrawerBody,
    DrawerCloseButton,
    DrawerContent,
    DrawerFooter,
    DrawerHeader,
} from '@tinycld/core/ui/drawer'
import {
    Controller,
    FormErrorSummary,
    TextInput,
    useForm,
    z,
    zodResolver,
} from '@tinycld/core/ui/form'
import { MemberAvatar } from './MemberAvatar'
import { PendingBadge, RoleBadge, YouBadge } from './MemberBadges'
import { PackageAccessPanel } from './PackageAccessPanel'
import {
    type DrawerMode,
    type MemberRow,
    type OrgRole,
    ROLE_DESCRIPTIONS,
    ROLE_LABELS,
    ROLE_ORDER,
    ROLE_SWATCH,
} from './types'

interface Props {
    mode: DrawerMode
    onClose: () => void
    members: MemberRow[]
    isCurrentUserOwner: boolean
}

export function MembersDrawer({ mode, onClose, members, isCurrentUserOwner }: Props) {
    const isOpen = mode.kind !== 'closed'
    const selectedMember =
        mode.kind === 'view' ? (members.find(m => m.userOrgId === mode.userOrgId) ?? null) : null

    return (
        <Drawer isOpen={isOpen} onClose={onClose} anchor="right" size="md">
            <DrawerBackdrop />
            <DrawerContent>
                {mode.kind === 'invite' && <InviteView onDone={onClose} />}
                {mode.kind === 'view' && selectedMember && (
                    <ViewMember
                        member={selectedMember}
                        members={members}
                        isCurrentUserOwner={isCurrentUserOwner}
                        onClose={onClose}
                    />
                )}
            </DrawerContent>
        </Drawer>
    )
}

function ViewMember({
    member,
    members,
    isCurrentUserOwner,
    onClose,
}: {
    member: MemberRow
    members: MemberRow[]
    isCurrentUserOwner: boolean
    onClose: () => void
}) {
    const { user } = useAuth()
    const { orgId } = useOrgInfo()
    const [userOrgCollection] = useStore('user_org')

    const fgColor = useThemeColor('foreground')
    const mutedColor = useThemeColor('muted-foreground')
    const borderColor = useThemeColor('border')
    const surfaceBg = useThemeColor('surface-secondary')

    const isSelf = member.userId === user.id
    const ownerCount = members.filter(m => m.role === 'owner').length
    const isLastOwner = member.role === 'owner' && ownerCount <= 1
    const canRemove = !isSelf && !isLastOwner
    const canChangeRole = !isSelf && (isCurrentUserOwner || member.role !== 'owner')
    const showPackageAccess = member.role === 'member' || member.role === 'guest'

    const availableRoles: OrgRole[] = isCurrentUserOwner
        ? ROLE_ORDER
        : ROLE_ORDER.filter(r => r !== 'owner')

    const updateRole = useMutation({
        mutationFn: mutation(function* ({ role }: { role: OrgRole }) {
            yield userOrgCollection.update(member.userOrgId, draft => {
                draft.role = role
            })
        }),
    })

    const removeMember = useMutation({
        mutationFn: mutation(function* () {
            yield userOrgCollection.delete(member.userOrgId)
        }),
        onSuccess: onClose,
    })

    const resendInvite = useMutation({
        mutationFn: async () => {
            return pb.send('/api/invite-member', {
                method: 'POST',
                body: JSON.stringify({ email: member.email, role: member.role, orgId }),
                headers: { 'Content-Type': 'application/json' },
            })
        },
    })

    const displayName = member.name || member.email.split('@')[0] || member.email

    return (
        <>
            <DrawerHeader>
                <View className="flex-row items-start gap-3 flex-1">
                    <MemberAvatar
                        name={member.name}
                        email={member.email}
                        size={44}
                        dimmed={member.isPending}
                    />
                    <View className="flex-1" style={{ minWidth: 0 }}>
                        <View className="flex-row items-center gap-2" style={{ flexWrap: 'wrap' }}>
                            <Text
                                style={{ fontSize: 16, fontWeight: '700', color: fgColor }}
                                numberOfLines={1}
                            >
                                {displayName}
                            </Text>
                            {isSelf && <YouBadge />}
                        </View>
                        <Text
                            style={{ fontSize: 12.5, color: mutedColor, marginTop: 1 }}
                            numberOfLines={1}
                        >
                            {member.email}
                        </Text>
                    </View>
                </View>
                <DrawerCloseButton onPress={onClose}>
                    <X size={18} color={mutedColor} />
                </DrawerCloseButton>
            </DrawerHeader>

            <View
                className="flex-row items-center gap-2 flex-wrap"
                style={{ paddingHorizontal: 4, paddingBottom: 10 }}
            >
                <RoleBadge role={member.role} />
                {member.isPending && <PendingBadge />}
            </View>

            <DrawerBody>
                <View className="gap-5">
                    {member.isPending && (
                        <View
                            className="flex-row items-start gap-2.5 rounded-xl p-3"
                            style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
                        >
                            <Mail size={16} color={mutedColor} style={{ marginTop: 2 }} />
                            <View className="flex-1 gap-2">
                                <Text style={{ fontSize: 12.5, color: fgColor, lineHeight: 18 }}>
                                    This invite hasn’t been accepted yet. They’ll appear fully once
                                    they verify their email.
                                </Text>
                                <Pressable
                                    onPress={() => resendInvite.mutate()}
                                    disabled={resendInvite.isPending}
                                    className="flex-row items-center gap-1.5 self-start rounded-md"
                                    style={{
                                        paddingVertical: 5,
                                        paddingHorizontal: 10,
                                        borderWidth: 1,
                                        borderColor,
                                        opacity: resendInvite.isPending ? 0.5 : 1,
                                    }}
                                >
                                    <Send size={11} color={fgColor} />
                                    <Text
                                        style={{ fontSize: 12, fontWeight: '600', color: fgColor }}
                                    >
                                        {resendInvite.isPending
                                            ? 'Sending…'
                                            : resendInvite.isSuccess
                                              ? 'Resent ✓'
                                              : 'Resend invite'}
                                    </Text>
                                </Pressable>
                            </View>
                        </View>
                    )}

                    <RolePicker
                        currentRole={member.role}
                        availableRoles={availableRoles}
                        disabled={!canChangeRole}
                        isLastOwner={isLastOwner}
                        isSelf={isSelf}
                        onChange={role => updateRole.mutate({ role })}
                    />

                    {showPackageAccess && <PackageAccessPanel userOrgId={member.userOrgId} />}
                </View>
            </DrawerBody>

            {canRemove && (
                <DrawerFooter>
                    <RemoveSection
                        name={displayName}
                        onRemove={() => removeMember.mutate()}
                        isPending={removeMember.isPending}
                    />
                </DrawerFooter>
            )}
        </>
    )
}

function RolePicker({
    currentRole,
    availableRoles,
    disabled,
    isLastOwner,
    isSelf,
    onChange,
}: {
    currentRole: OrgRole
    availableRoles: OrgRole[]
    disabled: boolean
    isLastOwner: boolean
    isSelf: boolean
    onChange: (role: OrgRole) => void
}) {
    const mutedColor = useThemeColor('muted-foreground')
    const fgColor = useThemeColor('foreground')
    const borderColor = useThemeColor('border')

    const helperText = isSelf
        ? 'You can’t change your own role. Ask another owner.'
        : isLastOwner
          ? 'This is the last owner. Promote someone else first to change their role.'
          : null

    return (
        <View className="gap-2.5">
            <View className="gap-0.5">
                <Text
                    style={{
                        fontSize: 11,
                        fontWeight: '700',
                        color: mutedColor,
                        textTransform: 'uppercase',
                        letterSpacing: 0.8,
                    }}
                >
                    Role
                </Text>
                <Text style={{ fontSize: 12, color: mutedColor, lineHeight: 16 }}>
                    {ROLE_DESCRIPTIONS[currentRole]}
                </Text>
            </View>

            <View className="gap-1.5">
                {availableRoles.map(role => {
                    const swatch = ROLE_SWATCH[role]
                    const isActive = role === currentRole
                    const optionDisabled = disabled && !isActive
                    return (
                        <Pressable
                            key={role}
                            disabled={optionDisabled || isActive}
                            onPress={() => onChange(role)}
                            className="flex-row items-center gap-3 rounded-xl p-3"
                            style={{
                                borderWidth: 1.5,
                                borderColor: isActive ? swatch.ring : borderColor,
                                backgroundColor: isActive ? swatch.bg : 'transparent',
                                opacity: optionDisabled ? 0.45 : 1,
                            }}
                        >
                            <View
                                className="items-center justify-center"
                                style={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: 11,
                                    borderWidth: 2,
                                    borderColor: isActive ? swatch.fg : borderColor,
                                    backgroundColor: isActive ? swatch.fg : 'transparent',
                                }}
                            >
                                {isActive && <Check size={12} color="#fff" strokeWidth={3} />}
                            </View>
                            <View className="flex-1">
                                <Text
                                    style={{
                                        fontSize: 13.5,
                                        fontWeight: '700',
                                        color: isActive ? swatch.fg : fgColor,
                                    }}
                                >
                                    {ROLE_LABELS[role]}
                                </Text>
                                <Text
                                    style={{
                                        fontSize: 11.5,
                                        color: mutedColor,
                                        marginTop: 1,
                                        lineHeight: 15,
                                    }}
                                    numberOfLines={2}
                                >
                                    {ROLE_DESCRIPTIONS[role]}
                                </Text>
                            </View>
                        </Pressable>
                    )
                })}
            </View>

            {helperText && (
                <Text style={{ fontSize: 11.5, color: mutedColor, fontStyle: 'italic' }}>
                    {helperText}
                </Text>
            )}
        </View>
    )
}

function RemoveSection({
    name,
    onRemove,
    isPending,
}: {
    name: string
    onRemove: () => void
    isPending: boolean
}) {
    const fgColor = useThemeColor('foreground')
    const mutedColor = useThemeColor('muted-foreground')
    const dangerColor = useThemeColor('danger')

    return (
        <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1">
                <Text style={{ fontSize: 12.5, color: fgColor, fontWeight: '600' }}>
                    Remove {name}
                </Text>
                <Text style={{ fontSize: 11.5, color: mutedColor, marginTop: 1 }}>
                    They’ll lose all access immediately. You can re-invite later.
                </Text>
            </View>
            <Pressable
                onPress={onRemove}
                disabled={isPending}
                className="flex-row items-center gap-1.5 rounded-md"
                style={{
                    paddingVertical: 7,
                    paddingHorizontal: 11,
                    borderWidth: 1,
                    borderColor: `${dangerColor}66`,
                    opacity: isPending ? 0.5 : 1,
                }}
            >
                <Trash2 size={12} color={dangerColor} />
                <Text style={{ color: dangerColor, fontSize: 12, fontWeight: '700' }}>
                    {isPending ? 'Removing…' : 'Remove'}
                </Text>
            </Pressable>
        </View>
    )
}

const inviteSchema = z.object({
    email: z.string().email('Enter a valid email address'),
    role: z.enum(['admin', 'member', 'guest']),
})

type InviteFormValues = z.infer<typeof inviteSchema>

function InviteView({ onDone }: { onDone: () => void }) {
    const { orgId } = useOrgInfo()
    const fgColor = useThemeColor('foreground')
    const mutedColor = useThemeColor('muted-foreground')
    const primaryColor = useThemeColor('primary')
    const primaryFgColor = useThemeColor('primary-foreground')
    const borderColor = useThemeColor('border')

    const {
        control,
        handleSubmit,
        reset,
        setError,
        getValues,
        formState: { errors, isSubmitted, isValid },
    } = useForm<InviteFormValues>({
        mode: 'onChange',
        resolver: zodResolver(inviteSchema),
        defaultValues: { email: '', role: 'member' },
    })

    const invite = useMutation({
        mutationFn: async (data: InviteFormValues) => {
            return pb.send('/api/invite-member', {
                method: 'POST',
                body: JSON.stringify({ email: data.email, role: data.role, orgId }),
                headers: { 'Content-Type': 'application/json' },
            })
        },
        onSuccess: () => {
            reset()
            onDone()
        },
        onError: handleMutationErrorsWithForm({ setError, getValues }),
    })

    const onSubmit = handleSubmit(data => invite.mutate(data))
    const inviteRoles: OrgRole[] = ['admin', 'member', 'guest']

    return (
        <>
            <DrawerHeader>
                <View className="flex-row items-start gap-3 flex-1">
                    <View
                        className="items-center justify-center rounded-xl"
                        style={{
                            width: 44,
                            height: 44,
                            backgroundColor: `${primaryColor}1F`,
                        }}
                    >
                        <UserPlus size={20} color={primaryColor} />
                    </View>
                    <View className="flex-1" style={{ minWidth: 0 }}>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: fgColor }}>
                            Invite a teammate
                        </Text>
                        <Text style={{ fontSize: 12.5, color: mutedColor, marginTop: 2 }}>
                            We’ll email them a link to join your organization.
                        </Text>
                    </View>
                </View>
                <DrawerCloseButton onPress={onDone}>
                    <X size={18} color={mutedColor} />
                </DrawerCloseButton>
            </DrawerHeader>

            <DrawerBody>
                <View className="gap-5">
                    <FormErrorSummary errors={errors} isEnabled={isSubmitted} />

                    <TextInput
                        control={control}
                        name="email"
                        label="Email address"
                        placeholder="teammate@company.com"
                        autoCapitalize="none"
                        autoComplete="email"
                        keyboardType="email-address"
                    />

                    <View className="gap-2.5">
                        <Text
                            style={{
                                fontSize: 11,
                                fontWeight: '700',
                                color: mutedColor,
                                textTransform: 'uppercase',
                                letterSpacing: 0.8,
                            }}
                        >
                            Role
                        </Text>
                        <Controller
                            control={control}
                            name="role"
                            render={({ field: { onChange, value } }) => (
                                <View className="gap-1.5">
                                    {inviteRoles.map(role => {
                                        const swatch = ROLE_SWATCH[role]
                                        const isActive = value === role
                                        return (
                                            <Pressable
                                                key={role}
                                                onPress={() => onChange(role)}
                                                className="flex-row items-center gap-3 rounded-xl p-3"
                                                style={{
                                                    borderWidth: 1.5,
                                                    borderColor: isActive
                                                        ? swatch.ring
                                                        : borderColor,
                                                    backgroundColor: isActive
                                                        ? swatch.bg
                                                        : 'transparent',
                                                }}
                                            >
                                                <View
                                                    className="items-center justify-center"
                                                    style={{
                                                        width: 20,
                                                        height: 20,
                                                        borderRadius: 10,
                                                        borderWidth: 2,
                                                        borderColor: isActive
                                                            ? swatch.fg
                                                            : borderColor,
                                                        backgroundColor: isActive
                                                            ? swatch.fg
                                                            : 'transparent',
                                                    }}
                                                >
                                                    {isActive && (
                                                        <Check
                                                            size={11}
                                                            color="#fff"
                                                            strokeWidth={3}
                                                        />
                                                    )}
                                                </View>
                                                <View className="flex-1">
                                                    <Text
                                                        style={{
                                                            fontSize: 13.5,
                                                            fontWeight: '700',
                                                            color: isActive ? swatch.fg : fgColor,
                                                        }}
                                                    >
                                                        {ROLE_LABELS[role]}
                                                    </Text>
                                                    <Text
                                                        style={{
                                                            fontSize: 11.5,
                                                            color: mutedColor,
                                                            marginTop: 1,
                                                            lineHeight: 15,
                                                        }}
                                                    >
                                                        {ROLE_DESCRIPTIONS[role]}
                                                    </Text>
                                                </View>
                                            </Pressable>
                                        )
                                    })}
                                </View>
                            )}
                        />
                    </View>
                </View>
            </DrawerBody>

            <DrawerFooter>
                <View className="flex-row items-center justify-end gap-2">
                    <Pressable
                        onPress={onDone}
                        className="rounded-md"
                        style={{ paddingVertical: 8, paddingHorizontal: 14 }}
                    >
                        <Text style={{ fontSize: 13, fontWeight: '600', color: mutedColor }}>
                            Cancel
                        </Text>
                    </Pressable>
                    <Pressable
                        onPress={onSubmit}
                        disabled={invite.isPending || !isValid}
                        className="flex-row items-center gap-1.5 rounded-md"
                        style={{
                            paddingVertical: 8,
                            paddingHorizontal: 14,
                            backgroundColor: primaryColor,
                            opacity: invite.isPending || !isValid ? 0.5 : 1,
                        }}
                    >
                        <Send size={13} color={primaryFgColor} />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: primaryFgColor }}>
                            {invite.isPending ? 'Sending…' : 'Send invite'}
                        </Text>
                    </Pressable>
                </View>
            </DrawerFooter>
        </>
    )
}
