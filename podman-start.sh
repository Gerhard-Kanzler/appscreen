#!/bin/bash
set -e

ACTION="${1:-up}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

case "$ACTION" in
  dev)
    podman stop appscreen-dev 2>/dev/null; podman rm appscreen-dev 2>/dev/null; true
    if ! podman image exists localhost/appscreen-dev:latest 2>/dev/null; then
      echo ">>> Baue Dev-Image (einmalig)..."
      podman build -f Dockerfile.dev -t appscreen-dev:latest "$SCRIPT_DIR"
    fi
    echo ">>> Starte Dev-Container mit Volume-Mount..."
    podman run -d --name appscreen-dev \
      -p 8080:8000 \
      -v "$SCRIPT_DIR:/app:z" \
      localhost/appscreen-dev:latest
    echo ""
    echo ">>> Dev-Server läuft auf http://localhost:8080"
    echo ">>> Dateiänderungen werden automatisch im Browser neu geladen"
    echo ">>> Logs: $0 logs-dev  |  Stoppen: $0 down-dev"
    ;;
  dev-rebuild)
    podman stop appscreen-dev 2>/dev/null; podman rm appscreen-dev 2>/dev/null; true
    echo ">>> Baue Dev-Image neu..."
    podman build -f Dockerfile.dev -t appscreen-dev:latest "$SCRIPT_DIR"
    echo ">>> Starte Dev-Container..."
    podman run -d --name appscreen-dev \
      -p 8080:8000 \
      -v "$SCRIPT_DIR:/app:z" \
      localhost/appscreen-dev:latest
    echo ">>> Dev-Server läuft auf http://localhost:8080"
    ;;
  down-dev)
    echo ">>> Stoppe Dev-Container..."
    podman stop appscreen-dev 2>/dev/null && podman rm appscreen-dev 2>/dev/null || true
    ;;
  logs-dev)
    podman logs -f appscreen-dev
    ;;
  up)
    podman stop appscreen 2>/dev/null; podman rm appscreen 2>/dev/null; true
    if ! podman image exists localhost/appscreen:latest 2>/dev/null; then
      echo ">>> Kein lokales Image gefunden – baue zuerst..."
      podman build -t appscreen:latest "$SCRIPT_DIR"
    fi
    echo ">>> Starte Prod-Container..."
    podman run -d --name appscreen -p 8080:80 --restart unless-stopped localhost/appscreen:latest
    echo ""
    echo ">>> App läuft auf http://localhost:8080"
    echo ">>> Logs anzeigen: $0 logs"
    echo ">>> Stoppen:       $0 down"
    ;;
  down)
    echo ">>> Stoppe und entferne Container..."
    podman stop appscreen 2>/dev/null && podman rm appscreen 2>/dev/null || true
    ;;
  logs)
    podman logs -f appscreen
    ;;
  status)
    podman ps --filter name=appscreen
    ;;
  rebuild)
    echo ">>> Baue Prod-Image neu und starte..."
    podman stop appscreen 2>/dev/null; podman rm appscreen 2>/dev/null; true
    podman build -t appscreen:latest "$SCRIPT_DIR"
    podman run -d --name appscreen -p 8080:80 --restart unless-stopped localhost/appscreen:latest
    echo ">>> App läuft auf http://localhost:8080"
    ;;
  *)
    echo "Verwendung: $0 [Befehl]"
    echo ""
    echo "  Entwicklung:"
    echo "  dev          - Startet Dev-Container mit Live-Reload + Volume-Mount"
    echo "  dev-rebuild  - Baut Dev-Image neu und startet"
    echo "  down-dev     - Stoppt Dev-Container"
    echo "  logs-dev     - Zeigt Dev-Logs"
    echo ""
    echo "  Produktion:"
    echo "  up           - Startet Prod-Container (nginx)"
    echo "  down         - Stoppt Prod-Container"
    echo "  logs         - Zeigt Prod-Logs"
    echo "  rebuild      - Baut Prod-Image neu und startet"
    echo "  status       - Zeigt alle laufenden Container"
    ;;
esac
