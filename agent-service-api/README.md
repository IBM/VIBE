# External API Agent Service

This service provides a gateway to execute tests against external AI agent APIs.

## Overview

The External API Agent Service is designed to connect to any external agent API, format requests according to specified templates, and map responses back into a standardized format for the AI Agent Testing Suite.

## Setup

1. Install dependencies in the project root (required for shared types):

    ```bash
    # In project root
    npm install
    ```

2. Configure environment variables:
   Copy `.env.example` to `.env` in the `agent-service-api` directory:

    ```bash
    # In agent-service-api directory
    cd agent-service-api
    cp .env.example .env
    ```

    Adjust settings in `.env` as needed.

3. Build the service:

    ```bash
    npm run build
    ```

4. Start the service:

    ```bash
    npm start
    ```

For development, use:

```bash
npm run dev
```

## API Endpoints

### Health Check

```http
GET /health
```

Returns status 200 with `{ status: "ok" }` if the service is running.

### Execute Test

**Note**: The service also automatically polls the backend for jobs and executes them. This is the primary method of execution when integrated with the full testing suite.

```http
POST /execute-test
```

Request body:

```json
{
	"test_input": "The user's input to test",
	"test_id": 123,
	"api_endpoint": "https://api.example.com/chat",
	"api_key": "optional-api-key",
	"http_method": "POST",
	"request_template": "{\"messages\": [{\"role\": \"user\", \"content\": \"{{input}}\"}]}",
	"response_mapping": "{\"output\": \"choices.0.message.content\", \"intermediate_steps\": \"usage\"}",
	"token_mapping": "{\"input_tokens\": \"usage.prompt_tokens\", \"output_tokens\": \"usage.completion_tokens\"}",
	"headers": {
		"custom-header": "value"
	}
}
```

Response:

```json
{
	"test_id": 123,
	"output": "Response from the API",
	"success": true,
	"execution_time": 1234,
	"intermediate_steps": [
		{
			"timestamp": "2025-04-01T00:00:00.000Z",
			"action": "API Call Initiated",
			"output": "Calling https://api.example.com/chat"
		},
		{
			"timestamp": "2025-04-01T00:00:01.000Z",
			"action": "API Response Received",
			"output": "Response received from external API"
		}
	],
	"metrics": {
		"execution_time": 1234,
		"input_tokens": 150,
		"output_tokens": 75
	}
}
```

## Request Template

The `request_template` field allows you to specify how to format the test input for the external API. Use `{{input}}` as a placeholder for the test input. For conversations, you can also use `{{conversation_history}}`. Arbitrary variables may be injected via `{{variableName}}` when provided in the per-message metadata or conversation defaults. Variable paths support dot notation and bracket notation (e.g., `{{users[0].name}}` or `{{data['key']}}`):

```json
{
	"messages": [
		{ "role": "system", "content": "You are a helpful assistant." },
		{ "role": "user", "content": "{{input}}" },
		{ "role": "system", "content": "History:\n{{conversation_history}}" },
		{ "role": "system", "content": "Request id: {{requestId}}" }
	],
	"temperature": 0.7
}
```

## Response Mapping

The `response_mapping` field specifies how to extract data from the API response.
You can also extract variables from the response to be made available to subsequent turns:

```json
{
	"output": "choices.0.message.content",
	"intermediate_steps": "usage",
	"variables": {
		"responseId": "id",
		"firstToolCall": "tool_calls[0].name"
	},
	"success_criteria": {
		"type": "contains",
		"value": "correct answer"
	}
}
```

- `output`: Path to the main output text
- `intermediate_steps`: Path to additional data for intermediate steps
- `success_criteria`: Optional criteria to determine success

Success criteria types:

- `contains`: Check if output contains a value
- `exact_match`: Check if output exactly matches a value
- `json_match`: Check if a specific field in the response matches a value using comparison operators

For `json_match`, the following operators are supported: `==`, `===`, `!=`, `!==`, `>`, `>=`, `<`, `<=`

## Error Handling

The service returns a standardized error format:

```json
{
	"error": "Failed to execute test",
	"details": "Specific error message"
}
```

## Advanced Configuration

### Timeout Settings

The service has a default timeout of 60 seconds for API calls. You can configure this in the `.env` file:

```env
DEFAULT_TIMEOUT=60000
```

### HTTP Method

The service supports different HTTP methods for API calls. Specify the `http_method` field in your request:

- `GET`: Query parameters are appended to the URL
- `POST` (default): Request body is sent as JSON
- `PUT`, `PATCH`, `DELETE`: Also supported

### Token Mapping

The service can automatically extract token usage from API responses. You can provide a `token_mapping` configuration:

```json
{
	"token_mapping": "{\"input_tokens\": \"usage.prompt_tokens\", \"output_tokens\": \"usage.completion_tokens\"}"
}
```

If no mapping is provided, the service will attempt to detect token usage using common formats (OpenAI, Anthropic, Google, Cohere, Ollama, LangChain).

### Authentication

The service supports various authentication methods:

1. **API Key in Authorization Header**:

    ```json
    {
    	"api_key": "your-api-key"
    }
    ```

    This will be sent as `Authorization: Bearer your-api-key`

2. **Custom Headers**:

    ```json
    {
    	"headers": {
    		"X-API-Key": "your-api-key",
    		"Custom-Auth": "custom-value"
    	}
    }
    ```

### Advanced Response Mapping

#### Nested JSON Paths

You can use dot notation to access nested properties:

```json
{
	"output": "data.results.0.text",
	"intermediate_steps": "data.metadata.steps"
}
```

#### Array Mapping

For array responses, you can map specific elements:

```json
{
	"output": "responses[0].text",
	"intermediate_steps": "responses[0].steps"
}
```

#### Success Criteria with JSON Path

For complex success validation:

```json
{
	"success_criteria": {
		"type": "json_match",
		"path": "data.status",
		"operator": "===",
		"value": "completed"
	}
}
```

### Conversation Execution metadata

When executing conversations, the service supports per-message overrides via the `metadata` of each scripted message:

```json
{
	"sequence": 2,
	"role": "user",
	"content": "hello",
	"metadata": {
		"request_template": "{\"model\":\"gpt-5\",\"messages\":[{\"role\":\"user\",\"content\":\"{{input}}\"}],\"temperature\":0.7}",
		"response_mapping": "{\"output\":\"choices.0.message.content\",\"variables\":{\"replyLen\":\"choices.0.message.content.length\"}}",
		"variables": {
			"requestId": "abc-123",
			"sessionRef": "$.lastResponse.id"
		}
	}
}
```

Notes:

- `variables` supports literal values; values starting with `$.` are resolved against a context object including `lastRequest`, `lastResponse`, and the current `conversation`.
- Variables extracted via `response_mapping.variables` are accumulated across turns and available to subsequent messages.

## Example Configurations

### OpenAI API

```json
{
	"api_endpoint": "https://api.openai.com/v1/chat/completions",
	"api_key": "sk-...",
	"request_template": "{\"model\": \"gpt-4o\", \"messages\": [{\"role\": \"user\", \"content\": \"{{input}}\"}], \"temperature\": 0.7}",
	"response_mapping": "{\"output\": \"choices.0.message.content\", \"intermediate_steps\": \"usage\", \"success_criteria\": {\"type\": \"contains\", \"value\": \"answer\"}}",
	"headers": {
		"Content-Type": "application/json"
	}
}
```

### Anthropic Claude API

```json
{
	"api_endpoint": "https://api.anthropic.com/v1/messages",
	"api_key": "sk-ant-...",
	"request_template": "{\"model\": \"claude-3.7-sonnet\", \"max_tokens\": 1024, \"messages\": [{\"role\": \"user\", \"content\": \"{{input}}\"}]}",
	"response_mapping": "{\"output\": \"content.0.text\", \"intermediate_steps\": \"usage\", \"success_criteria\": {\"type\": \"contains\", \"value\": \"answer\"}}",
	"headers": {
		"Content-Type": "application/json"
	}
}
```

### Custom API with Intermediate Steps

```json
{
	"api_endpoint": "https://api.example.com/agent",
	"request_template": "{\"query\": \"{{input}}\", \"include_steps\": true}",
	"response_mapping": "{\"output\": \"final_response\", \"intermediate_steps\": \"reasoning_steps\", \"success_criteria\": {\"type\": \"json_match\", \"path\": \"status\", \"operator\": \"===\", \"value\": \"success\"}}"
}
```

## Troubleshooting

### Common Issues

1. **Timeout Errors**: Increase the `DEFAULT_TIMEOUT` value in your environment configuration.

2. **Authentication Failures**: Verify your API key and ensure it's being sent correctly in the headers.

3. **Response Mapping Errors**: Check that your JSON paths match the actual structure of the API response.

4. **Template Formatting Issues**: Ensure your request template is valid JSON with proper escaping.

### Debugging

For local debugging:

- Run with `npm run dev` and inspect terminal output.
- Check backend logs alongside this service to trace job claim/update flows.
- Use focused tests under `src/services/__tests__/` for request formatting, response mapping, and conversation execution behavior.
