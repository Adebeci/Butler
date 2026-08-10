# Building Butler for macOS

This has to be compiled on an actual Mac -- Apple's build tools only run
on macOS, and there's no reliable cross-build path from Linux/Windows.

## What you need

1. **Node.js** (LTS) from https://nodejs.org if you don't already have it.
   That's it -- no Xcode required for an unsigned build like this.

## Steps

```bash
cd desktop
npm install
npm run dist:mac
```

The finished `.dmg` lands in `desktop/release/`.

## Unsigned build

No Apple Developer account is attached to this build, so macOS will
warn that it's from an unidentified developer on first launch. Right-click
(or Control-click) the app -> **Open** -> confirm **Open** in the dialog.
After that it opens normally.
