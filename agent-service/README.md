# AI Agent Testing Service

This service is part of the AI Agent Testing Suite. It provides a Python-based service that executes AI agent tests using CrewAI, handling agent configuration, test execution, and result collection.

## Status note

This Python `agent-service` implementation is currently out of date and needs TLC. For active development and production-like flows, prefer the TypeScript execution path (`backend` + `agent-service-api`) unless you are explicitly working on CrewAI internals.

## Overview

The service provides:

- Agent execution using CrewAI
- Test execution with configurable parameters
- Detailed logging of intermediate steps
- Metrics collection (token usage, model calls, etc.)

## Requirements

- Python 3.10 or higher
- pip (Python package installer)
- Ollama (for local LLM execution)

## Setup

1. Create a Python virtual environment:

```bash
# Navigate to the agent-service directory
cd agent-service

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Linux/Mac:
source venv/bin/activate
# On Windows:
.\venv\Scripts\activate
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Set up environment variables:

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env file with your configuration:
# - MODEL_PROVIDER_URL: URL of your model provider (optional for development)
# - MODEL_PROVIDER_API_KEY: Your API key (optional for development)
# - PORT: Service port (default: 5002)
# - HOST: Service host (default: 0.0.0.0)
```

4. Ensure Ollama is running:

The service currently uses Ollama for LLM execution. By default, it connects to `http://localhost:11434`. You can modify this in the `models.py` file or through environment variables.

## Running the Service

1. Activate virtual environment (if not already activated):

```bash
# On Linux/Mac:
source venv/bin/activate
# On Windows:
.\venv\Scripts\activate
```

2. Start the service:

```bash
# From the agent-service directory:
python run.py
```

The service will start on http://localhost:5002 (or your configured PORT).

## API Endpoints

### Health Check

```
GET /health
Response: { "status": "ok" }
```

### Execute Test

```
POST /execute-test
Body: {
  "agent_configs": [{
    "role": string,
    "goal": string,
    "backstory": string,
    "allow_delegation": boolean,
    "allow_code_execution": boolean,
    "memory": boolean,
    "verbose": boolean,
    "tools": string[],
    "llm_config": {
      "provider": string,
      "model": string,
      "temperature": number,
      "max_tokens": number,
      "base_url": string
    }
  }],
  "crew_config": {
    "process": "sequential" | "hierarchical",
    "async_execution": boolean,
    "max_retries": number
  },
  "test_input": string
}

Response: {
  "agent_id": number,
  "test_id": number,
  "output": string,
  "success": boolean,
  "execution_time": number,
  "intermediate_steps": [
    {
      "timestamp": string,
      "agent_id": number,
      "action": string,
      "output": string
    }
  ],
  "metrics": {
    "token_usage": number,
    "model_calls": number,
    "tool_calls": number
  }
}
```

## Testing the API

You can test the API using curl or any API client like Postman:

```bash
# Health check
curl http://localhost:5002/health

# Execute test
curl -X POST http://localhost:5002/execute-test \
  -H "Content-Type: application/json" \
  -d '{
    "agent_configs": [{
      "role": "Research Assistant",
      "goal": "Find accurate information",
      "backstory": "You are an AI research assistant helping with information gathering.",
      "allow_delegation": false,
      "allow_code_execution": false,
      "memory": false,
      "verbose": true,
      "tools": [],
      "llm_config": {
        "provider": "ollama",
        "model": "llama2",
        "temperature": 0.7,
        "max_tokens": 1000,
        "base_url": "http://localhost:11434"
      }
    }],
    "crew_config": {
      "process": "sequential",
      "async_execution": true,
      "max_retries": 3
    },
    "test_input": "What is the capital of France?"
  }'
```

## CrewAI Integration

This service uses CrewAI to create and manage AI agents. The main components are:

- **Agents**: Defined with roles, goals, and backstories
- **Tasks**: Work items assigned to agents
- **Crew**: A collection of agents working together on tasks

The service currently supports Ollama as the LLM provider, with plans to expand to other providers in the future.

## Development Notes

### TODO

- [ ] Implement non-blocking execution for long-running tests
    - Current implementation blocks until test completion
    - Future: Implement background task processing with status tracking
- [ ] Add tool configuration support beyond the basic list of tool names
- [ ] Implement proper test ID handling and tracking
- [ ] Add proper success criteria implementation (currently always returns true)
- [ ] Enhance multiple agent handling (currently only uses the first agent for tasks)
- [ ] Improve error handling and logging
- [ ] Add support for additional LLM providers beyond Ollama
- [ ] Fix async/non-async execution mismatch in the agent_executor.py
- [ ] Add configuration option for the default Ollama URL

## Project Structure

```
agent-service/
├── src/
│   ├── main.py          # FastAPI application entry point
│   ├── agent_executor.py # Core agent execution logic
│   ├── config.py        # Configuration handling
│   ├── models.py        # Data models
│   ├── config/          # Additional configuration files
│   └── models/          # Additional model definitions
├── tests/               # Test files
├── run.py               # Service entry point
├── requirements.txt     # Python dependencies
├── .env.example         # Example environment variables
└── README.md            # This file
```
