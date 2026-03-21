# Mac Mini Worker Framework - Transfer & Deploy Guide

## 📦 What's In The Bundle

File: `mac-mini-worker-bundle.tar.gz` (0.01 MB - source code only)

Contains:
```
mac-mini-worker/
├── package.json
├── .env (production credentials)
├── .env.example
├── README.md
├── src/
│   ├── mac-mini-worker.js (main worker pool)
│   ├── lib/
│   │   ├── supabase.js (Supabase client)
│   │   ├── logger.js (structured logging)
│   │   └── job-queue-client.js (queue operations)
│   ├── workers/
│   │   ├── index.js (handler registry)
│   │   └── sentiment_triage.js (first handler)
│   └── test/
│       └── test-worker-flow.js (integration tests)
└── extract-worker.sh (setup script)
```

## 🚀 Transfer to Mac Mini

### Option 1: AirDrop (Easiest)
1. On Windows: Navigate to `C:\Users\raysc\AFinalChapter\`
2. Right-click `mac-mini-worker-bundle.tar.gz` → AirDrop
3. Select Mac Mini
4. Mac Mini accepts and saves to Downloads

### Option 2: Cloud Transfer
1. Upload to Dropbox/OneDrive/iCloud Drive
2. Download on Mac Mini
3. Move to home directory: `mv ~/Downloads/mac-mini-worker-bundle.tar.gz ~/`

### Option 3: USB Stick
1. Copy `mac-mini-worker-bundle.tar.gz` to USB
2. Plug into Mac Mini
3. Copy to home directory: `~/mac-mini-worker-bundle.tar.gz`

---

## ⚙️ Installation on Mac Mini

Once you have `mac-mini-worker-bundle.tar.gz` on the Mac Mini:

### Step 1: Extract
```bash
# Navigate to your projects directory
cd ~

# Extract the archive
tar -xzf mac-mini-worker-bundle.tar.gz

# Verify
ls -la mac-mini-worker/
```

### Step 2: Install Dependencies
```bash
cd mac-mini-worker

# Install Node.js packages
npm install --legacy-peer-deps

# This will take ~30 seconds and download 253 packages
```

### Step 3: Verify Setup
```bash
# Test the framework
npm run test:queue

# You should see:
# ✅ ALL TESTS PASSED
# Mac Mini worker framework is ready!
```

### Step 4: Start the Worker
```bash
# Start polling for jobs
npm start

# You should see:
# [INFO] [MacMiniWorker] Worker starting
# Supported job types: sentiment_triage, neural_scout_batch, ...
# ✅ Worker pool started successfully
```

---

## 🔍 Verify It's Working

In VS Code terminal on Mac Mini, you should see output like:

```
[INFO] [MacMiniWorker] Worker starting {"worker_id":"mac-mini-worker-1","pool_size":2,"supported_job_types":["sentiment_triage","neural_scout_batch","scenario_runner","grants_matcher","content_factory"]}
[INFO] [MacMiniWorker] ✅ Worker pool started successfully
[INFO] [JobQueueClient] job_leased {"event":"job_leased","job_id":"...","job_type":"sentiment_triage",...}
[INFO] [sentiment_triage] sentiment_triage_started {...}
[INFO] [sentiment_triage] sentiment_triage_completed {"job_id":"...","sentiment":"negative",...}
[INFO] [JobQueueClient] job_finished {...}
```

Every 5 seconds = polling loop working
Every 30 seconds = heartbeat emission

---

## 🛑 Stop the Worker

```bash
# Press Ctrl+C in the terminal
# Worker will gracefully shutdown (waits up to 30 seconds for jobs)
```

---

## 📊 Monitor What's Happening

The worker sends its status to Supabase. You can monitor:

### 1. **Job Processing**
```sql
-- Check recent jobs processed
SELECT id, job_type, status, worker_id, created_at 
FROM job_queue 
WHERE worker_id = 'mac-mini-worker-1' 
ORDER BY created_at DESC 
LIMIT 10;
```

### 2. **Worker Heartbeats**
```sql
-- See worker health
SELECT worker_id, status, current_job_id, concurrent_jobs, memory_usage_mb, emitted_at 
FROM worker_heartbeats 
WHERE worker_id = 'mac-mini-worker-1' 
ORDER BY emitted_at DESC 
LIMIT 20;
```

### 3. **Result Tracking**
```sql
-- See completed jobs
SELECT job_id, job_type, status, execution_time_ms, completed_at 
FROM job_results 
WHERE worker_id = 'mac-mini-worker-1' 
ORDER BY completed_at DESC 
LIMIT 10;
```

---

## ⚙️ Configuration

Edit `mac-mini-worker/.env` to customize:

```bash
# Polling frequency (milliseconds)
JOB_POLL_INTERVAL_MS=5000          # Check for jobs every 5 seconds

# Worker capacity
WORKER_POOL_SIZE=2                 # Run 2 jobs concurrently (1-8)

# Heartbeat frequency (milliseconds)
HEARTBEAT_INTERVAL_MS=30000        # Send status every 30 seconds

# Logging level
LOG_LEVEL=info                     # Options: debug, info, warn, error
```

---

## 🔧 Troubleshooting

### "Node.js not found"
```bash
# Install Node.js v20+
# Visit: https://nodejs.org/
# Or use Homebrew: brew install node
```

### "Cannot find module '@supabase/supabase-js'"
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

### "No jobs being processed"
1. Check `.env` has correct `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
2. Verify jobs exist in Supabase: `SELECT * FROM job_queue WHERE status='pending';`
3. Check logs for errors: `LOG_LEVEL=debug npm start`

### "Connection timeout to Supabase"
1. Verify Mac Mini has internet access
2. Check Supabase credentials are correct
3. Try VPN if on corporate network

---

## 🎯 Next Steps

1. ✅ Extract and install on Mac Mini
2. ✅ Run `npm run test:queue` to verify
3. ✅ Run `npm start` to begin polling
4. 📊 Monitor worker in Supabase
5. 🔌 Keep Mac Mini running 24/7 for continuous job processing
6. 📈 Scale by running multiple workers (change WORKER_ID in .env)

---

## 📝 Notes

- Worker will automatically retry failed jobs with exponential backoff
- Jobs are leased for 60 seconds - if worker crashes, job returns to queue
- First handler (sentiment_triage) uses heuristic matching - ready for Gemini API hookup
- Framework logs JSON for easy parsing and monitoring
- Worker gracefully shuts down on SIGINT/SIGTERM

Enjoy! 🚀
