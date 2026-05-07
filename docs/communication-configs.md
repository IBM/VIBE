# Communication configs: request templates, response maps, and variables

This document describes how VIBE models and resolves communication configs for External API agents.

## Data model

- Global request templates: `request_templates`
    - Core fields: `id`, `name`, `description`, `capability`, `body`, `created_at`
- Global response maps: `response_maps`
    - Core fields: `id`, `name`, `description`, `capability`, `spec`, `created_at`
- Agent linkage tables:
    - `agent_template_links` (`agent_id`, `template_id`, `is_default`, `linked_at`)
    - `agent_response_map_links` (`agent_id`, `response_map_id`, `is_default`, `linked_at`)
- Conversation fields used during execution:
    - `default_request_template_id` and `default_response_map_id` (legacy-compatible defaults)
    - `required_request_template_capabilities`, `required_response_map_capabilities`
    - `variables` (JSON string)
    - `stop_on_failure`
- Conversation message fields:
    - `request_template_id`, `response_map_id`, `set_variables`, `metadata`
- Execution session fields:
    - `variables` (JSON snapshot of accumulated variables after execution)

## Selection logic

For each user message, template/map selection uses:

1. Message override (`request_template_id` / `response_map_id`)
2. Conversation default (`default_request_template_id` / `default_response_map_id`)
3. Agent default link (`is_default = 1`)

The resolver writes effective `request_template` and `response_mapping` into per-message metadata before execution.

## Request templates

Template `body` is a JSON string with placeholders:

- `{{input}}` - current user input (or full history in history-first mode)
- `{{conversation_history}}` - formatted transcript history
- `{{myVar}}`, `{{a.b.c}}`, `{{users[0].name}}` - variable lookups

## Response maps

`spec` is a JSON string. Common fields:

```json
{
	"output": "choices.0.message.content",
	"intermediate_steps": "usage",
	"variables": {
		"responseId": "id"
	},
	"success_criteria": {
		"type": "contains",
		"value": "success"
	}
}
```

- Path extraction supports dot and bracket notation.
- `variables` extracted from responses are accumulated across turns.
- `success_criteria` supports `contains`, `exact_match`, and `json_match`.

## Variable resolution behavior

Two stages are involved:

1. **Script resolution stage**  
   `conversation.variables` and per-message `set_variables` are merged into message metadata (`variables` payload).

2. **Execution stage**  
   For each user turn, variable values beginning with `$.` are resolved against a context object (`lastRequest`, `lastResponse`, `variables`, `conversation`, `message`, `request`, `transcript`).

Final merge for each turn is:

- base: accumulated variables from prior turns
- overlay: resolved message variables

The resulting accumulated variable map is persisted to `execution_sessions.variables`.

## Capability requirements

If a conversation declares required request/response capabilities, execution validates that the selected template/map capabilities satisfy those requirements before continuing.

## Migration notes

Legacy `agents.settings.request_template` and `agents.settings.response_mapping` are migrated through database migrations into template/map tables and agent link tables, then removed from agent settings.

## UI surface

- Agent detail communication section: manage and link templates/maps, set defaults, preview rendering.
- Conversation builder: define conversation variables and per-message overrides.
- Session views: include metadata showing template/map usage and resolved token/variable details.
