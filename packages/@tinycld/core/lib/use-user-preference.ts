import { and, eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { newRecordId } from 'pbtsdb/core'
import { useCallback } from 'react'
import { useAuth } from '@tinycld/core/lib/auth'
import { mutation, useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'

export function useUserPreference<T>(
    app: string,
    key: string,
    defaultValue: T
): readonly [T, (newValue: T) => void] {
    const { user } = useAuth()
    const [userPreferencesCollection] = useStore('user_preferences')

    const { data: rows } = useLiveQuery(
        query =>
            query
                .from({ user_preferences: userPreferencesCollection })
                .where(({ user_preferences }) =>
                    and(
                        eq(user_preferences.app, app),
                        eq(user_preferences.key, key),
                        eq(user_preferences.user, user.id)
                    )
                ),
        [app, key, user.id]
    )

    const existing = rows?.[0]
    const value = existing ? (existing.value as T) : defaultValue

    const upsert = useMutation({
        mutationFn: mutation(function* (newValue: T) {
            if (existing) {
                yield userPreferencesCollection.update(existing.id, draft => {
                    draft.value = newValue
                })
            } else {
                yield userPreferencesCollection.insert({
                    id: newRecordId(),
                    app,
                    key,
                    value: newValue,
                    user: user.id,
                })
            }
        }),
    })

    const setValue = useCallback(
        (newValue: T) => {
            upsert.mutate(newValue)
        },
        [upsert]
    )

    return [value, setValue] as const
}
