package coreserver

import (
    "net/http"
    "regexp"
    "testing"
    "time"

    "github.com/pocketbase/pocketbase/tests"
)

func TestInviteLink_Get_ReturnsLiveURL(t *testing.T) {
    app := setupInviteTestApp(t)

    owner := mustCreateUser(t, app, "owner@test.local", false)
    target := mustCreateUser(t, app, "pending@test.local", false)
    target.SetVerified(false)
    if err := app.Save(target); err != nil {
        t.Fatal(err)
    }
    org := mustCreateOrg(t, app)
    // owner needs an admin/owner user_org row
    newMembership(t, app, owner, org, "owner", "")
    uo := newMembership(t, app, target, org, "member", owner.Id)

    if _, err := mintInviteToken(app, target, org, "member"); err != nil {
        t.Fatal(err)
    }

    // Register the endpoint on the test app before running the scenario.
    RegisterInviteLinkEndpoints(app)

    authToken, err := tokenForUser(app, owner)
    if err != nil {
        t.Fatal(err)
    }

    scenario := &tests.ApiScenario{
        Name:            "GET invite-link returns live URL",
        Method:          http.MethodGet,
        URL:             "/api/invite-link/" + uo.Id,
        Headers:         map[string]string{"Authorization": authToken},
        ExpectedStatus:  http.StatusOK,
        ExpectedContent: []string{`"inviteUrl":`},
        TestAppFactory: func(_ testing.TB) *tests.TestApp {
            return app
        },
        DisableTestAppCleanup: true,
        AfterTestFunc: func(t testing.TB, _ *tests.TestApp, res *http.Response) {
            tt := t.(*testing.T)
            body := readJSONBody(tt, res)
            url, _ := body["inviteUrl"].(string)
            if !regexp.MustCompile(`/accept-invite/[0-9a-f]{64}$`).MatchString(url) {
                tt.Errorf("inviteUrl: got %q, want .../accept-invite/<64-hex>", url)
            }
        },
    }
    scenario.Test(t)
}

func TestInviteLink_Get_404WhenNoLiveToken(t *testing.T) {
    app := setupInviteTestApp(t)
    RegisterInviteLinkEndpoints(app)

    owner := mustCreateUser(t, app, "owner@test.local", false)
    target := mustCreateUser(t, app, "pending@test.local", false)
    org := mustCreateOrg(t, app)
    newMembership(t, app, owner, org, "owner", "")
    uo := newMembership(t, app, target, org, "member", owner.Id)

    // No tokens minted.

    authToken, err := tokenForUser(app, owner)
    if err != nil {
        t.Fatal(err)
    }

    scenario := &tests.ApiScenario{
        Name:                  "GET invite-link 404 when no token",
        Method:                http.MethodGet,
        URL:                   "/api/invite-link/" + uo.Id,
        Headers:               map[string]string{"Authorization": authToken},
        ExpectedStatus:        http.StatusNotFound,
        ExpectedContent:       []string{`"error":`},
        TestAppFactory:        func(_ testing.TB) *tests.TestApp { return app },
        DisableTestAppCleanup: true,
    }
    scenario.Test(t)
}

func TestInviteLink_Get_404WhenAllTokensExpired(t *testing.T) {
    app := setupInviteTestApp(t)
    RegisterInviteLinkEndpoints(app)

    owner := mustCreateUser(t, app, "owner@test.local", false)
    target := mustCreateUser(t, app, "pending@test.local", false)
    org := mustCreateOrg(t, app)
    newMembership(t, app, owner, org, "owner", "")
    uo := newMembership(t, app, target, org, "member", owner.Id)

    if _, err := mintInviteToken(app, target, org, "member"); err != nil {
        t.Fatal(err)
    }
    tokens, _ := app.FindRecordsByFilter("invite_tokens", "user = {:u}", "", 1, 0,
        map[string]any{"u": target.Id})
    tokens[0].Set("expires_at", time.Now().Add(-1*time.Hour).UTC().Format(time.RFC3339))
    if err := app.Save(tokens[0]); err != nil {
        t.Fatal(err)
    }

    authToken, err := tokenForUser(app, owner)
    if err != nil {
        t.Fatal(err)
    }

    scenario := &tests.ApiScenario{
        Name:                  "GET invite-link 404 when all tokens expired",
        Method:                http.MethodGet,
        URL:                   "/api/invite-link/" + uo.Id,
        Headers:               map[string]string{"Authorization": authToken},
        ExpectedStatus:        http.StatusNotFound,
        ExpectedContent:       []string{`"error":`},
        TestAppFactory:        func(_ testing.TB) *tests.TestApp { return app },
        DisableTestAppCleanup: true,
    }
    scenario.Test(t)
}

func TestInviteLink_Get_403WhenCallerIsMember(t *testing.T) {
    app := setupInviteTestApp(t)
    RegisterInviteLinkEndpoints(app)

    plainMember := mustCreateUser(t, app, "member@test.local", false)
    target := mustCreateUser(t, app, "pending@test.local", false)
    org := mustCreateOrg(t, app)
    newMembership(t, app, plainMember, org, "member", "") // not admin/owner
    uo := newMembership(t, app, target, org, "member", plainMember.Id)

    if _, err := mintInviteToken(app, target, org, "member"); err != nil {
        t.Fatal(err)
    }

    authToken, err := tokenForUser(app, plainMember)
    if err != nil {
        t.Fatal(err)
    }

    scenario := &tests.ApiScenario{
        Name:                  "GET invite-link 403 for non-admin",
        Method:                http.MethodGet,
        URL:                   "/api/invite-link/" + uo.Id,
        Headers:               map[string]string{"Authorization": authToken},
        ExpectedStatus:        http.StatusForbidden,
        ExpectedContent:       []string{`"message"`},
        TestAppFactory:        func(_ testing.TB) *tests.TestApp { return app },
        DisableTestAppCleanup: true,
    }
    scenario.Test(t)
}
