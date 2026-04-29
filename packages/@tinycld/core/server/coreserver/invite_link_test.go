package coreserver

import (
    "net/http"
    "regexp"
    "testing"

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
