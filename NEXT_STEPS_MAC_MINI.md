# Next Steps: Mac Mini OpenClaw Setup

## 0) Ground rules
- Keep Oracle VM backend unchanged.
- No live trading.
- Signals are proposal-only.

## 1) Install Homebrew
- Install Homebrew:
  - `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`
- Verify:
  - `brew --version`

## 2) Install Node 24
- Install and set Node 24:
  - `brew install node@24`
  - `echo 'export PATH="/opt/homebrew/opt/node@24/bin:$PATH"' >> ~/.zshrc`
  - `source ~/.zshrc`
- Verify:
  - `node -v`
  - `npm -v`

## 3) Install OpenClaw
- Install:
  - `npm i -g openclaw`
- Verify:
  - `openclaw --version`

## 4) Install VS Code
- Install VS Code on Mac Mini.
- Verify `code` CLI is available:
  - `code --version`

## 5) Install Codex IDE extension
- Open VS Code Extensions panel.
- Install the Codex/OpenAI extension used for your ChatGPT/Codex workflow.
- Confirm auth completes in VS Code.

## 6) Create Nexus workspace
- Create directory structure (example):
  - `~/nexus-ops`
  - `~/nexus-ops/openclaw`
  - `~/nexus-ops/runbooks`
- Pull/sync project repo used by Nexus operations.

## 7) Connect Telegram
- Configure bot token/chat IDs in local secure env file.
- Run notifier/approval test:
  - send a test message to Nexus Tele
  - confirm command handling path

## 8) Connect Nexus API
- Set Nexus API base URL to Oracle backend endpoint.
- Run connectivity checks from Mac Mini to Oracle API health endpoints.
- Confirm auth headers/tokens load from local secure env.

## 9) Test transcript workflow
- Run a single transcript ingestion job from Mac Mini.
- Confirm queued item appears in Supabase inbox tables.
- Confirm transcript parsing completes.

## 10) Test research artifact write
- Run one research-worker cycle.
- Validate row creation in `research_artifacts` and related tables.

## 11) Test strategy generation
- Run one strategy-builder cycle.
- Validate row creation in `strategy_library` and `strategy_runs`.
- Confirm ranking/proposal signal generation remains non-live.
