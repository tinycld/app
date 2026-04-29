package coreserver

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"tinycld.org/core/notify"
)

type inviteRequest struct {
	Email string `json:"email"`
	Role  string `json:"role"`
	OrgID string `json:"orgId"`
}

func RegisterInviteEndpoint(app *pocketbase.PocketBase) {
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		e.Router.POST("/api/invite-member", func(re *core.RequestEvent) error {
			return handleInviteMember(app, re)
		}).BindFunc(requireAuthCore)

		// Public (no auth): invited user reads invite info to preload the form.
		e.Router.GET("/api/accept-invite/{token}", func(re *core.RequestEvent) error {
			return handleGetAcceptInvite(app, re)
		})
		// Public (no auth): invited user submits their password.
		e.Router.POST("/api/accept-invite/{token}", func(re *core.RequestEvent) error {
			return handlePostAcceptInvite(app, re)
		})

		return e.Next()
	})
}

func requireAuthCore(re *core.RequestEvent) error {
	if re.Auth == nil {
		return re.UnauthorizedError("Authentication required", nil)
	}
	return re.Next()
}

func handleInviteMember(app *pocketbase.PocketBase, re *core.RequestEvent) error {
	var req inviteRequest
	if err := json.NewDecoder(re.Request.Body).Decode(&req); err != nil {
		return re.BadRequestError("Invalid request body", err)
	}

	if req.Email == "" || req.OrgID == "" {
		return re.BadRequestError("email and orgId are required", nil)
	}

	validRoles := map[string]bool{"admin": true, "member": true, "guest": true}
	if !validRoles[req.Role] {
		return re.BadRequestError("role must be admin, member, or guest", nil)
	}

	// Verify the requesting user is an admin or owner of this org
	authUser := re.Auth
	userOrgs, err := app.FindRecordsByFilter(
		"user_org",
		"user = {:userId} && org = {:orgId} && (role = 'admin' || role = 'owner')",
		"",
		1,
		0,
		map[string]any{"userId": authUser.Id, "orgId": req.OrgID},
	)
	if err != nil || len(userOrgs) == 0 {
		return re.ForbiddenError("You must be an admin or owner of this organization", nil)
	}

	// Check if user already exists
	usersCollection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return re.InternalServerError("Failed to find users collection", err)
	}

	userOrgCollection, err := app.FindCollectionByNameOrId("user_org")
	if err != nil {
		return re.InternalServerError("Failed to find user_org collection", err)
	}

	var userRecord *core.Record
	isNewUser := false

	existing, _ := app.FindAuthRecordByEmail(usersCollection, req.Email)
	if existing != nil {
		userRecord = existing
	} else {
		isNewUser = true
	}

	// Check for existing membership before creating anything
	if !isNewUser {
		existingMembership, _ := app.FindRecordsByFilter(
			"user_org",
			"user = {:userId} && org = {:orgId}",
			"",
			1,
			0,
			map[string]any{"userId": userRecord.Id, "orgId": req.OrgID},
		)
		if len(existingMembership) > 0 {
			// If the user is unverified (pending invite), resend the invite
			if !userRecord.GetBool("verified") {
				if err := invalidateExistingTokens(app, userRecord.Id, req.OrgID); err != nil {
					return re.InternalServerError("Failed to invalidate old tokens", err)
				}
				org, err := app.FindRecordById("orgs", req.OrgID)
				if err != nil {
					return re.InternalServerError("Failed to find organization", err)
				}
				token, err := mintInviteToken(app, userRecord, org, req.Role)
				if err != nil {
					return re.InternalServerError("Failed to mint invite token", err)
				}
				if !IsDemoUser(app, authUser.Id) {
					go sendNewInviteEmail(app, userRecord, org, req.Role, token)
				}
				return re.JSON(http.StatusOK, map[string]any{
					"userId":    userRecord.Id,
					"userOrgId": existingMembership[0].Id,
					"isNew":     false,
					"resent":    true,
				})
			}
			return re.BadRequestError("User is already a member of this organization", nil)
		}
	}

	// Create user + membership in a transaction so we don't orphan users
	var membershipId string
	err = app.RunInTransaction(func(txApp core.App) error {
		if isNewUser {
			password, err := randomPassword(32)
			if err != nil {
				return err
			}

			newUser := core.NewRecord(usersCollection)
			newUser.Set("email", req.Email)
			name := req.Email
			if idx := strings.IndexByte(req.Email, '@'); idx >= 0 {
				name = req.Email[:idx]
			}
			newUser.Set("name", name)
			newUser.Set("emailVisibility", true)
			newUser.Set("verified", false)
			newUser.SetPassword(password)

			if err := txApp.Save(newUser); err != nil {
				return err
			}
			userRecord = newUser
		}

		membership := core.NewRecord(userOrgCollection)
		membership.Set("user", userRecord.Id)
		membership.Set("org", req.OrgID)
		membership.Set("role", req.Role)
		membership.Set("created_by", authUser.Id)

		if err := txApp.Save(membership); err != nil {
			return err
		}
		membershipId = membership.Id

		return nil
	})
	if err != nil {
		return re.BadRequestError("Failed to invite member", err)
	}

	// Notify the invited user
	go func() {
		orgRecord, err := app.FindRecordById("orgs", req.OrgID)
		if err != nil {
			return
		}
		orgName := orgRecord.GetString("name")
		orgSlug := orgRecord.GetString("slug")

		notify.NotifyUser(app, notify.NotifyParams{
			UserID:  userRecord.Id,
			OrgID:   req.OrgID,
			Type:    "org_invite",
			Package: "core",
			Title:   fmt.Sprintf("You were invited to %s", orgName),
			Body:    fmt.Sprintf("You've been added as %s", req.Role),
			URL:     fmt.Sprintf("/a/%s", orgSlug),
		})
	}()

	return re.JSON(http.StatusOK, map[string]any{
		"userId":    userRecord.Id,
		"userOrgId": membershipId,
		"isNew":     isNewUser,
	})
}

func randomPassword(length int) (string, error) {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// acceptInviteRequest is the POST body for /api/accept-invite/{token}.
type acceptInviteRequest struct {
	Password string `json:"password"`
	Name     string `json:"name"`
}

// findInviteToken looks up an invite token and validates it is unused and unexpired.
// Returns the token record and a zero-valued (statusCode, errMsg) on success,
// or (nil, non-zero status, message) on failure.
func findInviteToken(app *pocketbase.PocketBase, token string) (*core.Record, int, string) {
	if len(token) != 64 {
		return nil, http.StatusNotFound, "invalid invitation link"
	}
	record, err := app.FindFirstRecordByFilter(
		"invite_tokens",
		"token = {:token}",
		map[string]any{"token": token},
	)
	if err != nil || record == nil {
		return nil, http.StatusNotFound, "invitation not found"
	}
	usedAt := record.GetDateTime("used_at")
	if !usedAt.IsZero() {
		return nil, http.StatusGone, "this invitation has already been used"
	}
	expiresAt := record.GetDateTime("expires_at")
	if !expiresAt.IsZero() && expiresAt.Time().Before(time.Now()) {
		return nil, http.StatusGone, "this invitation has expired"
	}
	return record, 0, ""
}

func handleGetAcceptInvite(app *pocketbase.PocketBase, re *core.RequestEvent) error {
	token := re.Request.PathValue("token")
	record, status, msg := findInviteToken(app, token)
	if record == nil {
		return re.JSON(status, map[string]string{"error": msg})
	}

	user, err := app.FindRecordById("users", record.GetString("user"))
	if err != nil {
		return re.JSON(http.StatusNotFound, map[string]string{"error": "user not found"})
	}
	org, err := app.FindRecordById("orgs", record.GetString("org"))
	if err != nil {
		return re.JSON(http.StatusNotFound, map[string]string{"error": "organization not found"})
	}

	return re.JSON(http.StatusOK, map[string]any{
		"email":   user.GetString("email"),
		"orgName": org.GetString("name"),
		"orgSlug": org.GetString("slug"),
		"role":    record.GetString("role"),
	})
}

func handlePostAcceptInvite(app *pocketbase.PocketBase, re *core.RequestEvent) error {
	token := re.Request.PathValue("token")

	var body acceptInviteRequest
	if err := json.NewDecoder(re.Request.Body).Decode(&body); err != nil {
		return re.BadRequestError("Invalid request body", err)
	}
	if len(body.Password) < 8 {
		return re.BadRequestError("Password must be at least 8 characters", nil)
	}

	var email, orgSlug string
	err := app.RunInTransaction(func(txApp core.App) error {
		record, err := txApp.FindFirstRecordByFilter(
			"invite_tokens",
			"token = {:token}",
			map[string]any{"token": token},
		)
		if err != nil || record == nil {
			return fmt.Errorf("invitation not found")
		}
		if !record.GetDateTime("used_at").IsZero() {
			return fmt.Errorf("this invitation has already been used")
		}
		expiresAt := record.GetDateTime("expires_at")
		if !expiresAt.IsZero() && expiresAt.Time().Before(time.Now()) {
			return fmt.Errorf("this invitation has expired")
		}

		user, err := txApp.FindRecordById("users", record.GetString("user"))
		if err != nil {
			return fmt.Errorf("user not found")
		}
		org, err := txApp.FindRecordById("orgs", record.GetString("org"))
		if err != nil {
			return fmt.Errorf("organization not found")
		}

		user.SetPassword(body.Password)
		if body.Name != "" {
			user.Set("name", body.Name)
		}
		user.Set("verified", true)
		if err := txApp.Save(user); err != nil {
			return fmt.Errorf("save user: %w", err)
		}

		record.Set("used_at", time.Now().UTC().Format(time.RFC3339))
		if err := txApp.Save(record); err != nil {
			return fmt.Errorf("save token: %w", err)
		}

		email = user.GetString("email")
		orgSlug = org.GetString("slug")
		return nil
	})
	if err != nil {
		return re.BadRequestError(err.Error(), err)
	}

	return re.JSON(http.StatusOK, map[string]string{
		"email":   email,
		"orgSlug": orgSlug,
	})
}
