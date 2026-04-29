package coreserver

import (
    "encoding/json"
    "errors"
    "fmt"
    "net/http"
    "net/mail"
    "strings"
    "time"

    "github.com/pocketbase/pocketbase/core"
)

// RegisterInviteLinkEndpoints wires the admin-facing endpoints that surface
// and manage invite links for pending memberships.
func RegisterInviteLinkEndpoints(app core.App) {
    app.OnServe().BindFunc(func(e *core.ServeEvent) error {
        e.Router.GET("/api/invite-link/{userOrgId}", func(re *core.RequestEvent) error {
            return handleGetInviteLink(app, re)
        }).BindFunc(requireAuthCore)

        e.Router.POST("/api/invite-link/{userOrgId}/rotate", func(re *core.RequestEvent) error {
            return handleRotateInviteLink(app, re)
        }).BindFunc(requireAuthCore)

        e.Router.POST("/api/invite-link/{userOrgId}/send", func(re *core.RequestEvent) error {
            return handleSendInviteLink(app, re)
        }).BindFunc(requireAuthCore)

        return e.Next()
    })
}

// resolveUserOrgAsAdmin loads the user_org by ID and verifies the caller is an
// admin or owner of the same org. Returns the user_org record on success.
func resolveUserOrgAsAdmin(app core.App, re *core.RequestEvent) (*core.Record, error) {
    userOrgID := re.Request.PathValue("userOrgId")
    uo, err := app.FindRecordById("user_org", userOrgID)
    if err != nil || uo == nil {
        return nil, re.NotFoundError("membership not found", err)
    }
    authUser := re.Auth
    if authUser == nil {
        return nil, re.UnauthorizedError("Authentication required", nil)
    }
    admins, err := app.FindRecordsByFilter(
        "user_org",
        "user = {:userId} && org = {:orgId} && (role = 'admin' || role = 'owner')",
        "", 1, 0,
        map[string]any{"userId": authUser.Id, "orgId": uo.GetString("org")},
    )
    if err != nil || len(admins) == 0 {
        return nil, re.ForbiddenError("You must be an admin or owner of this organization", nil)
    }
    return uo, nil
}

// liveTokenForUserOrg returns an unused, unexpired invite token for the
// user_org's user+org pair, or (nil, nil) if none exists. Rotation invalidates
// all prior tokens before minting a new one, so at most one live token exists
// at a time and ordering doesn't matter.
func liveTokenForUserOrg(app core.App, uo *core.Record) (*core.Record, error) {
    records, err := app.FindRecordsByFilter(
        "invite_tokens",
        "user = {:u} && org = {:o} && used_at = ''",
        "", 0, 0,
        map[string]any{"u": uo.GetString("user"), "o": uo.GetString("org")},
    )
    if err != nil {
        return nil, err
    }
    for _, r := range records {
        exp := r.GetDateTime("expires_at")
        if !exp.IsZero() && exp.Time().Before(time.Now()) {
            continue
        }
        return r, nil
    }
    return nil, nil
}

func handleGetInviteLink(app core.App, re *core.RequestEvent) error {
    uo, err := resolveUserOrgAsAdmin(app, re)
    if err != nil {
        return err
    }
    token, err := liveTokenForUserOrg(app, uo)
    if err != nil {
        return re.InternalServerError("Failed to look up invite token", err)
    }
    if token == nil {
        return re.JSON(http.StatusNotFound, map[string]any{"error": "no live invite link"})
    }
    return re.JSON(http.StatusOK, map[string]any{
        "inviteUrl": buildInviteURL(app, token.GetString("token")),
        "expiresAt": token.GetString("expires_at"),
    })
}

// Stubs for the other two handlers — implemented in later tasks. Defined here
// so the file compiles end-to-end.
func handleRotateInviteLink(app core.App, re *core.RequestEvent) error {
    return re.InternalServerError("not implemented", errors.New("stub"))
}

func handleSendInviteLink(app core.App, re *core.RequestEvent) error {
    return re.InternalServerError("not implemented", errors.New("stub"))
}

// validateAltEmail checks that an email looks like a real address before we
// hand it to the mailer.
func validateAltEmail(s string) error {
    s = strings.TrimSpace(s)
    if s == "" {
        return fmt.Errorf("email is required")
    }
    if _, err := mail.ParseAddress(s); err != nil {
        return fmt.Errorf("invalid email")
    }
    return nil
}

// decodeJSONBody is a small wrapper for parsing request bodies; callers map
// errors to BadRequestError.
func decodeJSONBody(re *core.RequestEvent, dst any) error {
    return json.NewDecoder(re.Request.Body).Decode(dst)
}
