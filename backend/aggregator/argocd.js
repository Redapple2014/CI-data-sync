const ARGOCD_URL = process.env.ARGOCD_URL;
const ARGOCD_TOKEN = process.env.ARGOCD_TOKEN;

const headers = {
  Authorization: `Bearer ${ARGOCD_TOKEN}`,
};

let appsCache = [];
let lastFetch = 0;

async function fetchApps() {
  const now = Date.now();
  if (now - lastFetch < 60000 && appsCache.length) return appsCache;

  const res = await fetch(
    `${ARGOCD_URL}/api/v1/applications?fields=items.metadata.name,items.status.sync,items.status.health,items.status.operationState,items.spec.source`,
    { headers }
  );
  if (!res.ok) throw new Error(`ArgoCD fetch failed: ${res.status}`);
  const data = await res.json();
  appsCache = data.items || [];
  lastFetch = now;
  return appsCache;
}

export async function getArgoCDStatus(repoUrl) {
  try {
    const apps = await fetchApps();

    const repoBase = repoUrl?.replace(/\.git$/, '').toLowerCase();
    const app = apps.find((a) => {
      const src = a.spec?.source?.repoURL?.replace(/\.git$/, '').toLowerCase();
      return src && repoBase && src === repoBase;
    });

    if (!app) return null;

    const syncStatus = app.status?.sync?.status || 'Unknown';
    const health = app.status?.health?.status || 'Unknown';
    const finishedAt = app.status?.operationState?.finishedAt || null;

    return {
      appName: app.metadata.name,
      syncStatus,
      health,
      lastSyncedAt: finishedAt,
    };
  } catch {
    return null;
  }
}
