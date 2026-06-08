# SALLY - Your Fleet Operations Assistant

SALLY is an intelligent fleet operations platform that optimizes route planning, ensures HOS compliance, and keeps dispatchers informed with proactive alerts.

## What SALLY Does

- **SALLY AI** - Conversational AI assistant for fleet operations — ask questions, get insights, and manage routes through natural language
- **Route Planning** - Optimized stop sequencing with TSP/VRP algorithms
- **HOS Compliance** - Automatic rest stop insertion where regulations require
- **Fuel Optimization** - Smart fuel stop placement based on range and pricing
- **Continuous Monitoring** - 14 trigger types monitored 24/7 with dynamic re-planning
- **Dispatcher Alerts** - Proactive notifications for HOS violations, delays, and driver events

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Backend** | NestJS 11, TypeScript 5.9, PostgreSQL 16, Redis 7, Prisma 7.3 |
| **Frontend** | Next.js 15 (App Router), TypeScript, Zustand, React Query, Tailwind CSS, Shadcn/ui |
| **Infrastructure** | Docker, Turborepo, pnpm |

## Getting Started

```bash
# Clone and install
git clone <repository-url>
cd sally
pnpm install

# Run with Docker (recommended)
pnpm run docker:up

# Or run with Turborepo
pnpm run dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |

## Staging URL
[https:/sally.staging.appshore.in](https://staging.sally.appshore.in/)

## Documentation

Full internal developer documentation, architecture guides:
**[https://app-shore.github.io/sally/](https://app-shore.github.io/sally)**

Partner/Build with sally documentation are available at:
**[https://build.staging.sally.appshore.in](https://build.staging.sally.appshore.in/)**


## Project Structure

```
sally/
├── apps/
│   ├── backend/       # NestJS API server
│   ├── web/           # Next.js dashboard
│   └── console/       # SALLY Console — platform management & API docs
├── packages/
│   ├── ui/            # Shared Shadcn UI components (@sally/ui)
│   └── shared-types/  # Shared Zod schemas
├── docker-compose.yml
├── turbo.json
└── package.json
```

## Contributing

Contributions to this repository are subject to the Appshore LLP Contributor Agreement and IP assignment. By submitting a pull request or otherwise contributing code, you agree that all intellectual property rights in your contributions are assigned to Appshore LLP. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

Copyright (c) 2024-2026 Appshore LLP. All rights reserved.

This software is proprietary and confidential. Unauthorized copying, distribution, modification, or use of this software, via any medium, is strictly prohibited without the express written permission of Appshore LLP.

See [LICENSE](LICENSE) for the full license text.
