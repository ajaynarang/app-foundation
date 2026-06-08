#!/bin/bash

# Script to kill process running on a specific port
# Usage: ./kill-port.sh <port_number>

if [ -z "$1" ]; then
    echo "Usage: ./kill-port.sh <port_number>"
    echo "Example: ./kill-port.sh 3000"
    exit 1
fi

PORT=$1

# Find the process ID using the port
PID=$(lsof -ti:$PORT)

if [ -z "$PID" ]; then
    echo "No process found running on port $PORT"
    exit 0
fi

echo "Found process $PID running on port $PORT"
echo "Killing process..."

# Kill the process
kill -9 $PID

if [ $? -eq 0 ]; then
    echo "Successfully killed process $PID on port $PORT"
else
    echo "Failed to kill process. You may need to run with sudo:"
    echo "sudo ./kill-port.sh $PORT"
    exit 1
fi
