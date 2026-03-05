# Prompt Library

Use prompt IDs from `prompts/index.json` instead of embedding large system prompts repeatedly.

## Pattern
- `domain.name.vN`
- Version bump for any non-backward-compatible prompt behavior change.

## Usage
1. Client sends `prompt_id` to server-side AI endpoint.
2. Server resolves ID via `netlify/functions/_shared/prompt_library.ts`.
3. Server injects the resolved prompt text into model config.
