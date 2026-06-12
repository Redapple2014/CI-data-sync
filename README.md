# CI/CD Dashboard

A dashboard that aggregates build/deploy status across Jenkins, ArgoCD, GitHub,
and the K3s staging-v2 cluster.

- `backend/` — Node.js (Express) API that scrapes Jenkins, ArgoCD, GitHub, and
  Kubernetes, exposed in-cluster at `https://api.staging.redappletech.com/cicd`.
- `frontend/` — Vite + React dashboard UI.

## Prerequisites

- Node.js 22+
- Access to `/home/ratpc-079/.kube/staging-v2.yaml` (only needed if you want
  the backend's Kubernetes pod/node data to resolve locally)

## Backend setup

```bash
cd backend
npm install
cp .env.example .env   # if no .env exists yet, copy the real one from the deployed secret
```

`.env` requires:

| Variable | Purpose |
| --- | --- |
| `JENKINS_URL`, `JENKINS_USER`, `JENKINS_PASS` | Jenkins API credentials |
| `ARGOCD_URL`, `ARGOCD_TOKEN` | ArgoCD API token |
| `GITHUB_TOKEN` | GitHub API token (redapplestaging PAT) |
| `DASHBOARD_API_KEY` | Required `x-api-key` header for all `/api/*` requests |
| `PORT` | Defaults to `3001` |

To get cluster data (pods/nodes/`cicd-dashboard-projects` ConfigMap), point the
backend at the staging-v2 kubeconfig:

```bash
KUBECONFIG=/home/ratpc-079/.kube/staging-v2.yaml npm run dev
```

Without `KUBECONFIG` set, `@kubernetes/client-node` falls back to
`loadFromDefault()` (in-cluster config, or `~/.kube/config` if present).

The backend starts on `http://localhost:3001`. Health check:

```bash
curl -H "x-api-key: $DASHBOARD_API_KEY" http://localhost:3001/api/health
```

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Opens on `http://localhost:5173`.

By default `vite.config.js` proxies `/api/*` straight to the deployed staging
backend (`https://api.staging.redappletech.com/cicd/api/*`), authenticating
with `DASHBOARD_API_KEY` read from `frontend/.env.local` (gitignored — never
commit this file):

```bash
echo "DASHBOARD_API_KEY=<value from backend/.env or cicd-dashboard-env secret>" \
  > frontend/.env.local
```

To point the frontend at your local backend instead, edit the `proxy` block in
`frontend/vite.config.js`:

```js
proxy: {
  '/api': {
    target: 'http://localhost:3001',
    changeOrigin: true,
    rewrite: (path) => path, // drop the '/cicd' rewrite, no strip-prefix locally
    headers: {
      'x-api-key': env.DASHBOARD_API_KEY || '',
    },
  },
},
```

## Reference

- [Jenkins API reference](docs/jenkins-api.md) — endpoints used by the
  aggregator, auth/crumb setup, and the Jenkins `tree` query syntax. Check
  this before adding new Jenkins-backed fields.

## Notes

- `backend/.env` and the API keys/tokens it contains are secrets — never
  commit them. The same values live in the `cicd-dashboard-env` Secret in the
  `cicd-dashboard` namespace (`apps/cicd-dashboard/secret.yaml` in the GitOps
  repo).
- The frontend currently has no deployment/ingress in the cluster — it only
  runs locally via `npm run dev` / `vite preview`.
