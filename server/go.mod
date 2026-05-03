module tinycld.org/app

go 1.25.0

require (
	github.com/getsentry/sentry-go v0.44.1
	github.com/pocketbase/pocketbase v0.36.8
	tinycld.org/core v0.0.0
)

replace tinycld.org/core => ../packages/@tinycld/core/server

// --- package extensions (auto-generated, do not edit) ---
require tinycld.org/packages/calendar v0.0.0

require tinycld.org/packages/contacts v0.0.0

require tinycld.org/packages/drive v0.0.0

require tinycld.org/packages/mail v0.0.0

require (
	github.com/SherClockHolmes/webpush-go v1.4.0 // indirect
	github.com/asaskevich/govalidator v0.0.0-20230301143203-a9d515a09cc2 // indirect
	github.com/aymerick/douceur v0.2.0 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/clipperhouse/displaywidth v0.10.0 // indirect
	github.com/clipperhouse/uax29/v2 v2.6.0 // indirect
	github.com/disintegration/imaging v1.6.2 // indirect
	github.com/dlclark/regexp2 v1.11.5 // indirect
	github.com/domodwyer/mailyak/v3 v3.6.2 // indirect
	github.com/dop251/base64dec v0.0.0-20231022112746-c6c9f9a96217 // indirect
	github.com/dop251/goja v0.0.0-20260106131823-651366fbe6e3 // indirect
	github.com/dop251/goja_nodejs v0.0.0-20260212111938-1f56ff5bcf14 // indirect
	github.com/dustin/go-humanize v1.0.1 // indirect
	github.com/ebitengine/purego v0.8.0 // indirect
	github.com/emersion/go-ical v0.0.0-20240127095438-fc1c9d8fb2b6 // indirect
	github.com/emersion/go-imap/v2 v2.0.0-beta.8 // indirect
	github.com/emersion/go-message v0.18.2 // indirect
	github.com/emersion/go-sasl v0.0.0-20241020182733-b788ff22d5a6 // indirect
	github.com/emersion/go-smtp v0.24.0 // indirect
	github.com/emersion/go-vcard v0.0.0-20230815062825-8fda7d206ec9 // indirect
	github.com/emersion/go-webdav v0.7.0 // indirect
	github.com/fatih/color v1.19.0 // indirect
	github.com/fsnotify/fsnotify v1.7.0 // indirect
	github.com/gabriel-vasile/mimetype v1.4.13 // indirect
	github.com/ganigeorgiev/fexpr v0.5.0 // indirect
	github.com/gen2brain/go-fitz v1.24.14 // indirect
	github.com/go-ozzo/ozzo-validation/v4 v4.3.0 // indirect
	github.com/go-sourcemap/sourcemap v2.1.4+incompatible // indirect
	github.com/golang-jwt/jwt/v5 v5.3.1 // indirect
	github.com/google/pprof v0.0.0-20260115054156-294ebfa9ad83 // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/gorilla/css v1.0.1 // indirect
	github.com/inconshreveable/mousetrap v1.1.0 // indirect
	github.com/jaytaylor/html2text v0.0.0-20260303211410-1a4bdc82ecec // indirect
	github.com/jdeng/goheif v0.0.0-20260407171156-9bf5264f67af // indirect
	github.com/jupiterrider/ffi v0.2.0 // indirect
	github.com/ledongthuc/pdf v0.0.0-20240201131950-da5b75280b06 // indirect
	github.com/mattn/go-colorable v0.1.14 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/mattn/go-runewidth v0.0.19 // indirect
	github.com/microcosm-cc/bluemonday v1.0.27 // indirect
	github.com/mrz1836/postmark v1.9.0 // indirect
	github.com/ncruces/go-strftime v1.0.0 // indirect
	github.com/olekukonko/cat v0.0.0-20250911104152-50322a0618f6 // indirect
	github.com/olekukonko/errors v1.2.0 // indirect
	github.com/olekukonko/ll v0.1.6 // indirect
	github.com/olekukonko/tablewriter v1.1.4 // indirect
	github.com/pocketbase/dbx v1.12.0 // indirect
	github.com/remyoudompheng/bigfft v0.0.0-20230129092748-24d4a6f8daec // indirect
	github.com/spf13/cast v1.10.0 // indirect
	github.com/spf13/cobra v1.10.2 // indirect
	github.com/spf13/pflag v1.0.10 // indirect
	github.com/ssor/bom v0.0.0-20170718123548-6386211fdfcf // indirect
	github.com/teambition/rrule-go v1.8.2 // indirect
	golang.org/x/crypto v0.50.0 // indirect
	golang.org/x/image v0.38.0 // indirect
	golang.org/x/net v0.53.0 // indirect
	golang.org/x/oauth2 v0.36.0 // indirect
	golang.org/x/sync v0.20.0 // indirect
	golang.org/x/sys v0.43.0 // indirect
	golang.org/x/text v0.36.0 // indirect
	modernc.org/libc v1.70.0 // indirect
	modernc.org/mathutil v1.7.1 // indirect
	modernc.org/memory v1.11.0 // indirect
	modernc.org/sqlite v1.48.0 // indirect
)

replace tinycld.org/packages/calendar => ../../calendar/server

replace tinycld.org/packages/contacts => ../../contacts/server

replace tinycld.org/packages/drive => ../../drive/server

replace tinycld.org/packages/mail => ../../mail/server

// --- end package extensions ---
