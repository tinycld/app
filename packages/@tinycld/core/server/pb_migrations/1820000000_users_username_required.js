/// <reference path="../pb_data/types.d.ts" />
// Switch user identity from email-only to username-first.
//
// On `users` (`_pb_users_auth_`):
//   - `username` becomes required, with the pattern the front-end validates.
//   - `email` becomes optional.
//   - `passwordAuth.identityFields` accepts both username and email so
//     existing users can sign in with their old email during the transition.
//
// Backfill mirrors coreserver/usernames.go::BackfillUsernames. The JS and Go
// implementations share TestBackfillUsernames as a parity check.

migrate(
    app => {
        const users = app.findCollectionByNameOrId('users')

        const usernameField = users.fields.getByName('username')
        if (!usernameField) {
            throw new Error('users.username: system field missing')
        }
        usernameField.required = true
        usernameField.pattern = '^[a-z0-9][a-z0-9_-]{1,31}$'
        usernameField.min = 2
        usernameField.max = 32

        const emailField = users.fields.getByName('email')
        if (emailField) {
            emailField.required = false
        }

        // Backfill before saving the collection — flipping required=true on
        // username while a row has none would fail validation.
        const NON = /[^a-z0-9_-]/g
        const taken = new Set()
        const rows = app.findAllRecords('users')
        for (const r of rows) {
            const u = r.get('username')
            if (u) taken.add(u)
        }
        const derive = email => {
            const at = email.indexOf('@')
            const prefix = (at >= 0 ? email.slice(0, at) : email).toLowerCase()
            const cleaned = prefix.replace(NON, '')
            return cleaned || 'user'
        }
        for (const r of rows) {
            if (r.get('username')) continue
            const base = derive(r.get('email') || '')
            let candidate = base
            let i = 2
            while (taken.has(candidate)) {
                candidate = base + i
                i++
            }
            r.set('username', candidate)
            taken.add(candidate)
            app.save(r)
        }

        const opts = users.passwordAuth || {}
        opts.enabled = true
        opts.identityFields = ['username', 'email']
        users.passwordAuth = opts

        app.save(users)
    },
    app => {
        const users = app.findCollectionByNameOrId('users')
        const usernameField = users.fields.getByName('username')
        if (usernameField) {
            usernameField.required = false
            usernameField.pattern = ''
        }
        const emailField = users.fields.getByName('email')
        if (emailField) {
            emailField.required = true
        }
        const opts = users.passwordAuth || {}
        opts.identityFields = ['email']
        users.passwordAuth = opts
        app.save(users)
    }
)
