# Contributing to CodeCollab

Thanks for your interest in contributing! CodeCollab is an Electron + Next.js
desktop app for collaborative "vibe coding" with friends, GitHub-backed
execution, and peer-to-peer activity sync.

## Development Setup

Prerequisites:
- Node.js 20+ and npm
- Git
- Windows 10/11 (primary target) or macOS (experimental — see `mac-support` branch)

```bash
git clone https://github.com/<your-fork>/codecollab.git
cd codecollab
npm install
```

## Common Commands

| Command                | Purpose                                                    |
| ---------------------- | ---------------------------------------------------------- |
| `npm run dev`          | Run the Next.js renderer alone in the browser              |
| `npm run dev:electron` | Run the full Electron app in dev mode (hot reload)         |
| `npm run build`        | Type-check + static export the Next.js renderer            |
| `npm run build:electron` | Build the renderer and produce a packaged installer      |
| `npm run deploy`       | Build + copy the unpacked app to `Desktop\CodeCollab Install\` |
| `npm run lint`         | Run ESLint                                                 |

For a clean local run from a built exe, use `debug-start.bat` (Windows) — it
auto-deploys when build artifacts exist and launches the installed app with
logging.

## Project Structure

- `electron/` — Electron main process, IPC handlers, and services
  (project, p2p, git queue, file watcher, settings, activity, etc.)
- `src/app/` — Next.js App Router routes (renderer)
- `src/components/` — Shared React components
- `src/lib/`, `src/hooks/` — Utilities and React hooks
- `build/` — Icons and packaging assets
- `scripts/` — Build / deploy / icon-generation helpers
- `docs/` — Public-facing docs (architecture, user guide, white paper)

## Branching Model

- `windows` — primary integration branch for Windows builds
- `mac-support` — macOS-specific work
- Feature branches: `feat/<short-name>`, fix branches: `fix/<short-name>`

## Pull Requests

1. Fork the repo and create a feature branch off the appropriate base branch.
2. Run `npm run lint` and `npm run build` before submitting.
3. Keep PRs focused — one logical change per PR is ideal.
4. Describe what you changed and why. Include screenshots for UI changes.
5. Note any new IPC handlers, settings keys, or breaking changes.

## Code Style

- TypeScript strict mode is on for the renderer; prefer typed code.
- Avoid adding new dependencies without discussion.
- Don't commit generated files (`.next/`, `dist-electron/`, logs, `.bak` files).
- Don't add unrelated reformatting in functional PRs.

## Reporting Issues

Open a GitHub issue with:
- OS + version
- CodeCollab version (see `package.json` or About dialog)
- Steps to reproduce
- Relevant console output (DevTools: `Ctrl+Shift+I`) or logs from
  `%APPDATA%\codecollab\`

## Security

For security-sensitive reports, see [`SECURITY.md`](SECURITY.md). Please do
not file public issues for vulnerabilities.

## License

By contributing, you agree that your contributions will be licensed under the
MIT License (see [`LICENSE`](LICENSE)).
