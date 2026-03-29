# Mac Mini Worker - Quick Reference Card

## 📍 File Location on Windows
```
C:\Users\raysc\AFinalChapter\mac-mini-worker-bundle.tar.gz (0.01 MB)
```

## 🚀 Transfer Methods (Pick One)
- **AirDrop**: Right-click file → AirDrop → Select Mac Mini
- **Dropbox**: Upload to cloud, download on Mac Mini
- **USB**: Copy to USB stick, plug into Mac Mini

## 💻 Commands on Mac Mini (Paste Exactly)

```bash
# Extract archive
cd ~
tar -xzf mac-mini-worker-bundle.tar.gz
cd mac-mini-worker

# Install dependencies
npm install --legacy-peer-deps

# Test it works
npm run test:queue

# Start the worker (will run continuously)
npm start

# Stop the worker
# Press Ctrl+C
```

## ✅ Success Indicators

**After `npm run test:queue`:**
```
✅ ALL TESTS PASSED
Mac Mini worker framework is ready!
```

**After `npm start`:**
```
[INFO] [MacMiniWorker] Worker starting
[INFO] [MacMiniWorker] ✅ Worker pool started successfully
```

**Workers is polling:**
- Every 5 seconds → logs about job availability
- Every 30 seconds → heartbeat emitted
- When job arrives → processes and logs results

## 📁 Archive Contents

- 10 source files (no dependencies, lightweight)
- package.json with npm scripts
- Production .env with Supabase credentials
- Complete README.md inside archive
- Integration tests included

## ⚡ Quick Facts

- **Size**: 0.01 MB (source code only, no node_modules)
- **Setup Time**: ~30 seconds (npm install)
- **Node Requirement**: v20+ (check with: node --version)
- **Runtime**: Lightweight, <100 MB memory typical
- **Job Processing**: Heuristic (no API calls yet)
- **Supported Jobs**: sentiment_triage + 4 placeholders

## 📞 File Reference Inside Archive

For the three long source files, detailed content is in:
- `src/lib/job-queue-client.js` (291 lines)
- `src/workers/sentiment_triage.js` (213 lines)  
- `src/mac-mini-worker.js` (180 lines)

All files are documented with comments.

---

**Ready to transfer?** Use AirDrop or your preferred method above.
