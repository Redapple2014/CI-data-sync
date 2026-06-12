# Jenkins REST API Reference

Reference for the Jenkins endpoints used by `backend/aggregator/jenkins.js` and
`backend/aggregator/queue.js`, for anyone extending the aggregator.

- Official docs: https://www.jenkins.io/doc/book/using/remote-access-api/
- Live API explorer on our instance: `${JENKINS_URL}/api/` (e.g.
  `https://jenkins.staging.redappletech.com/api/`) — every Jenkins object has
  a `/api/json`, `/api/xml`, and `/api/python` form.

## Auth

All requests use HTTP Basic auth with `JENKINS_USER` / `JENKINS_PASS` (an API
token, not the account password):

```js
const auth = Buffer.from(`${JENKINS_USER}:${JENKINS_PASS}`).toString('base64');
headers = { Authorization: `Basic ${auth}` };
```

Generate a token at `${JENKINS_URL}/user/<username>/configure` → "API Token".

## The `tree` query parameter

Every `GET .../api/json` call below is shaped with `?tree=...` to avoid
pulling the full (huge) object graph. Syntax:

- `field1,field2` — select fields
- `nested[field1,field2]` — select fields on a nested object/array
- `items[...]{0,10}` — limit array results to a range (here, first 10)

This is the main tool for keeping aggregator responses small and fast — when
adding a new field, extend the `tree` string rather than fetching the
unfiltered object.

## CSRF crumb (required for POST)

Jenkins requires a CSRF "crumb" for state-changing requests (e.g. triggering
a build). Fetch one and attach it as a header, plus the session cookie it was
issued with (`backend/aggregator/queue.js:57-68`):

```
GET ${JENKINS_URL}/crumbIssuer/api/json
-> { "crumbRequestField": "Jenkins-Crumb", "crumb": "<token>" }
```

Send `Jenkins-Crumb: <token>` (header name comes from `crumbRequestField`) and
the `Set-Cookie` value from the crumb response on the follow-up POST.

## Endpoints in use

| Endpoint | Used by | Purpose |
| --- | --- | --- |
| `GET /api/json?tree=jobs[name,url,lastBuild[...]]` | `getJenkinsJobs()` | Last build status, commit SHA, test results for every job (dashboard overview) |
| `GET /job/{name}/api/json?tree=...` | `getJobInfo(jobName)` | Single job detail: description, health report, last success/fail build |
| `GET /job/{name}/api/json?tree=builds[...]{0,N}` | `getBuildHistory(jobName, limit)` | Last N builds for a job, with commit SHA per build |
| `GET /job/{name}/{build}/logText/progressiveText?start=N` | `getBuildLog(jobName, buildNumber, start)` | Streaming console log (progressive — use returned `nextStart`/`x-more-data` to poll for more) |
| `GET /api/json?tree=jobs[name,url,color,lastBuild[...]]` | `getAllJobs()` | Lightweight job list incl. Jenkins "ball color" status |
| `GET /queue/api/json?tree=items[...]` | `getBuildQueue()` | Pending/blocked/stuck items in the build queue |
| `GET /computer/api/json?tree=computer[...]` | `getExecutors()` | Per-node executor status and what each is currently building |
| `GET /crumbIssuer/api/json` | `getCrumb()` | CSRF crumb for POST requests (cached 60s) |
| `POST /job/{name}/build` | `triggerBuild(jobName)` | Manually trigger a build (201/200 = queued) |

## Useful extras (not yet used)

- `POST /job/{name}/buildWithParameters?PARAM=value` — trigger a parameterized
  build.
- `GET /job/{name}/{build}/api/json?tree=changeSets[items[msg,author[fullName]]]`
  — commit messages/authors for a specific build.
- `GET /job/{name}/lastBuild/api/json?tree=artifacts[...]` +
  `/artifact/{relPath}` — list and download build artifacts.
- `POST /job/{name}/{build}/stop` — abort a running build.

## Gotchas

- `lastBuild.result` is `null` while a build is running — the aggregator
  treats `building: true` as `'BUILDING'` (see `getJenkinsJobs`).
- Job names with `/` (e.g. multibranch pipelines) must be URL-encoded as
  `job/<folder>/job/<branch>/...` — `encodeURIComponent` alone is not enough
  for folder paths.
- `logText/progressiveText` returns plain text, not JSON — don't `fetchJSON`
  it.
