# CodeCollab Security Policy

## Reporting a Vulnerability

If you believe you've found a security issue in CodeCollab, please **do not**
open a public GitHub issue. Instead, email the maintainers (address in the
repository `README.md`) with:

1. A description of the vulnerability and the affected component.
2. Reproduction steps or a proof-of-concept.
3. The CodeCollab version / commit you tested against.

We aim to acknowledge reports within **72 hours** and ship a fix or mitigation
as soon as we reasonably can. Credit will be given in the release notes unless
you prefer to remain anonymous.

## Threat Model

CodeCollab is a local-first desktop Electron app with optional peer-to-peer
collaboration over Hyperswarm. The threat model covers:

- **Malicious peers** in a shared project room (untrusted by default).
- **Malicious invite codes** fed to the app from outside.
- **Malicious content** in repos you clone (file names, commit messages, etc.).
- **Malicious web content** rendered inside the built-in preview iframe.
- **Accidental disclosure** of tokens or secrets via logs / settings.

CodeCollab does **not** attempt to defend against:

- A user who has local OS access to your account (they already have your files).
- A compromised GitHub account (GitHub's own auth is the trust boundary).
- Modifications a user makes to their own installed copy of CodeCollab.

## What We Do to Protect You

- **Sandboxed renderer.** `nodeIntegration: false`, `contextIsolation: true`,
  preload exposes only a narrow `electronAPI`.
- **Navigation lockdown.** The main window refuses to navigate to non-localhost
  origins; `window.open` is forced through the OS browser.
- **Authenticated P2P.** Each project has a 32-byte random `p2pSecret` that is
  included in every invite code. The Hyperswarm topic is derived from the
  remote URL *and* the secret, and every P2P frame is HMAC-SHA256 signed.
  Peers who only know the (possibly public) GitHub URL cannot discover the
  room or forge messages.
- **Peer input is untrusted.** Incoming state-change payloads are size-capped,
  depth-limited, and stripped of prototype-polluting keys (`__proto__`,
  `constructor`, `prototype`) before they ever touch disk or React.
- **Argv-only git.** Git identity, commit messages, and clones use argv-form
  `execFile` so content can never be re-interpreted as a shell command.
- **Log redaction.** Common token patterns (GitHub PATs, OpenAI keys, JWTs,
  AWS keys, `Bearer ` headers) are scrubbed from `codebuddy-debug.log`
  before writes.
- **URL allow-listing.** `shell.openExternal` only opens `http(s)://` URLs.

## What You Can Do to Protect Yourself

- **Share invite codes privately.** They contain a secret; treat them like
  passwords. Anyone with the invite code can join your P2P room.
- **Regenerate invites** if you ever accidentally expose one; the project's
  shared secret rotates on regeneration.
- **Use private GitHub repos** for anything sensitive.
- **Never commit** `.env` files, API keys, or `codebuddy-debug.log`. These
  are in `.gitignore` by default but double-check before pushing.
- **Audit dependencies** with `npm audit` periodically.

## Known Limitations / Follow-ups

- Project data at rest (`settings.json`) is not encrypted. OS-level
  credential stores are planned.
- P2P does not currently rate-limit message *frequency* (only size). A very
  chatty peer can still be noisy; disconnect and regenerate the invite.
- The preview iframe loads arbitrary `localhost` content — do not use the
  preview to open untrusted dev servers on your machine.
