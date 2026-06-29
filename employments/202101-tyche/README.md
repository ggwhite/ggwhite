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

### Platform Modernization (Solo Lead)
* Rewrote Lua/PHP/Java gaming platform in Go — TCP gateway, game engine, BI backend, payment services
* Designed multi-tenant config-driven architecture: single codebase serving 13 platforms, replacing per-platform release branch forks
* Designed Proto2/Proto3 dual-compatible serialization layer for seamless legacy Lua client migration to Go
* Implemented Redis data HMAC-SHA256 signing to architecturally prevent data tampering attacks

### MongoDB Performance Optimization
* Diagnosed full-collection scan on ~2.7M records/day
* Designed compound indexes and implemented Lua scheduler to pre-build daily indexes automatically

### Redis Architecture Optimization
* Refactored key structure from `rid`-variable keys to Hash structure (`rid` as field)
* Eliminated excessive `SCAN` operations, improved query efficiency

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
* Led junior engineers, guided test case writing, established team testing habits
