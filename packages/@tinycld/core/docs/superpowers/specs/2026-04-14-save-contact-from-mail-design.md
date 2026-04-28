# Save Contact from Mail — Design Spec

## Summary

Add a `UserPlus` icon next to the sender email in the mail thread `MessageHeader`. Clicking it opens a compact popup form to quick-create a contact pre-filled with the sender's name and email. The icon is hidden when the sender already exists in contacts.

## Components

### 1. MessageHeader changes (`EmailHeader.tsx`)

- Add optional `onSaveContact` callback prop and `showSaveContact` boolean prop
- When `showSaveContact` is true, render a `UserPlus` icon button next to the sender email (after the `<email>` text, before the timestamp)
- On press, calls `onSaveContact`

### 2. SaveContactPopover (`packages/mail/components/SaveContactPopover.tsx`)

A compact modal/popover form with:

**Fields (all in a tight layout):**
- First name + Last name — side by side in a row, pre-filled by splitting `senderName`
- Email — pre-filled with `senderEmail`
- Phone — empty
- Company — empty
- Job title — empty

**Buttons:** Save and Cancel (compact, bottom row)

**Behavior:**
- Uses `useForm` + `zodResolver(contactSchema)` from the contacts package
- On save: `useMutation` → `contactsCollection.insert(...)` with `owner: userOrg.id`, `vcard_uid: crypto.randomUUID()`
- On success: closes the popup (the icon disappears because the email now exists in contacts)
- On error: shows inline form errors via `handleMutationErrorsWithForm`

**Pre-fill logic for name splitting:**
- Split `senderName` on first space: everything before = first_name, everything after = last_name
- If no space, entire string = first_name, last_name = ''

### 3. Thread detail screen changes (`[id].tsx`)

- Add `contacts` to `useStore` call
- Query contacts with `useOrgLiveQuery` to get a set of existing contact emails
- For each `MessageHeader`, compute `showSaveContact = !existingEmails.has(msg.sender_email)`
- Manage popup open/close state: track which message's sender is being saved
- Render `SaveContactPopover` once, passing the active sender info

## Data flow

```
[id].tsx
  ├── useStore('contacts') + useOrgLiveQuery → existingEmails Set
  ├── useState for activeSender (null | { name, email })
  ├── MessageHeader
  │     ├── showSaveContact={!existingEmails.has(email)}
  │     └── onSaveContact={() => setActiveSender({ name, email })}
  └── SaveContactPopover
        ├── isOpen={activeSender != null}
        ├── senderName / senderEmail from activeSender
        ├── onClose={() => setActiveSender(null)}
        └── useMutation → contactsCollection.insert()
```

## Out of scope

- Updating existing contacts from mail
- Batch saving multiple senders
- Showing contact details inline in the mail view
