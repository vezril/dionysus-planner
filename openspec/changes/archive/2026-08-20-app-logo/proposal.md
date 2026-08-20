# Proposal: app-logo

## Why

The app has no identity — default favicon, unbranded sidebar. Calvin
generated a cyberpunk neon Dionysus mark (cyan circuit-wreath, magenta
grapes) matching the ui-theme palette.

## What Changes

Asset pipeline (checkerboard-keyed onto the --background violet, soft
glow re-synthesized): `app/icon.png` (favicon via App Router convention),
`app/apple-icon.png` (home-screen), `public/logo.png` (full-res). The
sidebar shows the logo above the nav, linking home.

## Impact

Static assets + a nav header block. No schema, no behavior.
