# Multi-Instance Deployment Guide

This guide explains how to deploy multiple instances of IBM VIBE on the same machine using PM2 process manager.

## Overview

The deployment system consists of:

- **Main script**: `start-instance.sh` - Starts/restarts all services for an instance
- **Helper scripts**: Stop, view logs, and check status of instances
- **Environment files**: Configuration for each instance (ports, database paths, etc.)

By default, `start-instance.sh` manages backend, agent-service-api, and frontend. The Python agent-service commands are present in the script but commented out.

## Prerequisites

1. **PM2 installed globally**:

    ```bash
    npm install -g pm2
    ```

2. **All dependencies installed**:

    ```bash
    # Install root dependencies (links workspaces)
    npm install

    # Agent Service (Python)
    cd agent-service && pip install -r requirements.txt && cd ..
    ```

## Port Allocation

| Instance  | Backend | Agent Service | Agent Service API | Frontend | Database                            |
| --------- | ------- | ------------- | ----------------- | -------- | ----------------------------------- |
| instance1 | 5100    | 5001          | 5003              | 3000     | `./data/agent-testing-instance1.db` |
| instance2 | 5010    | 5011          | 5013              | 3010     | `./data/agent-testing-instance2.db` |
| instance3 | 5020    | 5021          | 5023              | 3020     | `./data/agent-testing-instance3.db` |

`Agent Service` ports are reserved for the optional Python service if you enable it in `start-instance.sh`.

## Quick Start

### 1. Make scripts executable

```bash
chmod +x start-instance.sh stop-instance.sh logs-instance.sh status-instance.sh
```

### 2. Start an instance

```bash
# Create a local instance env file from the template (first time only)
cp env.instance1.example env.instance1

# Optional: create additional instance env files
cp env.instance1.example env.instance2
cp env.instance1.example env.instance3

# Edit env.instance2 and env.instance3 to use unique ports/DB paths before starting

# Start instance 1
./start-instance.sh env.instance1

# Start instance 2
./start-instance.sh env.instance2

# Start instance 3
./start-instance.sh env.instance3
```

### 3. Access your instances

- **Instance 1**: Frontend: <http://localhost:3000>, Backend: <http://localhost:5100>
- **Instance 2**: Frontend: <http://localhost:3010>, Backend: <http://localhost:5010>
- **Instance 3**: Frontend: <http://localhost:3020>, Backend: <http://localhost:5020>

## Script Usage

### start-instance.sh

Starts or restarts all services for a specific instance.

```bash
./start-instance.sh <env-file>
```

**Examples:**

```bash
./start-instance.sh env.instance1
./start-instance.sh env.instance2
./start-instance.sh env.instance3
```

**What it does:**

- Loads configuration from the environment file
- Checks if PM2 processes already exist
- Restarts existing processes or starts new ones
- Sets environment variables for each service
- Creates database directories if needed

### stop-instance.sh

Stops and removes all PM2 processes for a specific instance.

```bash
./stop-instance.sh <instance-name>
```

**Examples:**

```bash
./stop-instance.sh instance1
./stop-instance.sh instance2
./stop-instance.sh instance3
```

### logs-instance.sh

Shows logs for all services in a specific instance.

```bash
./logs-instance.sh <instance-name>
```

**Examples:**

```bash
./logs-instance.sh instance1
./logs-instance.sh instance2
./logs-instance.sh instance3
```

**Note:** Press `Ctrl+C` to exit the logs view.

### status-instance.sh

Shows detailed status of all services in a specific instance.

```bash
./status-instance.sh <instance-name>
```

**Examples:**

```bash
./status-instance.sh instance1
./status-instance.sh instance2
./status-instance.sh instance3
```

## PM2 Management

### View all running processes

```bash
pm2 list
```

### View logs for all processes

```bash
pm2 logs
```

### Stop all processes

```bash
pm2 stop all
```

### Restart all processes

```bash
pm2 restart all
```

### Delete all processes

```bash
pm2 delete all
```

### Save PM2 configuration

```bash
pm2 save
```

### Restore PM2 configuration on reboot

```bash
pm2 startup
```

## Environment File Configuration

Each instance has its own local environment file (e.g., `env.instance1`):

```bash
INSTANCE_NAME=instance1
BACKEND_PORT=5100
AGENT_SERVICE_PORT=5001
AGENT_SERVICE_API_PORT=5003
FRONTEND_PORT=3000
DB_PATH=./data/agent-testing-instance1.db
```

Use `env.instance1.example` as the committed template. Keep concrete `env.instance*` files local only.

### Creating a new instance

1. **Copy an existing environment file**:

    ```bash
    cp env.instance1.example env.instance4
    ```

2. **Edit the new file** with unique ports:

    ```bash
    INSTANCE_NAME=instance4
    BACKEND_PORT=5030
    AGENT_SERVICE_PORT=5031
    AGENT_SERVICE_API_PORT=5033
    FRONTEND_PORT=3030
    DB_PATH=./data/agent-testing-instance4.db
    ```

3. **Start the new instance**:

    ```bash
    ./start-instance.sh env.instance4
    ```

## Troubleshooting

### Port already in use

If you get a port conflict error:

1. Check what's using the port: `lsof -i :<port>`
2. Stop the conflicting service or change the port in the environment file
3. Restart the instance

### PM2 process not found

If a service fails to start:

1. Check the logs: `./logs-instance.sh <instance-name>`
2. Verify the service directory exists and has dependencies installed
3. Check if the port is available

### Database issues

If you get database errors:

1. Verify the database directory exists
2. Check file permissions
3. Ensure the database path in the environment file is correct

### Service won't start

Common issues:

1. **Backend**: Missing `npm install` or wrong working directory
2. **Agent Service**: Missing Python dependencies or wrong working directory
3. **Agent Service API**: Missing `npm install` or wrong working directory
4. **Frontend**: Missing `npm install` or wrong working directory

## Advanced Configuration

### Custom environment variables

You can add custom environment variables to your environment files:

```bash
# Add to env.instance1
CUSTOM_VAR=value
NODE_ENV=development
```

### Different database types

You can modify the database configuration in the environment files:

```bash
# SQLite (default)
DB_PATH=./data/agent-testing-instance1.db
```

### Load balancing

For production use, consider:

- Using a reverse proxy (nginx, haproxy)
- Implementing health checks
- Setting up monitoring and alerting
- Using PM2 cluster mode for better performance

## Security Considerations

1. **Port exposure**: Only expose necessary ports to external networks
2. **Database isolation**: Each instance has its own database file
3. **Environment variables**: Keep sensitive data in environment files, not in code
4. **Process isolation**: PM2 provides basic process isolation

## Performance Monitoring

### Monitor resource usage

```bash
pm2 monit
```

### View detailed metrics

```bash
pm2 show <process-name>
```

### Monitor system resources

```bash
htop
iotop
```

## Backup and Recovery

### Backup PM2 configuration

```bash
pm2 save
```

### Backup databases

```bash
# For SQLite
cp ./data/agent-testing-instance1.db ./backups/instance1-$(date +%Y%m%d).db

# For multiple instances
for instance in instance1 instance2 instance3; do
  cp ./data/agent-testing-${instance}.db ./backups/${instance}-$(date +%Y%m%d).db
done
```

### Restore from backup

```bash
# Stop the instance
./stop-instance.sh instance1

# Restore database
cp ./backups/instance1-20241201.db ./data/agent-testing-instance1.db

# Restart the instance
./start-instance.sh env.instance1
```

## Support

If you encounter issues:

1. Check the logs: `./logs-instance.sh <instance-name>`
2. Verify PM2 status: `pm2 list`
3. Check system resources: `htop`, `df -h`
4. Review the environment file configuration
5. Ensure all dependencies are properly installed
