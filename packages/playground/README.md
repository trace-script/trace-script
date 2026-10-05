# Trace Script Playground

Run `pnpm dev` from the repository root and open `http://127.0.0.1:4317`.

The playground is a private workspace used for SDK scenarios and Chrome extension acceptance. It is excluded from extension packaging. At the foundation stage it provides the installation and panel verification steps; protocol fixtures and SDK controls are added with their implementation.

Run `pnpm build` for a static playground and the production extension. Load `packages/chrome-extensions/dist` as an unpacked extension, then open this page's DevTools and select Agent Trace.
