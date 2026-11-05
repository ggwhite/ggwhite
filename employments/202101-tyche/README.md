# 🇹🇼 Tyche Tech Co, Ltd

`Senior Backend Engineer` Jan. 2021 - Present

## Projects

### Project C — Game Server & Backend Management System (Lua / Java)
* Game Server: Lua, Skynet
* Backend: Java, Spring Boot, MyBatis
* CI/CD: GitLab CI, SSH deploy

### Project B — Game Server & Web Backend (Lua / PHP)
* Game Server: Lua (Gate, Lobby, Game servers)
* Backend: PHP, Laravel
* CI/CD: GitLab CI, SSH deploy

### Project A — Game Server & Backend (Golang / .Net)
* Game Server: Golang (TCP/WebSocket)
* CI/CD: GitLab CI, Kubernetes, Helm

## Key Achievements

### Architecture Planning & Technical Decisions
* Planned multi-platform system architecture; assessed proposed changes, their impact and risk, to inform technical decisions
* Introduced the team's shared knowledge base and AI agent collaboration rules (Claude Code and Codex share the same conventions)

### Containerization Migration (Jul. 2026 - Oct. 2026)
* Migrated game services and back-office systems for multiple platforms from bare metal to Docker containers (Docker Compose, healthchecks, environment-variable-based config)
* Released via GitLab tag pipelines with images pushed to Harbor / AWS ECR
* Wrote the production cutover runbook and built data comparison and config validation scripts for MySQL / Redis / MongoDB across old and new environments

### Reward Claim Bug Investigation
* Investigated a financial-loss bug where players could claim rewards multiple times; root-caused to a race condition (concurrent requests passing the check simultaneously), fixed with a Redis-based dedup marker

### Platform Modernization (Solo Lead)
* Rewrote Lua/PHP/Java gaming platform in Go — TCP gateway, game engine, BI backend, payment services
* Designed multi-tenant config-driven architecture: single codebase serving 13 platforms, replacing per-platform release branch forks
* Designed Proto2/Proto3 dual-compatible serialization layer for seamless legacy Lua client migration to Go
* Implemented Redis data HMAC-SHA256 signing to architecturally prevent data tampering attacks

### MongoDB Performance Optimization
* Diagnosed full-collection scan on ~2.7M records/day
* Designed compound indexes, implemented Lua scheduler to pre-build daily indexes automatically, and generalized the fix to other large collections

### Redis Architecture Optimization
* Refactored key structure from `rid`-variable keys to Hash structure (`rid` as field)
* Eliminated excessive `SCAN` operations

### Security Hardening
* Investigated Redis data tampering, traced full attack chain (game state forgery + withdrawal record manipulation)
* Designed three-layer defense: HMAC signing + state machine + audit trail

### CI/CD Pipeline
* Designed and maintained GitLab CI/CD pipelines
* Automated Docker image builds to Harbor registry
* Remote Docker Compose deployment via SSH for development environments

### Infrastructure & DevOps
* Built Helm charts and set up GitLab Runners
* Developed deployment scripts for Linux servers

### Mentoring
* Onboarded new graduates through code review and pair programming, guided test case writing
