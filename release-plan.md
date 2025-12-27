# Clauding Open-Source Release Plan

**Target:** Alpha Public Release on GitHub
**Current Version:** 0.1.0
**Estimated Readiness:** ~70%

---

## Executive Summary

Clauding is a VS Code extension for AI-assisted feature development using git worktrees and Claude CLI integration. The codebase is well-structured with good documentation, but needs several adjustments before public release, primarily around contributor documentation, CI/CD setup, and cleaning up placeholder content.

---

## Phase 1: Critical Pre-Release (Must Have)

### 1.1 Documentation Gaps

#### Create CONTRIBUTING.md
- Development environment setup
- Code style guidelines (ESLint/Prettier already configured)
- Pull request process
- Issue reporting guidelines
- Testing requirements (reference TESTING.md)
- Architecture overview for new contributors

#### Create CODE_OF_CONDUCT.md
- Adopt Contributor Covenant v2.1 (industry standard)
- Define enforcement procedures
- Contact information for reporting

#### Create CHANGELOG.md
- Document version 0.1.0 as initial release
- Establish format (Keep a Changelog standard)
- Include: Added, Changed, Deprecated, Removed, Fixed, Security sections

#### Fix LICENSE.txt
- **Current:** Contains only "MIT" text
- **Required:** Full MIT License text with copyright holder and year
- Copyright holder: Determine organization/individual name

### 1.2 Placeholder URL Cleanup

Replace all instances of `https://github.com/yourusername/clauding` with actual URL:

| File | Line | Current | Action |
|------|------|---------|--------|
| `package.json` | 9 | `yourusername` | Update to actual org |
| `src/extension.ts` | 98 | `yourusername` | Update to actual org |
| `src/commands/settingsCommand.ts` | varies | `yourusername` | Update to actual org |

### 1.3 Git Repository Cleanup

#### Files to Remove/Gitignore
- [ ] `clauding-0.1.0.vsix` - Add `*.vsix` to .gitignore
- [ ] `git-backup-*.zip` - Remove from repo
- [ ] `.git.backup*` - Remove from repo

#### Verify .gitignore Coverage
```
# Add if missing:
*.vsix
*.zip
.clauding/
```

### 1.4 Security Review

#### Verified Safe
- No hardcoded API keys in source
- API keys use VS Code's secure machine-scoped storage
- Test files use mock values only
- Debug paths in `.vscode/launch.json` are excluded by `.vscodeignore`

#### Action Items
- [ ] Run `git log -p | grep -i "api_key\|apikey\|secret\|password\|token"` to check history
- [ ] Consider running GitHub's secret scanning on the repo
- [ ] Document API key handling in README security section

---

## Phase 2: Important Additions

### 2.1 GitHub Repository Setup

#### Issue Templates (`.github/ISSUE_TEMPLATE/`)

**bug_report.md:**
```yaml
name: Bug Report
about: Report a bug to help improve Clauding
labels: bug
```
Include fields:
- VS Code version
- Clauding version
- OS/Platform
- Steps to reproduce
- Expected vs actual behavior
- Error logs

**feature_request.md:**
```yaml
name: Feature Request
about: Suggest a new feature
labels: enhancement
```

#### Pull Request Template (`.github/PULL_REQUEST_TEMPLATE.md`)
- Description of changes
- Related issues
- Testing performed
- Checklist (tests pass, lint clean, docs updated)

### 2.2 CI/CD Pipeline

#### GitHub Actions Workflow (`.github/workflows/ci.yml`)

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: [18, 20]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run lint
      - run: npm run compile
      - run: npm test
```

#### Additional Workflows to Consider
- `release.yml` - Automated release on tag push
- `publish.yml` - VS Code Marketplace publishing
- `codeql.yml` - Security scanning

### 2.3 Create SECURITY.md

- Supported versions policy
- How to report vulnerabilities
- Expected response timeline
- Security update process

### 2.4 Documentation Updates

#### README.md Improvements
- [ ] Add badges (CI status, version, license, VS Code version)
- [ ] Add "Contributing" section linking to CONTRIBUTING.md
- [ ] Add "Security" section linking to SECURITY.md
- [ ] Verify all installation instructions work
- [ ] Add troubleshooting FAQ section

#### DEPLOY.md Consistency Check
- Update model references (currently mentions `anthropic/claude-3.5-sonnet` but CONFIG.md shows `openai/gpt-4o-mini:free`)
- Verify platform-specific build instructions

---

## Phase 3: Nice to Have (Post-Alpha)

### 3.1 Developer Experience

#### API Documentation
- Document public extension API for developers
- Create examples for custom agent commands
- Architecture diagrams (Mermaid in markdown)

#### Troubleshooting Guide
- Common issues and solutions
- Debug mode instructions
- Log location and interpretation

### 3.2 Build Improvements

#### Platform-Specific Builds
Per DEPLOY.md recommendations, implement for VS Code Marketplace:
- `linux-x64`
- `darwin-x64` (Intel Mac)
- `darwin-arm64` (Apple Silicon)
- `win32-x64`

This avoids users needing build tools for `node-pty`.

#### Build Size Optimization
- Current: 1.4 MB (acceptable)
- Review bundle for unnecessary inclusions
- Consider tree-shaking improvements

### 3.3 Test Improvements

Per TESTING.md analysis:
- Target: <10s total test time (current: ~35s)
- Increase unit test coverage where gaps exist
- Add E2E tests for critical workflows

### 3.4 Community Infrastructure

- [ ] Enable GitHub Discussions for Q&A
- [ ] Create Discord/Slack community (optional)
- [ ] Video tutorials for getting started
- [ ] Example projects/use cases

---

## Phase 4: VS Code Marketplace Publishing

### Prerequisites
- [ ] Create VS Code Marketplace publisher account
- [ ] All placeholder URLs replaced
- [ ] All tests passing
- [ ] Lint checks clean
- [ ] CHANGELOG.md complete

### Publishing Steps
1. Bump version in `package.json`
2. Update CHANGELOG.md
3. Create git tag: `git tag v0.1.0`
4. Build: `npm run package`
5. Test locally: `code --install-extension clauding-0.1.0.vsix`
6. Publish: `npx vsce publish`

### Post-Publish
- [ ] Verify listing on marketplace
- [ ] Create GitHub Release with release notes
- [ ] Announce on relevant channels

---

## Implementation Checklist

### Critical (Phase 1)
- [ ] Write full MIT LICENSE.txt
- [ ] Create CONTRIBUTING.md
- [ ] Create CODE_OF_CONDUCT.md
- [ ] Create CHANGELOG.md
- [ ] Replace all placeholder URLs (3 locations)
- [ ] Add `*.vsix` to .gitignore
- [ ] Remove backup files from repo
- [ ] Security audit of git history

### Important (Phase 2)
- [ ] Create bug report issue template
- [ ] Create feature request issue template
- [ ] Create PR template
- [ ] Create GitHub Actions CI workflow
- [ ] Create SECURITY.md
- [ ] Add README badges
- [ ] Verify DEPLOY.md accuracy

### Nice to Have (Phase 3+)
- [ ] Platform-specific VSIX builds
- [ ] API documentation
- [ ] Troubleshooting guide
- [ ] Architecture diagrams
- [ ] Test performance optimization
- [ ] GitHub Discussions setup

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Secrets in git history | High | Run secret scanning before public |
| Native dependency issues | Medium | Document build requirements clearly |
| Platform compatibility | Medium | CI testing on all platforms |
| Breaking changes post-release | Medium | Semantic versioning, changelog |
| Low initial adoption | Low | Good docs, examples, promotion |

---

## Timeline Estimate

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| Phase 1 (Critical) | 1-2 days | None |
| Phase 2 (Important) | 2-3 days | Phase 1 |
| Phase 3 (Nice to Have) | Ongoing | None |
| Phase 4 (Marketplace) | 1 day | Phase 1 + 2 |

**Minimum Viable Release:** Complete Phase 1 + basic CI from Phase 2

---

## Notes

### Current Strengths
- Clean, modular TypeScript architecture (173 files, 24k LOC)
- Comprehensive existing documentation (README, CONFIG, TESTING, DEPLOY)
- Good test coverage with unit + integration tests
- Secure API key handling via VS Code storage
- Modern build tooling (esbuild, webpack)

### Key Dependencies
- `node-pty` requires native build tools - document clearly
- VS Code 1.105.0+ required
- Claude CLI for full functionality

### Repository Info
- Current remote: `https://github.com/adaptiverisk/clauding.git`
- Main branch: `main`
- Clean git status (no uncommitted changes)
