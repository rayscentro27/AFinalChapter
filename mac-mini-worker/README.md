# Nexus Mac Mini Worker

Autonomous worker pool for Nexus CRM. Runs on Mac Mini backend, executes long-running async jobs, and coordinates with production Supabase backend.

## Architecture

```
Production App (goclearonline.cc)      Mac Mini Worker
──────────────────────────────         ───────────────
User creates message/job     ──→       Queue: job_queue
                                       ↓
                                    Polling loop (5s)
                                    Job claim → Execute
                                       ↓
Result displayed in UI        ←──    Store in Supabase
```

## Setup

### 1. Install Dependencies

```bash
cd mac-mini-worker
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env`:
```env
SUPABASE_URL=https://ftxbphwlqskimdnqcfxh.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
WORKER_ID=mac-mini-worker-1
WORKER_POOL_SIZE=2
```

### 3. Start the Worker

```bash
npm start
```

Output:
```
[INFO] [MacMiniWorker] Worker starting
  worker_id: mac-mini-worker-1
  pool_size: 2
  supported_job_types: sentiment_triage,neural_scout_batch,scenario_runner,...
✅ Worker pool started successfully
```

### 4. Test the Framework

In another terminal:

```bash
npm run test:queue
```

This will:
1. Connect to production Supabase
2. Create a test message and job
3. Claim and execute the job
4. Verify the result was stored

## Supported Job Types

### sentiment_triage (✅ Complete)
- Analyzes inbound messages
- Classifies sentiment, intent, urgency
- Updates message table with enrichment

**Input:**
```json
{
  "job_type": "sentiment_triage",
  "payload": {
    "message_id": "uuid",
    "conversation_id": "uuid",
    "provider": "twilio"
  }
}
```

**Output:** `messages.ai_sentiment`, `messages.ai_intent`, `messages.ai_urgency`

### neural_scout_batch (🔄 Coming)
Research contacts and opportunities

### scenario_runner (🔄 Coming)
Execute sales roleplay scenarios

### grants_matcher (🔄 Coming)
Research grant opportunities

### content_factory (🔄 Coming)
Generate content templates

## Architecture

### Job Execution Flow

```javascript
Job in Supabase job_queue (status=pending)
  ↓
Worker polls job_queue every 5 seconds
  ↓
Job found: Worker claims it (status=claimed)
  ↓
Worker executes handler async
  ↓
Handler updates Supabase tables
  ↓
Worker marks job complete (status=complete)
  ↓
Worker emits job_results record
  ↓
Production app polls job_results, displays to user
```

### Concurrency Model

- Worker pool size: configurable (default 2 concurrent jobs)
- Job claiming: atomic (Supabase UPDATE with WHERE)
- Leasing: 60-second lease on claimed jobs (auto-requeue if worker dies)
- Retries: exponential backoff (5s, 10s, 20s, ...) up to 5 attempts

### Failure Handling

If a job fails:
1. Worker logs error to job_queue.error
2. Retry count incremented
3. If < 5 attempts: scheduled for retry with exponential backoff
4. If >= 5 attempts: marked as failed permanently
5. Admin dashboard alerted

## Monitoring

### Worker Health

Worker emits heartbeat every 30 seconds:
- Worker ID
- Status (idle/processing)
- Current job (if any)
- Memory usage
- Concurrent job count

Query heartbeats from admin dashboard:
```sql
SELECT * FROM worker_heartbeats 
WHERE worker_id = 'mac-mini-worker-1' 
ORDER BY emitted_at DESC 
LIMIT 10;
```

### Job Status

Track any job:
```sql
SELECT * FROM job_queue WHERE id = '...';
SELECT * FROM job_results WHERE job_id = '...';
```

## Development

### Add a New Job Handler

1. Create file in `src/workers/my_handler.js`:

```javascript
export async function handleMyHandler(job, context) {
  const { logger, worker_id, supabaseAdmin } = context;
  
  logger.info({ job_id: job.id }, 'Starting my_handler');
  
  // Do work here
  const result = { status: 'success', data: ... };
  
  return result;
}
```

2. Register in `src/workers/index.js`:

```javascript
import { handleMyHandler } from './my_handler.js';

export const handlers = {
  sentiment_triage: handleSentimentTriage,
  my_handler: handleMyHandler,  // ← Add here
  ...
};
```

3. Production app can now create jobs of type `my_handler`

### Logging

Configure log level in `.env`:
```env
LOG_LEVEL=debug  # debug, info, warn, error
```

## Production Deployment

### Option 1: Standalone Process (Current)
```bash
npm start
# Runs continuously, polls Supabase every 5 seconds
```

### Option 2: Systemd Service (Recommended)
```bash
sudo cp systemd/nexus-worker.service /etc/systemd/system/
sudo systemctl enable nexus-worker
sudo systemctl start nexus-worker
```

### Option 3: Docker
```bash
docker build -t nexus-worker .
docker run -d --env-file .env nexus-worker npm start
```

## Troubleshooting

### Worker won't start
```
❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY
```
→ Check `.env` file, copy from `.env.example`

### Jobs stuck in "claimed" status
→ Worker died without marking job complete
→ After 60 seconds, job auto-requeued (leasing mechanism)
→ Check worker heartbeats - Is worker alive?

### Job execution slow
→ Check memory usage in heartbeats
→ Increase WORKER_POOL_SIZE if CPU available
→ Profile handler with `NODE_DEBUG=*`

## Files

```
mac-mini-worker/
├── src/
│   ├── mac-mini-worker.js         # Main entry, worker pool
│   ├── lib/
│   │   ├── supabase.js            # Supabase client
│   │   ├── logger.js              # Logging
│   │   └── job-queue-client.js    # Job claiming, heartbeats
│   ├── workers/
│   │   ├── index.js               # Handler registry
│   │   └── sentiment_triage.js    # Sentiment enrichment
│   └── test/
│       └── test-worker-flow.js    # Integration test
├── .env.example
├── package.json
└── README.md
```

## License

Proprietary - Nexus CRM
