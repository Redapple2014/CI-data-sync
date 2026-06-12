import * as k8s from '@kubernetes/client-node';
import os from 'os';
import path from 'path';

const CONFIGMAP_NAME = 'cicd-dashboard-projects';
const CONFIGMAP_NS   = 'cicd-dashboard';

let projectsCache = null;
let projectsFetchedAt = 0;
const PROJECTS_TTL = 60_000;

function makeKubeConfig() {
  const kc = new k8s.KubeConfig();
  if (process.env.KUBECONFIG) {
    kc.loadFromFile(process.env.KUBECONFIG);
  } else {
    kc.loadFromDefault();
  }
  return kc;
}

function makeClient() {
  return makeKubeConfig().makeApiClient(k8s.CoreV1Api);
}

export async function getProjects() {
  const now = Date.now();
  if (projectsCache && now - projectsFetchedAt < PROJECTS_TTL) return projectsCache;
  try {
    const api = makeClient();
    const res = await api.readNamespacedConfigMap({ name: CONFIGMAP_NAME, namespace: CONFIGMAP_NS });
    const raw = res.data?.['projects.json'];
    if (raw) {
      projectsCache = JSON.parse(raw);
      projectsFetchedAt = now;
    }
  } catch (err) {
    console.warn('[projects] failed to load ConfigMap, using cache or []:', err.message);
  }
  return projectsCache || [];
}

export function resolveProject(jobName, projects) {
  for (const p of projects) {
    if ((p.prefixes || []).some((pfx) => jobName.startsWith(pfx))) {
      return { project: p.name, accessKey: p.key };
    }
  }
  return null;
}

// Parse CPU quantity → millicores (e.g. "2" → 2000, "500m" → 500)
function parseCpu(q) {
  if (!q) return 0;
  if (q.endsWith('m')) return parseInt(q, 10);
  return parseFloat(q) * 1000;
}

// Parse memory quantity → MiB (handles Ki, Mi, Gi, k, M, G)
function parseMem(q) {
  if (!q) return 0;
  const units = { Ki: 1 / 1024, Mi: 1, Gi: 1024, k: 1 / 1024, M: 1, G: 1024 };
  for (const [suffix, factor] of Object.entries(units)) {
    if (q.endsWith(suffix)) return parseFloat(q) * factor;
  }
  return parseFloat(q) / (1024 * 1024);
}

export async function getNodeCapacity() {
  const api = makeClient();

  const [nodesRes, podsRes] = await Promise.all([
    api.listNode(),
    api.listPodForAllNamespaces(undefined, undefined, 'status.phase=Running'),
  ]);

  const nodes = nodesRes.items.map((n) => {
    const name = n.metadata.name;
    const alloc = n.status.allocatable || {};
    const cap   = n.status.capacity   || {};
    const roles = Object.keys(n.metadata.labels || {})
      .filter((l) => l.startsWith('node-role.kubernetes.io/'))
      .map((l) => l.replace('node-role.kubernetes.io/', ''));
    if (roles.length === 0) roles.push('worker');

    return {
      name,
      roles,
      allocatable: {
        cpuMillicores: parseCpu(alloc.cpu),
        memoryMiB:     parseMem(alloc.memory),
        pods:          parseInt(alloc.pods || cap.pods || '0', 10),
      },
      requests: { cpuMillicores: 0, memoryMiB: 0, pods: 0 },
      limits:   { cpuMillicores: 0, memoryMiB: 0 },
      namespaces: {},
    };
  });

  const nodeIndex = Object.fromEntries(nodes.map((n) => [n.name, n]));

  for (const pod of podsRes.items) {
    const nodeName = pod.spec.nodeName;
    const ns = pod.metadata.namespace;
    const node = nodeIndex[nodeName];
    if (!node) continue;

    let reqCpu = 0, reqMem = 0, limCpu = 0, limMem = 0;
    for (const c of pod.spec.containers || []) {
      const req = c.resources?.requests || {};
      const lim = c.resources?.limits   || {};
      reqCpu += parseCpu(req.cpu);
      reqMem += parseMem(req.memory);
      limCpu += parseCpu(lim.cpu);
      limMem += parseMem(lim.memory);
    }

    node.requests.cpuMillicores += reqCpu;
    node.requests.memoryMiB     += reqMem;
    node.requests.pods          += 1;
    node.limits.cpuMillicores   += limCpu;
    node.limits.memoryMiB       += limMem;

    if (!node.namespaces[ns]) {
      node.namespaces[ns] = { pods: 0, reqCpu: 0, reqMem: 0, limCpu: 0, limMem: 0 };
    }
    node.namespaces[ns].pods   += 1;
    node.namespaces[ns].reqCpu += reqCpu;
    node.namespaces[ns].reqMem += reqMem;
    node.namespaces[ns].limCpu += limCpu;
    node.namespaces[ns].limMem += limMem;
  }

  return nodes.map((n) => ({
    ...n,
    namespaces: Object.entries(n.namespaces)
      .map(([ns, v]) => ({ ns, ...v }))
      .sort((a, b) => b.pods - a.pods),
  }));
}
