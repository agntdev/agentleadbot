# Real Estate Lead Capture Bot — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A Telegram bot that captures property leads from visitors (name, phone, intent: buy/rent/sell, note) with confirmation before saving. Submissions trigger immediate agent notifications and are stored in a private in-bot list for the agent to view, mark as New/Done, or delete. No team features, payments, or external systems required.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Public visitors
- Real-estate agent

## Success criteria

- Leads are captured with all required fields and stored persistently
- Agent receives immediate Telegram notifications with lead details
- Agent can view, filter, and update lead status (New/Done) via in-bot admin interface
- All data survives bot restarts with proper retention

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open the main menu for visitors
- **/admin** (command, actor: agent, command: /admin) — Access private admin lead list (only for configured admin)
  - inputs: ADMIN_CHAT_ID
  - outputs: Paginated lead list with filters
- **Submit a lead** (button, actor: user, callback: submit_lead:start) — Initiate lead submission flow
  - inputs: name, phone, intent, note
  - outputs: Lead confirmation summary

## Flows

### Lead submission
_Trigger:_ button:submit_lead:start

1. Show 'Submit a lead' button
2. Collect name via ForceReply
3. Collect phone via contact button or ForceReply
4. Select intent from inline buttons (Buy/Rent/Sell)
5. Enter short note via ForceReply
6. Display confirmation summary with Confirm/Edit buttons
7. Save lead on confirmation

_Data touched:_ Lead

### Admin management
_Trigger:_ /admin

1. Verify ADMIN_CHAT_ID
2. Show paginated lead list with filters (All/New/Done)
3. Display lead details on selection
4. Allow Mark New, Mark Done, or Delete actions

_Data touched:_ Lead

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — Telegram user ID for lead management access
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **Lead** _(retention: persistent)_ — Property lead submitted by a visitor
  - fields: id, name, phone, intent, note, status, submitted_at

## Integrations

- **Telegram** (required) — Bot API messaging and notifications
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Configure ADMIN_CHAT_ID for private access
- View and update lead statuses (New/Done)
- Delete leads as needed

## Notifications

- Formatted lead submission message to agent with Admin action button

## Permissions & privacy

- Only the configured ADMIN_CHAT_ID can access lead management
- Phone numbers stored as text with user consent implied by submission
- No third-party data sharing

## Edge cases

- Invalid phone number formats during manual entry
- Non-admin users attempting to access /admin
- No internet connectivity during lead submission
- Agent misses notification and needs to check admin list manually

## Required tests

- End-to-end lead submission with confirmation and agent notification
- Admin authentication enforcement
- Pagination and filtering of lead list
- Status updates persist after restarts

## Assumptions

- Owner will provide valid Telegram chat ID for admin access
- Phone number validation can handle common international formats
- Leads require no expiration policy
- Agent will manually manage lead workflow without automation
