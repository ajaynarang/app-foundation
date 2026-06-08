#!/bin/bash
# scripts/setup-osrm.sh
# Downloads and prepares US road data for OSRM
# Run once, data persists in Docker volume
#
# The route planning engine falls back to haversine estimates
# when OSRM is not running, so this is optional.

set -e

echo "=== OSRM Setup for SALLY ==="
echo ""
echo "This will download US Midwest road data from OpenStreetMap"
echo "and prepare it for the OSRM routing engine."
echo ""
echo "Requirements: ~5GB disk space, 15-30 minutes"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo "Creating Docker volume..."
docker volume create osrm-data

echo ""
echo "Downloading US Midwest region from Geofabrik..."
docker run --rm -v osrm-data:/data alpine wget -O /data/us-midwest-latest.osm.pbf \
  https://download.geofabrik.de/north-america/us/midwest-latest.osm.pbf

echo ""
echo "Extracting road network (this takes a while)..."
docker run --rm -v osrm-data:/data osrm/osrm-backend \
  osrm-extract -p /opt/car.lua /data/us-midwest-latest.osm.pbf

echo ""
echo "Partitioning..."
docker run --rm -v osrm-data:/data osrm/osrm-backend \
  osrm-partition /data/us-midwest-latest.osrm

echo ""
echo "Customizing..."
docker run --rm -v osrm-data:/data osrm/osrm-backend \
  osrm-customize /data/us-midwest-latest.osrm

echo ""
echo "=== OSRM Setup Complete ==="
echo ""
echo "Start OSRM with:"
echo "  docker compose -f docker-compose.yml -f docker-compose.osrm.yml up osrm"
echo ""
echo "Test it with:"
echo "  curl 'http://localhost:5000/route/v1/driving/-87.6298,41.8781;-90.0715,29.9511?overview=false'"
echo ""
echo "The route planning engine will automatically use OSRM when available."
