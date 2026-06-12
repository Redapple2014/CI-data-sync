const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const headers = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
};

const cache = new Map();

async function fetchJSON(url) {
  const res = await fetch(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub fetch failed: ${res.status} ${url}`);
  return res.json();
}

export async function getPRForCommit(owner, repo, sha) {
  if (!owner || !repo || !sha || sha.length < 7) return null;

  const cacheKey = `${owner}/${repo}/${sha}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  try {
    const pulls = await fetchJSON(
      `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/pulls`
    );

    if (!pulls || pulls.length === 0) {
      cache.set(cacheKey, null);
      return null;
    }

    const pr = pulls[0];
    const result = {
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      state: pr.merged_at ? 'merged' : pr.draft ? 'draft' : pr.state,
    };

    cache.set(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}
