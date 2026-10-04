# Chrome extension

This package owns Manifest V3 entry points and the Nuxt DevTools panel. The panel is an internal module, not another workspace. Chrome APIs stay in the extension adapters; protocol types and platform-independent behavior belong to their existing packages.

Run `pnpm build` from this package to assemble `dist`, or `pnpm build:dev` to assemble `dist-dev`. Both commands enter through tsdown; its completion hook generates the static Nuxt SPA and assembles the extension. Nuxt's internal Vite pipeline is the explicitly approved exception. Load the chosen directory from Chrome's extensions page with developer mode enabled, then open a page's DevTools and select **Agent Trace**. Reload the extension after rebuilding. `pnpm dev` watches entry points and panel sources, producing fresh static development assets in that same order. `pnpm dev:panel` provides a standalone panel preview during UI development.

The initial manifest declares no site access and does not activate the content-script entry. Site authorization and ingestion are delivered in their planned stage. The service worker and content entry are intentionally empty until then.

The build sets the panel asset base to `./`, disables inline import maps, and externalizes Nuxt's executable bootstrap scripts. JSON payload scripts remain inert data. Production assets use local files and system fonts; no remote scripts, CDN, or server process are required.

Acceptance criteria: repeatable development and production assembly, a local DevTools registration, a Nuxt panel displaying the build version, and no executable inline scripts under the extension CSP. Root Vitest tests cover manifest constraints, registration, bootstrap extraction, and badge variants. Browser verification and actual Chrome installation checks are recorded separately so automated checks do not imply manual acceptance.
