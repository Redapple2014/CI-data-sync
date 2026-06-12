const JENKINS_URL = process.env.JENKINS_URL;
const JENKINS_USER = process.env.JENKINS_USER;
const JENKINS_PASS = process.env.JENKINS_PASS;

const auth = Buffer.from(`${JENKINS_USER}:${JENKINS_PASS}`).toString('base64');
const headers = { Authorization: `Basic ${auth}` };

async function fetchJSON(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Jenkins fetch failed: ${res.status} ${url}`);
  return res.json();
}

export async function getBuildQueue() {
  const data = await fetchJSON(
    `${JENKINS_URL}/queue/api/json?tree=items[id,task[name,url],why,inQueueSince,stuck,blocked]`
  );
  return (data.items || []).map((item) => ({
    id: item.id,
    jobName: item.task?.name || '',
    jobUrl: item.task?.url || '',
    why: item.why || '',
    inQueueSince: item.inQueueSince,
    stuck: item.stuck || false,
    blocked: item.blocked || false,
  }));
}

export async function getExecutors() {
  const data = await fetchJSON(
    `${JENKINS_URL}/computer/api/json?tree=computer[displayName,executors[currentExecutable[url,number,fullDisplayName,estimatedDuration,timestamp],idle,likelyStuck,progress]]`
  );
  const nodes = data.computer || [];
  return nodes.flatMap((node) =>
    (node.executors || []).map((ex, i) => ({
      node: node.displayName,
      index: i + 1,
      idle: ex.idle,
      likelyStuck: ex.likelyStuck || false,
      progress: ex.progress ?? null,
      job: ex.currentExecutable
        ? {
            name: ex.currentExecutable.fullDisplayName,
            url: ex.currentExecutable.url,
            number: ex.currentExecutable.number,
            startedAt: ex.currentExecutable.timestamp,
            estimatedDuration: ex.currentExecutable.estimatedDuration,
          }
        : null,
    }))
  );
}

let crumbCache = null;
let crumbFetchedAt = 0;

export async function getCrumb() {
  const now = Date.now();
  if (crumbCache && now - crumbFetchedAt < 60000) return crumbCache;
  const res = await fetch(`${JENKINS_URL}/crumbIssuer/api/json`, { headers });
  if (!res.ok) return null;
  const data = await res.json();
  // Jenkins crumb is session-scoped — must send the same session cookie with the build POST
  const cookie = res.headers.get('set-cookie') || '';
  crumbCache = { field: data.crumbRequestField, value: data.crumb, cookie };
  crumbFetchedAt = now;
  return crumbCache;
}

export async function triggerBuild(jobName) {
  // Always fetch a fresh crumb (don't reuse cached — session may have expired)
  crumbCache = null;
  const crumb = await getCrumb();
  const triggerHeaders = { ...headers };
  if (crumb) {
    triggerHeaders[crumb.field] = crumb.value;
    if (crumb.cookie) triggerHeaders['Cookie'] = crumb.cookie;
  }

  const res = await fetch(`${JENKINS_URL}/job/${encodeURIComponent(jobName)}/build`, {
    method: 'POST',
    headers: triggerHeaders,
  });

  if (res.status === 201 || res.status === 200) return { ok: true };
  throw new Error(`Trigger failed: ${res.status}`);
}
