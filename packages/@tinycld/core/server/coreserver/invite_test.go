package coreserver

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/tests"
)

func TestInviteMember_NewUser_ReturnsInviteURLAndDoesNotEmail(t *testing.T) {
	read := captureMailerOutput(t)

	// Build app and seed data BEFORE registering the lifecycle hook so the
	// owner's own membership creation does not trigger an invite email.
	app := setupInviteTestApp(t)

	owner := mustCreateUser(t, app, "owner@test.local", false)
	org := mustCreateOrg(t, app)
	newMembership(t, app, owner, org, "owner", "")

	// Register endpoint + lifecycle only after seed data is in place.
	registerInviteEndpointCore(app)
	registerInviteLifecycleCore(app)

	token, err := owner.NewAuthToken()
	if err != nil {
		t.Fatalf("NewAuthToken: %v", err)
	}

	bodyBytes, _ := json.Marshal(map[string]string{
		"email": "newhire@example.com",
		"role":  "member",
		"orgId": org.Id,
	})

	scenario := &tests.ApiScenario{
		Name:            "new-user invite returns inviteUrl and skips email",
		Method:          http.MethodPost,
		URL:             "/api/invite-member",
		Body:            strings.NewReader(string(bodyBytes)),
		Headers:         map[string]string{"Authorization": token},
		ExpectedStatus:  http.StatusOK,
		ExpectedContent: []string{`"userId":`},
		// Give the async lifecycle goroutine time to finish before reading mail log.
		Delay: 150 * time.Millisecond,
		TestAppFactory: func(_ testing.TB) *tests.TestApp {
			return app
		},
		DisableTestAppCleanup: true,
		AfterTestFunc: func(t testing.TB, _ *tests.TestApp, res *http.Response) {
			tt := t.(*testing.T)

			var body map[string]any
			if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
				tt.Fatalf("decode response body: %v", err)
			}

			url, _ := body["inviteUrl"].(string)
			if !regexp.MustCompile(`/accept-invite/[0-9a-f]{64}$`).MatchString(url) {
				tt.Errorf("inviteUrl: got %q, want .../accept-invite/<64-hex>", url)
			}

			sends := read()
			if len(sends) != 0 {
				tt.Errorf("expected no emails on new-user invite, got %d: %v", len(sends), sends)
			}
		},
	}

	scenario.Test(t)
}
