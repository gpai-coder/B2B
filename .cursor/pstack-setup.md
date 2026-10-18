# pstack setup (B2B ordering portal)

This repo uses [pstack](https://github.com/cursor/plugins/tree/main/pstack) so agents can build with rigor and verify behavior before opening PRs.

## Cloud Agent note

Default Cloud Agent images may not include Docker. Verification requires Docker (for `docker compose` Postgres) or a reachable local Postgres matching `.env.example`. If `docker` is missing, install it or use an environment whose `start` script brings up Postgres before running `verify-b2b-portal`.

## 1. Install the plugin (per Cursor user)

In Cursor chat:

```text
/add-plugin pstack
```

Slash commands are not available in every environment (for example some Cloud Agent shells). When `/add-plugin` is unavailable, install **pstack** from the Cursor plugin marketplace (`cursor-public` → **pstack**). Cloud Agent VMs in this org often already have pstack cached.

## 2. Configure models (per Cursor user)

In chat:

```text
/setup-pstack
```

That writes `~/.cursor/rules/pstack-models.mdc` (always-applied model choices). It is user-local, not committed.

**Cloud Agent equivalent:** when `/setup-pstack` cannot be invoked interactively, write the default `large` (xhigh) role map to `~/.cursor/rules/pstack-models.mdc` (see pstack `setup-pstack` skill for the canonical shape). Rerun `/setup-pstack` in the desktop IDE to customize per user.

## 3. Project verification skill (committed)

Agents prove storefront and admin behavior with:

```text
/cursor/skills/verify-b2b-portal/SKILL.md
```

Invoke by path or name **`verify-b2b-portal`**. Pair it with `/poteto-mode` for feature work (see `AGENTS.md`).

## 4. Maintenance

After routes or seed data change, run `/maintain-verification-skill` (pstack) to refresh the feature map.
