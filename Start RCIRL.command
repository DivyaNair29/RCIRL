#!/bin/bash
cd "$(dirname "$0")"
echo "Starting RCIRL..."
echo "(closing this window will stop the app)"
echo
python3 run_local.py
