package realtime

import (
	"errors"
	"sync"

	"github.com/pocketbase/pocketbase/core"
)

// AuthorizeFn decides whether the authenticated user identified by `auth`
// may join the room identified by `roomID`. Return nil to allow; any
// non-nil error rejects the WebSocket handshake with a 403.
//
// The room kind is implicit: each AuthorizeFn is registered against one
// specific kind via RegisterRoomKind, so the implementer already knows
// what kind of room they are gating.
type AuthorizeFn func(auth *core.Record, roomID string) error

// RoomKindOptions bundles everything a room kind plugs into the broker.
// Authorize is required; the rest are optional and lit up only by room
// kinds that need server-side document mirroring (sheets is the first).
type RoomKindOptions struct {
	// Authorize gates inbound WebSocket connections. Required.
	Authorize AuthorizeFn

	// RuntimeProvider, if non-nil, is asked to mint a server-side
	// DocHandle every time a new room of this kind is created. The
	// broker then applies every inbound MsgDocUpdate to the handle
	// and serves MsgSyncRequest replies from its EncodeStateAsUpdate
	// output (skipping the peer-bounce path).
	RuntimeProvider DocRuntime

	// OnRoomCreate, if non-nil, is invoked once with (roomID, handle)
	// immediately after a room is created with a server-side mirror.
	// Lets the consumer (e.g. a SaveCoordinator) record the handle
	// for later use without going through the broker each time.
	OnRoomCreate func(roomID string, handle DocHandle)

	// OnDocUpdate, if non-nil, is invoked synchronously after each
	// MsgDocUpdate has been folded into the server-side mirror and
	// fanned out to peers. The callback receives only the roomID —
	// the up-to-date state is in the handle, not in the payload, so
	// callers don't need a copy of the bytes.
	//
	// The callback runs on the broker's route-path goroutine; it
	// must be cheap (e.g. flip a dirty flag, reset a debounce
	// timer). Anything blocking belongs in a goroutine the callback
	// schedules.
	OnDocUpdate func(roomID string)

	// OnEmpty, if non-nil, is invoked synchronously when the last
	// client of a room disconnects, before the room's DocHandle is
	// closed. A consumer that needs to flush state to durable
	// storage on teardown can do so here and block until the flush
	// completes; the broker's removal of the room handle waits on
	// this callback.
	OnEmpty func(roomID string)
}

// ErrUnknownRoomKind is returned when a client connects to a room kind
// nobody has registered. The transport layer converts this to an HTTP
// 4xx response on the WebSocket upgrade.
var ErrUnknownRoomKind = errors.New("yroom: unknown room kind")

// ErrUnauthorized is returned by RegisterRoomKind handlers to indicate
// the user is not allowed in this room. Distinct from ErrUnknownRoomKind
// because the latter is a configuration mistake (no plugin registered)
// while the former is an access decision.
var ErrUnauthorized = errors.New("yroom: unauthorized")

var (
	registryMu sync.RWMutex
	registry   = map[string]RoomKindOptions{}
)

// RegisterRoomKind registers an authorize-only handler for the given
// kind. Suitable for room kinds that just need fan-out (no server-side
// document mirroring). For richer integration, use RegisterRoomKindWith.
//
// Panics on duplicate registration so that misconfiguration surfaces
// loudly during dev rather than silently shadowing a handler.
func RegisterRoomKind(kind string, fn AuthorizeFn) {
	RegisterRoomKindWith(kind, RoomKindOptions{Authorize: fn})
}

// RegisterRoomKindWith registers a room kind with the full bundle of
// hooks. Authorize is required; everything else is optional. Panics on
// duplicate registration.
func RegisterRoomKindWith(kind string, opts RoomKindOptions) {
	if kind == "" || opts.Authorize == nil {
		panic("yroom: kind and Authorize must be non-empty")
	}
	registryMu.Lock()
	defer registryMu.Unlock()
	if _, exists := registry[kind]; exists {
		panic("yroom: room kind already registered: " + kind)
	}
	registry[kind] = opts
}

// authorizeFor looks up the registered authorize handler for a room
// kind. Returns ErrUnknownRoomKind if no plugin owns this kind. Kept
// as a thin wrapper for back-compat with the existing connect path.
func authorizeFor(kind string) (AuthorizeFn, error) {
	opts, err := optionsFor(kind)
	if err != nil {
		return nil, err
	}
	return opts.Authorize, nil
}

// optionsFor returns the full RoomKindOptions for a registered kind.
func optionsFor(kind string) (RoomKindOptions, error) {
	registryMu.RLock()
	defer registryMu.RUnlock()
	opts, ok := registry[kind]
	if !ok {
		return RoomKindOptions{}, ErrUnknownRoomKind
	}
	return opts, nil
}

// resetRegistry clears all registered room kinds. Intended for tests
// only; never call from production code.
func resetRegistry() {
	registryMu.Lock()
	defer registryMu.Unlock()
	registry = map[string]RoomKindOptions{}
}

// ResetRegistryForTest is the exported alias of resetRegistry, callable
// from external _test.go files in consumer packages. Production code
// must not call this.
func ResetRegistryForTest() { resetRegistry() }

// LookupForTest returns the AuthorizeFn registered for kind, or nil if
// no plugin has registered. Exported for use in consumer test packages
// that want to exercise a registered handler directly. Production code
// must not call this.
func LookupForTest(kind string) AuthorizeFn {
	registryMu.RLock()
	defer registryMu.RUnlock()
	if opts, ok := registry[kind]; ok {
		return opts.Authorize
	}
	return nil
}
