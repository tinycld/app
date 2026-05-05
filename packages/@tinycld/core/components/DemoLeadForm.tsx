import { forwardRef, useImperativeHandle } from 'react'
import { View } from 'react-native'
import { captureException } from '@tinycld/core/lib/errors'
import {
    FormErrorSummary,
    TextAreaInput,
    TextInput,
    useForm,
    z,
    zodResolver,
} from '@tinycld/core/ui/form'

export type DemoLeadSource = 'intro_modal' | 'banner_link'

export interface DemoLeadFormProps {
    source: DemoLeadSource
}

export interface DemoLeadFormHandle {
    /**
     * Validates the form and, on success, fires `POST /api/demo/lead` (no
     * await — the call site dismisses immediately). Returns `true` if the
     * submission was kicked off and `false` if validation failed (errors are
     * surfaced inline). Caller uses the return value to decide whether to
     * dismiss the surrounding modal.
     */
    submit: () => boolean
}

const schema = z.object({
    email: z.string().min(1, 'Email is required').email('Enter a valid email'),
    reason: z.string().max(2000).optional(),
})

type DemoLeadFormValues = z.infer<typeof schema>

export const DemoLeadForm = forwardRef<DemoLeadFormHandle, DemoLeadFormProps>(
    function DemoLeadForm({ source }, ref) {
        const {
            control,
            handleSubmit,
            formState: { errors, isSubmitted },
        } = useForm<DemoLeadFormValues>({
            resolver: zodResolver(schema),
            defaultValues: { email: '', reason: '' },
            mode: 'onChange',
        })

        useImperativeHandle(ref, () => ({
            submit: () => {
                let valid = false
                // handleSubmit returns an async function, but with a sync zod
                // resolver and a sync onValid body, the success callback runs
                // before the wrapper returns. We capture validity in the
                // callback so the surrounding modal can synchronously decide
                // whether to dismiss. If the schema ever gains an async
                // refinement, this synchronous read becomes unreliable.
                handleSubmit(
                    data => {
                        valid = true
                        const body = JSON.stringify({
                            email: data.email,
                            reason: data.reason ?? '',
                            source,
                        })
                        // Fire-and-forget. Network failures are logged but not
                        // surfaced — the user has already left the form mentally.
                        fetch('/api/demo/lead', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body,
                        }).catch(err => {
                            captureException('demo-lead-submit', err, { source })
                        })
                    },
                    () => {
                        valid = false
                    }
                )()
                return valid
            },
        }))

        return (
            <View>
                <FormErrorSummary errors={errors} isEnabled={isSubmitted} />
                <TextInput
                    control={control}
                    name="email"
                    label="Email"
                    placeholder="you@example.com"
                    autoCapitalize="none"
                    keyboardType="email-address"
                />
                <TextAreaInput
                    control={control}
                    name="reason"
                    label="What brings you here?"
                    placeholder="Optional — share what you're hoping to do with TinyCld."
                    numberOfLines={3}
                />
            </View>
        )
    }
)
