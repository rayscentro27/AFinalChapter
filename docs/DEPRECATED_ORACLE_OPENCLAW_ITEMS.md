# Deprecated: Oracle-Hosted OpenClaw Items

## Decision
Oracle-hosted OpenClaw operations are deprecated. OpenClaw now targets Mac Mini.

## Repo Audit Result
No active Oracle-only OpenClaw bootstrap scripts, Bastion installers, or Oracle-only OpenClaw systemd unit files were found in this repository.

## Deprecated / Updated Assumptions
- Prompt library file updated:
  - `nexus-codex-prompts/nexus-codex-prompts/prompt_16_1_bot_ownership_emergency_controls.txt`
- Change made:
  - Oracle-VM OpenClaw ownership language replaced with dedicated AI operations machine language.

## Kept Intact (still valid)
- Nexus API integration code
- Supabase schemas and research/strategy/signal data models
- Control-panel and backend integration assumptions
