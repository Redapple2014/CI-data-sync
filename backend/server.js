import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { getJenkinsJobs, getJobInfo, getBuildHistory, getBuildLog, getAllJobs } from './aggregator/jenkins.js';
import { getPRForCommit } from './aggregator/github.js';
import { getArgoCDStatus } from './aggregator/argocd.js';
import { getBuildQueue, getExecutors, triggerBuild } from './aggregator/queue.js';
import { getNodeCapacity, getProjects, resolveProject } from './aggregator/k8s.js';

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.DASHBOARD_API_KEY;
app.use((req, res, next) => {
  if (req.path === '/api/health') return next();
  const key = req.headers['x-api-key'];
  if (!API_KEY || key === API_KEY) return next();
  res.status(401).json({ error: 'Unauthorized' });
});

let cache = { data: [], updatedAt: null };
let allJobsCache = { data: [], updatedAt: null };
let refreshing = false;

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    console.log('[refresh] fetching Jenkins jobs...');
    const jobs = await getJenkinsJobs();
    console.log(`[refresh] got ${jobs.length} jobs, enriching...`);

    const projects = await getProjects();
    console.log(`[refresh] loaded ${projects.length} project definitions from ConfigMap`);

    const enriched = (await Promise.all(
      jobs.map(async (job) => {
        const projectInfo = resolveProject(job.jobName, projects);
        if (!projectInfo) return null; // exclude jobs with no project

        const [pr, argocd] = await Promise.allSettled([
          getPRForCommit(job.repoOwner, job.repoName, job.commitShaFull),
          getArgoCDStatus(job.repoUrl),
        ]);

        const prData = pr.status === 'fulfilled' ? pr.value : null;
        const argoData = argocd.status === 'fulfilled' ? argocd.value : null;

        const buildOk = job.buildResult === 'SUCCESS';
        const buildFail = job.buildResult === 'FAILURE' || job.buildResult === 'UNSTABLE';
        const building = job.buildResult === 'BUILDING';
        const testOk = job.testFailed === 0 && job.testTotal > 0;
        const testFail = job.testFailed > 0;
        const deployed = argoData?.syncStatus === 'Synced';
        const deployFail = argoData?.syncStatus === 'OutOfSync';

        const pipeline = [
          job.commitSha ? 'success' : 'pending',
          building ? 'running' : buildOk ? 'success' : buildFail ? 'failure' : 'pending',
          job.testTotal === null ? 'skipped' : testOk ? 'success' : testFail ? 'failure' : 'pending',
          deployed ? 'success' : deployFail ? 'failure' : buildOk ? 'pending' : 'grey',
        ];

        return {
          jobName: job.jobName,
          jobUrl: job.jobUrl,
          project: projectInfo.project,
          accessKey: projectInfo.accessKey,
          buildNumber: job.buildNumber,
          buildUrl: job.buildUrl,
          buildResult: job.buildResult,
          buildTimestamp: job.buildTimestamp,
          commitSha: job.commitSha,
          repoName: job.repoName,
          repoOwner: job.repoOwner,
          repoUrl: job.repoUrl,
          pr: prData,
          test: {
            passed: job.testPassed,
            failed: job.testFailed,
            skipped: job.testSkipped,
            total: job.testTotal,
          },
          argocd: argoData,
          pipeline,
        };
      })
    )).filter(Boolean);

    const now = new Date().toISOString();

    // allJobsCache: all jobs unfiltered (for /api/projects)
    const allJobs = await Promise.all(
      jobs.map(async (job) => {
        const projectInfo = resolveProject(job.jobName, projects);
        const [pr, argocd] = await Promise.allSettled([
          getPRForCommit(job.repoOwner, job.repoName, job.commitShaFull),
          getArgoCDStatus(job.repoUrl),
        ]);
        const prData = pr.status === 'fulfilled' ? pr.value : null;
        const argoData = argocd.status === 'fulfilled' ? argocd.value : null;

        const buildOk = job.buildResult === 'SUCCESS';
        const buildFail = job.buildResult === 'FAILURE' || job.buildResult === 'UNSTABLE';
        const building = job.buildResult === 'BUILDING';
        const testOk = job.testFailed === 0 && job.testTotal > 0;
        const testFail = job.testFailed > 0;
        const deployed = argoData?.syncStatus === 'Synced';
        const deployFail = argoData?.syncStatus === 'OutOfSync';

        const pipeline = [
          job.commitSha ? 'success' : 'pending',
          building ? 'running' : buildOk ? 'success' : buildFail ? 'failure' : 'pending',
          job.testTotal === null ? 'skipped' : testOk ? 'success' : testFail ? 'failure' : 'pending',
          deployed ? 'success' : deployFail ? 'failure' : buildOk ? 'pending' : 'grey',
        ];

        return {
          jobName: job.jobName,
          jobUrl: job.jobUrl,
          project: projectInfo?.project || null,
          accessKey: projectInfo?.accessKey || null,
          buildNumber: job.buildNumber,
          buildUrl: job.buildUrl,
          buildResult: job.buildResult,
          buildTimestamp: job.buildTimestamp,
          commitSha: job.commitSha,
          repoName: job.repoName,
          repoOwner: job.repoOwner,
          repoUrl: job.repoUrl,
          pr: prData,
          test: {
            passed: job.testPassed,
            failed: job.testFailed,
            skipped: job.testSkipped,
            total: job.testTotal,
          },
          argocd: argoData,
          pipeline,
        };
      })
    );
    allJobsCache = { data: allJobs, updatedAt: now };

    cache = { data: enriched, updatedAt: now };
    console.log(`[refresh] done at ${cache.updatedAt} — dashboard: ${enriched.length}, projects: ${allJobs.length}`);
  } catch (err) {
    console.error('[refresh] error:', err.message);
  } finally {
    refreshing = false;
  }
}

app.get('/api/dashboard', (req, res) => {
  res.json(cache);
});

// Returns deployed project list with optional incremental fetch via `since` query param.
// GET /api/projects                → all projects + queue/executors
// GET /api/projects?since=1781775805  → only projects updated after that Unix timestamp (seconds)
app.get('/api/projects', async (req, res) => {
  const since = req.query.since;

  // Fetch live queue/executor data to include in-progress info
  let queue = [], executors = [];
  try {
    [queue, executors] = await Promise.all([getBuildQueue(), getExecutors()]);
  } catch { /* ignore — queue data is best-effort */ }

  if (!since) {
    return res.json({ data: allJobsCache.data, updatedAt: allJobsCache.updatedAt, queue, executors });
  }

  // Only accept numeric Unix timestamp (seconds). Reject everything else.
  if (!/^\d+$/.test(since)) {
    return res.status(400).json({ error: 'Invalid `since` value. Must be a numeric Unix timestamp (seconds).' });
  }
  const sinceMs = Number(since) * 1000;

  const filtered = allJobsCache.data.filter((item) => {
    // Always include ongoing builds so the UI shows real-time progress
    if (item.buildResult === 'BUILDING') return true;

    // Include projects whose build or deploy happened after the `since` timestamp
    const buildTs = item.buildTimestamp ? new Date(item.buildTimestamp).getTime() : 0;
    const argoTs = item.argocd?.lastSyncedAt ? new Date(item.argocd.lastSyncedAt).getTime() : 0;
    const lastActivity = Math.max(buildTs, argoTs);
    return lastActivity > sinceMs;
  });

  res.json({ data: filtered, updatedAt: allJobsCache.updatedAt, queue, executors });
});

app.get('/api/queue', async (req, res) => {
  try {
    const [queue, executors] = await Promise.all([getBuildQueue(), getExecutors()]);
    res.json({ queue, executors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/build/:jobName', async (req, res) => {
  try {
    const [result, projects] = await Promise.all([
      triggerBuild(req.params.jobName),
      getProjects(),
    ]);
    console.log(`[trigger] ${req.params.jobName}`);
    res.json({ ...result, ...resolveProject(req.params.jobName, projects) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Jenkins wrapper routes ---

app.get('/api/jobs', async (req, res) => {
  try {
    const [jobs, projects] = await Promise.all([getAllJobs(), getProjects()]);
    res.json(jobs.map((j) => ({ ...j, ...resolveProject(j.name, projects) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs/:jobName', async (req, res) => {
  try {
    const [job, projects] = await Promise.all([
      getJobInfo(req.params.jobName),
      getProjects(),
    ]);
    res.json({ ...job, ...resolveProject(req.params.jobName, projects) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs/:jobName/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '10', 10);
    const [history, projects] = await Promise.all([
      getBuildHistory(req.params.jobName, limit),
      getProjects(),
    ]);
    const projectInfo = resolveProject(req.params.jobName, projects);
    res.json({ ...projectInfo, builds: history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs/:jobName/log', async (req, res) => {
  try {
    const build = req.query.build || 'lastBuild';
    const start = parseInt(req.query.start || '0', 10);
    const [log, projects] = await Promise.all([
      getBuildLog(req.params.jobName, build, start),
      getProjects(),
    ]);
    const projectInfo = resolveProject(req.params.jobName, projects);
    res.json({ ...projectInfo, ...log });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- end Jenkins wrapper routes ---

// CI reservation carved out of each node's schedulable space for Jenkins build agents.
// Tune via env vars. Defaults: 4 CPU cores + 6 GiB per node.
const CI_RESERVE = {
  cpuMillicores: parseInt(process.env.CI_RESERVE_CPU_MILLICORES || '4000',  10),
  memoryMiB:     parseInt(process.env.CI_RESERVE_MEMORY_MIB    || '10240', 10), // 10 GiB
};

app.get('/api/nodes', async (req, res) => {
  try {
    const nodes = await getNodeCapacity();
    res.json(nodes.map((n) => ({ ...n, ciReserve: CI_RESERVE })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  refresh();
  setInterval(refresh, 60000);
});
