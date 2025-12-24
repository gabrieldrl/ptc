# GitHub Actions Workflows

## Test Workflow

The `test.yml` workflow runs on every push and pull request to ensure all tests pass.

### Setup

To enable tests in CI/CD, you need to add your E2B API key as a GitHub secret:

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `E2B_API_KEY`
5. Value: Your E2B API key
6. Click **Add secret**

### What It Does

- ✅ Installs dependencies with pnpm
- ✅ Builds all packages
- ✅ Runs all tests in `packages/ptc`
- ✅ Fails if any test fails (blocks merge)

### Running Locally

Tests can be run locally without GitHub Actions:

```bash
cd packages/ptc
E2B_API_KEY=your_key_here pnpm test
```

