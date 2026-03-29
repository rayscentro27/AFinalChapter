#!/usr/bin/env python3
# mac-mini-worker/content_pipeline.py
# Nova Media Worker: Orchestrates content pipeline for short-form/training video assets
# Reads/writes status and outputs to Supabase
# Provider logic is pluggable and free/low-cost-first

import os
import sys
import time
import subprocess
import requests

SUPABASE_URL = os.getenv('SUPABASE_URL', 'https://your-supabase-url.supabase.co')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', 'your-service-role-key')

HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
}

def poll_content_requests():
    resp = requests.get(f"{SUPABASE_URL}/rest/v1/content_requests?status=eq.draft", headers=HEADERS)
    if resp.status_code == 200:
        return resp.json()
    return []

def update_request_status(request_id, status):
    requests.patch(f"{SUPABASE_URL}/rest/v1/content_requests?id=eq.{request_id}",
                   headers=HEADERS, json={"status": status})

def main():
    while True:
        requests_list = poll_content_requests()
        for req in requests_list:
            print(f"Processing request: {req['id']} topic: {req['topic']} channel: {req['channel']}")
            update_request_status(req['id'], 'in_progress')
            # 1. Script Generation
            subprocess.run(["../scripts/generate_script.sh", req['topic'], req['channel']])
            # 2. Transcript Generation
            subprocess.run(["../scripts/generate_transcript.sh", "output_script.txt"])
            # 3. Asset Generation (stub)
            # TODO: Add asset generation logic
            # 4. Video Assembly
            subprocess.run(["../scripts/assemble_video.sh", "output_transcript.txt", "assets", "output_video.txt"])
            # 5. Review
            subprocess.run(["../scripts/review_content.sh", "output_video.txt"])
            # 6. Update Supabase with output (stub)
            update_request_status(req['id'], 'needs_review')
        time.sleep(30)

if __name__ == "__main__":
    main()
