const JENKINS_URL = process.env.JENKINS_URL;
const JENKINS_USER = process.env.JENKINS_USER;
const JENKINS_PASS = process.env.JENKINS_PASS;

const auth = Buffer.from(`${JENKINS_USER}:${JENKINS_PASS}`).toString('base64');
const headers = { Authorization: `Basic ${auth}` };

function repoNameFromUrl(url) {
  if (!url) return '';
  return url.replace(/\.git$/, '').split('/').pop();
}

function ownerFromUrl(url) {
  if (!url) return '';
  const parts = url.replace(/\.git$/, '').split('/');
  return parts[parts.length - 2] || '';
}

async function fetchJSON(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Jenkins fetch failed: ${res.status} ${url}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Jenkins fetch failed: ${res.status} ${url}`);
  return res.text();
}

export async function getJenkinsJobs() {
  const tree = [
    'jobs[',
    'name,url,',
    'lastBuild[',
    'number,result,timestamp,building,url,',
    'actions[',
    '_class,',
    'lastBuiltRevision[SHA1,branch[SHA1,name]],',
    'remoteUrls,',
    'failCount,skipCount,totalCount',
    ']',
    ']',
    ']',
  ].join('');

  const data = await fetchJSON(`${JENKINS_URL}/api/json?tree=${encodeURIComponent(tree)}`);

  return data.jobs
    .filter((j) => j.lastBuild)
    .map((job) => {
      const build = job.lastBuild;
      const actions = build.actions || [];

      const gitAction = actions.find(
        (a) => a._class === 'hudson.plugins.git.util.BuildData' && a.lastBuiltRevision
      );
      const testAction = actions.find(
        (a) => a._class === 'hudson.tasks.junit.TestResultAction'
      );

      const sha = gitAction?.lastBuiltRevision?.SHA1 || '';
      const remoteUrls = gitAction?.remoteUrls || [];
      const repoUrl = remoteUrls[0] || '';

      return {
        jobName: job.name,
        jobUrl: job.url,
        buildNumber: build.number,
        buildUrl: build.url,
        buildResult: build.building ? 'BUILDING' : (build.result || 'UNKNOWN'),
        buildTimestamp: build.timestamp,
        commitSha: sha.slice(0, 7),
        commitShaFull: sha,
        repoUrl,
        repoName: repoNameFromUrl(repoUrl),
        repoOwner: ownerFromUrl(repoUrl),
        testPassed: testAction?.totalCount != null
          ? testAction.totalCount - (testAction.failCount || 0) - (testAction.skipCount || 0)
          : null,
        testFailed: testAction?.failCount ?? null,
        testSkipped: testAction?.skipCount ?? null,
        testTotal: testAction?.totalCount ?? null,
      };
    });
}

export async function getJobInfo(jobName) {
  const tree = 'name,url,description,buildable,lastBuild[number,result,timestamp,url,duration],lastSuccessfulBuild[number,timestamp],lastFailedBuild[number,timestamp],healthReport[description,score]';
  return fetchJSON(`${JENKINS_URL}/job/${encodeURIComponent(jobName)}/api/json?tree=${encodeURIComponent(tree)}`);
}

export async function getBuildHistory(jobName, limit = 10) {
  const tree = `builds[number,result,timestamp,duration,url,actions[_class,lastBuiltRevision[SHA1],remoteUrls]]{0,${limit}}`;
  const data = await fetchJSON(`${JENKINS_URL}/job/${encodeURIComponent(jobName)}/api/json?tree=${encodeURIComponent(tree)}`);
  return (data.builds || []).map((b) => {
    const gitAction = (b.actions || []).find(
      (a) => a._class === 'hudson.plugins.git.util.BuildData' && a.lastBuiltRevision
    );
    return {
      number: b.number,
      result: b.result || 'BUILDING',
      timestamp: b.timestamp,
      duration: b.duration,
      url: b.url,
      commitSha: gitAction?.lastBuiltRevision?.SHA1?.slice(0, 7) || '',
    };
  });
}

export async function getBuildLog(jobName, buildNumber = 'lastBuild', start = 0) {
  const url = `${JENKINS_URL}/job/${encodeURIComponent(jobName)}/${buildNumber}/logText/progressiveText?start=${start}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Log fetch failed: ${res.status}`);
  const text = await res.text();
  const more = res.headers.get('x-more-data') === 'true';
  const nextStart = parseInt(res.headers.get('x-text-size') || '0', 10);
  return { text, more, nextStart };
}

export async function getAllJobs() {
  const data = await fetchJSON(
    `${JENKINS_URL}/api/json?tree=${encodeURIComponent('jobs[name,url,color,lastBuild[number,result,timestamp]]')}`
  );
  return (data.jobs || []).map((j) => ({
    name: j.name,
    url: j.url,
    color: j.color,
    lastBuildNumber: j.lastBuild?.number ?? null,
    lastBuildResult: j.lastBuild?.result ?? null,
    lastBuildTimestamp: j.lastBuild?.timestamp ?? null,
  }));
}
