# Mobile JSON API

## Why
The upcoming Swift companion app needs a REST surface — the planner's
functionality lives behind server actions today. Single base URL (the
planner) over LAN or Tailscale; same no-auth private-network posture.

## What Changes
- Route handlers under /api/mobile/* reusing existing actions/facades:
  pantry list, eat/drink, product barcode lookup + create (scanner
  flow), planner week get + entry add/remove, day-log and range
  proxies (range feeds HealthKit sync), one-tap batch portion logging.

## Impact
app/api/mobile/*, integration tests (direct handler calls), train
v2.33.0. iOS app itself is a separate repo (phase 2).
