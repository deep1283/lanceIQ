# Release Workflow: Private Pro + Public Core

To keep your "Pro" logic private while open-sourcing the Core, use a **Dual-Remote Strategy**.

## 1. The Golden Rule
**Your working repository (`origin`) must always be PRIVATE.**
All development (Core + Pro) happens in this private repo. You never push directly to the public repo from your daily workflow.

## 2. Setup Remotes

```bash
# 1. Rename current origin to 'private' (or keep as origin if it's already private)
git remote rename origin private

# 2. Add the Public OSS repo as a secondary remote
git remote add public https://github.com/yourname/lanceiq-oss.git
```

## 3. How to Push (Daily Work)
Push everything to your private repo.
```bash
git push private main
```

## 4. How to Release Core (Publicly)
When you are ready to update the Open Source version:

### Option A: Manual "OSS" Branch (Simplest)
1. Create a branch for public release:
   ```bash
   git checkout -b release-oss
   ```
2. Delete Pro directories:
   ```bash
   rm -rm app/dashboard/settings lib/dodo.ts app/api/dodo
   # Update code to remove imports/features
   # (See 'Stubs' strategy below)
   ```
3. Commit and Push to Public:
   ```bash
   git commit -m "chore: release core v1.0"
   git push public release-oss:main
   ```

### Option B: git-filter-repo (Advanced)
Use a script to automatically strip folders & rewrite history (cleaner history).

## 5. Code Strategy: Stubs
To make Option A easier, use **dependency injection** or **dynamic imports** so deleting `lib/dodo.ts` doesn't break the build.

Example `lib/billing.ts`:
```typescript
// If Dodo is missing (OSS), return null/mock
export async function createCheckout() {
  if (process.env.NEXT_PUBLIC_OSS_MODE) return null;
  const { createCheckoutSession } = await import('./dodo');
  return createCheckoutSession(...);
}
```
This allows the same codebase to run in both modes.
