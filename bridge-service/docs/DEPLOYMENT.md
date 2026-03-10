# Deployment Guide

Two deployment options: start with Option A for testing, move to Option B for production.

## Setup Recommendations

- **Xray "Executed By"**: Create a Jira service account (e.g. "Postman Bridge Bot") and generate the Xray API key from that account. All test executions will show this account as the executor instead of a personal account.

---

## Option A: EC2 with Docker Compose

Everything runs on a single EC2 instance. Quick to set up, good for testing.

### Prerequisites
- EC2 instance (t3.small or larger)
- Docker and Docker Compose installed
- Outbound internet access (to reach Postman API, Xray API, Jira)

### Steps

```bash
# 1. Clone the repo
git clone <repo-url>
cd bridge-service

# 2. Configure
cp .env.example .env
# Edit .env with your credentials

# 3. Start everything (bridge service + Postgres)
docker-compose up -d

# 4. Initialize the database (first time only)
docker-compose exec bridge npx prisma db push

# 5. Verify
curl http://localhost:3003/health

# 6. Test a sync
curl -X POST http://localhost:3003/sync/run \
  -H "Content-Type: application/json" \
  -d '{"workspaceId": "your-workspace-id"}'
```

### Logs

```bash
# View bridge service logs
docker-compose logs -f bridge

# View database logs
docker-compose logs -f db
```

### Updating

```bash
git pull
docker-compose build bridge
docker-compose up -d
```

### Data persistence

Postgres data is stored in a Docker volume (`pgdata`). Data survives container restarts and EC2 stop/start. If the EC2 instance is terminated, the volume is lost -- but the only data stored is sync state (which run was last synced). If lost, runs will simply re-sync.

---

## Option B: ECS Fargate + RDS

Production-grade setup with managed containers and database. Auto-restart, backups, no server management.

### Prerequisites
- AWS account with VPC and at least 2 subnets in different AZs
- Docker image pushed to ECR
- AWS CLI configured

### Step 1: Push Docker image to ECR

```bash
# Create ECR repository
aws ecr create-repository --repository-name bridge-service

# Login, build, push
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
docker build -t bridge-service .
docker tag bridge-service:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/bridge-service:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/bridge-service:latest
```

### Step 2: Deploy CloudFormation stack

```bash
aws cloudformation create-stack \
  --stack-name bridge-service \
  --template-body file://infra/cloudformation.yml \
  --capabilities CAPABILITY_IAM \
  --parameters \
    ParameterKey=VpcId,ParameterValue=vpc-xxx \
    ParameterKey=SubnetIds,ParameterValue="subnet-aaa,subnet-bbb" \
    ParameterKey=ImageUri,ParameterValue=<account-id>.dkr.ecr.us-east-1.amazonaws.com/bridge-service:latest \
    ParameterKey=XrayClientId,ParameterValue=your-xray-client-id \
    ParameterKey=XrayClientSecret,ParameterValue=your-xray-client-secret \
    ParameterKey=PostmanApiKey,ParameterValue=PMAK-xxx \
    ParameterKey=PostmanWorkspaceIds,ParameterValue=your-workspace-id \
    ParameterKey=DbPassword,ParameterValue=your-db-password
```

### Step 3: Initialize database

```bash
# Connect to the running ECS task and run migration
# Or connect to RDS directly and run the schema
aws ecs execute-command --cluster bridge-service --task <task-id> \
  --container bridge-service --interactive \
  --command "npx prisma db push"
```

### What CloudFormation provisions
- **ECS Fargate cluster** with 1 task (256 CPU, 512 MB)
- **RDS PostgreSQL 15** (db.t3.micro, 20GB, encrypted, 7-day backups)
- **Security groups** (ECS can reach RDS; port 3003 open for HTTP)
- **CloudWatch log group** (30-day retention)

### Updating

```bash
# Build and push new image
docker build -t bridge-service .
docker tag bridge-service:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/bridge-service:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/bridge-service:latest

# Force new deployment
aws ecs update-service --cluster bridge-service --service <service-name> --force-new-deployment
```
