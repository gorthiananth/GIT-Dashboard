// server.js
/**
 * Cloudpulse Git UI Backend - consolidated and optimized
 *
 * Improvements:
 * - Single source of truth for branch parsing
 * - Async exec usage (no blocking execSync in request handlers)
 * - Proper caches for branches and specs, with TTL and refresh lock
 * - DRY .env writer
 * - Fixed endpoints (stash, create-branch, pull, run-automation, etc.)
 * - Safer handling of user input (simple validation + escaping)
 *
 * Note: Adjust CACHE_TTL_MS / SPECS_CACHE_TTL and buffers as needed.
 */

const express = require('express');
const cors = require('cors');
const { exec: execCb } = require('child_process');
const util = require('util');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const { glob } = require('glob');

require('dotenv').config({ path: path.resolve(__dirname, '../frontend/.env') });

const exec = util.promisify(execCb);
const port = process.env.Backendport || 4000;
const repoPath = process.env.REPO_PATH || path.resolve('/Users/agorthi/Downloads/repo/manager'); // fallback to your local path
const localPackagesEnvFile = path.resolve('./packages/manager/.env');
const localPackagesEnvDir = path.dirname(localPackagesEnvFile);
const managerPath = path.join(repoPath, 'packages/manager');
const relRoot = 'cypress/e2e/core/cloudpulse';

const MAX_EXEC_BUFFER = 10 * 1024 * 1024; // 10MB

const REACT_ENVS = {
  prod: {
    REACT_APP_LOGIN_ROOT: 'https://login.linode.com',
    REACT_APP_API_ROOT: 'https://api.linode.com/v4',
    REACT_APP_CLIENT_ID: '2a772aebc1f156e412e7',
    REACT_APP_APP_ROOT: 'http://localhost:3000',
    REACT_APP_LKE_HIGH_AVAILABILITY_PRICE: '60',
    REACT_APP_LAUNCH_DARKLY_ID: '5cd5be32283709081fd70fbb',
    MANAGER_OAUTH: '703354058b618e2fdb797bc8af1188f92dd0f058a436d17c35bc2a34ed2a3426',
  },
  alpha: {
    REACT_APP_LOGIN_ROOT: 'https://login.dev.linode.com',
    REACT_APP_API_ROOT: 'https://api.dev.linode.com/v4',
    REACT_APP_CLIENT_ID: 'aa6136824c81ccc56672',
    REACT_APP_APP_ROOT: 'http://localhost:3000',
    REACT_APP_LKE_HIGH_AVAILABILITY_PRICE: '60',
    REACT_APP_LAUNCH_DARKLY_ID: '5cd5be32283709081fd70fbb',
    MANAGER_OAUTH: '9c956852ea96954acbad105b850caf2338dce03600126c5496ddb477be58ebc0',
  },
  devCloud: {
    REACT_APP_LOGIN_ROOT: 'https://login.devcloud.linode.com',
    REACT_APP_API_ROOT: 'https://api.devcloud.linode.com/v4',
    REACT_APP_CLIENT_ID: '381cd97ee70b87235d90',
    REACT_APP_APP_ROOT: 'http://localhost:3000',
    REACT_APP_LKE_HIGH_AVAILABILITY_PRICE: '60',
    REACT_APP_LAUNCH_DARKLY_ID: '5cd5be32283709081fd70fbb',
    MANAGER_OAUTH: '955ebd71b0afcd363e1f1c1a1aa76569d4d72dd247cc12ae5c29a94c01866ef9',
  },
  staging: {
    REACT_APP_LOGIN_ROOT: 'https://login.staging.linode.com',
    REACT_APP_API_ROOT: 'https://api.staging.linode.com/v4',
    REACT_APP_CLIENT_ID: 'b4b43a1c26278f2c15cd',
    REACT_APP_APP_ROOT: 'http://localhost:3000',
    REACT_APP_LKE_HIGH_AVAILABILITY_PRICE: '60',
    REACT_APP_LAUNCH_DARKLY_ID: '5cd5be32283709081fd70fbb',
    MANAGER_OAUTH: 'b082b2eacf82592994c66fab256f28a02d2ccfd74a65b3ed6182f28320e94d1e',
  }
};

// Express app
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Utilities
function formatEnv(config) {
  return Object.entries(config)
    .map(([key, value]) => {
      if (typeof value === 'string') {
        value = value.trim().replace(/%$/, ''); // Trim and drop trailing %
      }
      return `${key}='${value}'`;
    })
    .join('\n');
}

function replacePlaceholders(template, values) {
  return template.replace(/{{(.*?)}}/g, (_, key) => values[key] || '');
}

/**
 * Simple shell argument escaper for single-argument usage
 * NOTE: Not a replacement for proper shell utilities in complex cases
 */
function shellEscapeArg(arg = '') {
  return `'${String(arg).replace(/'/g, `'\\''`)}'`;
}

// ----------------- GIT Helpers (async) -----------------

async function execGit(cmd, cwd = repoPath, opts = {}) {
  const options = { cwd, maxBuffer: MAX_EXEC_BUFFER, ...opts };
  try {
    const { stdout, stderr } = await exec(cmd, options);
    return { stdout: stdout.toString(), stderr: stderr ? stderr.toString() : '' };
  } catch (err) {
    // err may have stdout/stderr or message
    const stdout = (err.stdout || '').toString();
    const stderr = (err.stderr || err.message || '').toString();
    throw new Error(stderr || stdout || err.message);
  }
}

async function getRemotesAsync(repo) {
  try {
    const { stdout } = await execGit('git remote', repoPath);
    return stdout.split('\n').map(s => s.trim()).filter(Boolean);
  } catch (err) {
    console.error('getRemotesAsync error:', err.message || err);
    return [];
  }
}

function parseGitDateISO(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).replace(',', '');
}

/**
 * Parse reflog "branch: Created from ..." lines or a variety of formats
 * We'll attempt to extract a date/time if present. If not, return null.
 */
function parseGitReflogDate(reflogLine) {
  if (!reflogLine) return null;
  // Example patterns: "Jan 02, 2024, 15:04" or full ISO in braces from reflog
  const isoMatch = reflogLine.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  if (isoMatch) return new Date(isoMatch[0]);
  const friendlyMatch = reflogLine.match(/([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4}),\s+(\d{2}):(\d{2})/);
  if (!friendlyMatch) return null;
  const [, monthStr, day, year, hour, minute] = friendlyMatch;
  const monthMap = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };
  const month = monthMap[monthStr] ?? 0;
  return new Date(Number(year), month, Number(day), Number(hour), Number(minute));
}

/**
 * Extract 'createdFrom' for a branch name.
 * Prefer upstream tracking (if available elsewhere), but fallback to 'prefix' before slash.
 */
function extractCreatedFromFromName(branchName) {
  if (!branchName) return '';
  // If branch name contains slash, common pattern origin/branchName
  const parts = branchName.split('/');
  if (parts.length > 1 && parts[0]) return parts[0];
  // Fallback: try regex _remotename_More_... pattern (older style)
  const m = branchName.match(/_([a-zA-Z0-9\-_]+)_/);
  return m ? m[1] : '';
}

// ----------------- Branch & Specs Caching -----------------

let cachedBranches = [];
let branchesCacheTS = 0;
let branchesRefreshing = false;

let cachedSpecs = [];
let specsCacheTS = 0;
let specsRefreshing = false;

const BRANCH_CACHE_TTL = 30 * 1000; // 30s
const SPECS_CACHE_TTL = 60 * 1000; // 60s

async function refreshBranchesCache() {
  if (branchesRefreshing) return; // already running
  branchesRefreshing = true;
  try {
    // Get all branch names
    const { stdout: branchNamesOut } = await execGit(`git for-each-ref --format="%(refname:short)" refs/heads`, repoPath);
    const names = branchNamesOut.trim().split('\n').map(s => s.trim()).filter(Boolean);

    const remotes = await getRemotesAsync();

    const results = [];

    for (const name of names) {
      try {
        // createdAt: first commit date (ISO)
        const { stdout: createdAtRaw } = await execGit(`git log --reverse --format="%aI" ${name} | head -1`, repoPath);
        const createdAt = parseGitDateISO(createdAtRaw.trim());

        // reflog line: grab one that mentions "branch: Created from" if present
        let reflogDate = '';
        try {
          const { stdout: reflogOut } = await execGit(
            `git reflog show ${name} --date=format:'%b %d, %Y, %H:%M' | grep "branch: Created from" | head -1`,
            repoPath
          );
          const match = reflogOut.trim();
          const parsed = parseGitReflogDate(match);
          reflogDate = parsed ? parseGitDateISO(parsed.toISOString()) : '';
        } catch (_) {
          reflogDate = '';
        }

        // try to determine upstream/tracking
        let createdFrom = '';
        try {
          const { stdout: up } = await execGit(
            `git for-each-ref --format='%(upstream:short)' refs/heads/${name}`,
            repoPath
          );
          createdFrom = (up || '').trim();
        } catch (_) {
          createdFrom = '';
        }
        if (!createdFrom) {
          createdFrom = extractCreatedFromFromName(name);
        }

        results.push({
          name,
          createdAt: createdAt || '',
          date: reflogDate || '',
          createdFrom
        });
      } catch (err) {
        console.error(`Error processing branch ${name}:`, (err && err.message) || err);
        results.push({ name, createdAt: '', date: '', createdFrom: '' });
      }
    }

    cachedBranches = results;
    branchesCacheTS = Date.now();
    // console.log(`[cache] branches updated: ${cachedBranches.length}`);
  } catch (err) {
    console.error('refreshBranchesCache error:', err.message || err);
  } finally {
    branchesRefreshing = false;
  }
}

async function refreshSpecsCache() {
  if (specsRefreshing) return;
  specsRefreshing = true;
  try {
    const files = await glob(`${relRoot}/**/*.spec.{ts,js}`, { cwd: managerPath });
    cachedSpecs = files || [];
    specsCacheTS = Date.now();
    // console.log(`[cache] specs updated: ${cachedSpecs.length}`);
  } catch (err) {
    console.error('refreshSpecsCache error:', err.message || err);
  } finally {
    specsRefreshing = false;
  }
}

// Kick off initial refresh
(async () => {
  await Promise.all([refreshBranchesCache(), refreshSpecsCache()]);
  // schedule periodic refresh as a soft background refresh
  setInterval(() => {
    if (Date.now() - branchesCacheTS > BRANCH_CACHE_TTL) refreshBranchesCache();
    if (Date.now() - specsCacheTS > SPECS_CACHE_TTL) refreshSpecsCache();
  }, Math.min(BRANCH_CACHE_TTL, SPECS_CACHE_TTL));
})();

// ----------------- Routes -----------------

/** /env - write environment files for chosen env */
app.get('/env', async (req, res) => {
  try {
    const env = (req.query.env || 'prod').toString();
    const config = REACT_ENVS[env];
    if (!config) {
      return res.status(400).json({ success: false, error: `Unknown env '${env}'` });
    }

    const repoEnvFile = path.join(repoPath, '.env');
    const repoPackagesDir = path.join(repoPath, 'packages', 'manager');
    const repoPackagesEnvFile = path.join(repoPackagesDir, '.env');

    const destinations = [
      { dir: repoPath, file: repoEnvFile },
      { dir: repoPackagesDir, file: repoPackagesEnvFile },
      { dir: localPackagesEnvDir, file: localPackagesEnvFile },
    ];

    const contents = formatEnv(config);

    for (const dest of destinations) {
      if (!fs.existsSync(dest.dir)) fs.mkdirSync(dest.dir, { recursive: true });
      if (fs.existsSync(dest.file)) fs.unlinkSync(dest.file);
      fs.writeFileSync(dest.file, contents, 'utf8');
      console.log(`Wrote .env to ${dest.file}`);
    }

    // Optional export line
    const CYPRESS_MANAGER_OAUTH = config.CYPRESS_MANAGER_OAUTH || config.MANAGER_OAUTH;
    if (CYPRESS_MANAGER_OAUTH) {
      console.log(`export CYPRESS_MANAGER_OAUTH='${CYPRESS_MANAGER_OAUTH}'`);
    }

    res.json({ success: true, message: `Environment file(s) written for '${env}'`, envKey: env, config });
  } catch (err) {
    console.error('/env error:', err.message || err);
    res.status(500).json({ success: false, error: err.message || 'Failed to write env files' });
  }
});

/** /remotes - list git remotes */
app.get('/remotes', async (req, res) => {
  try {
    const remotes = await getRemotesAsync(repoPath);
    res.json({ success: true, remotes });
  } catch (err) {
    console.error('/remotes error:', err.message || err);
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch remotes' });
  }
});

/** /branches - return cached branches (refreshed if TTL expired) */
app.get('/branches', async (req, res) => {
  try {
    if (Date.now() - branchesCacheTS > BRANCH_CACHE_TTL) {
      // refresh asynchronously but wait briefly to avoid returning stale empty data first-time
      await refreshBranchesCache();
    }
    // sort by date (reflog date or createdAt)
    const sorted = [...cachedBranches].sort((a, b) => {
      const da = new Date(a.date || a.createdAt || 0).getTime();
      const db = new Date(b.date || b.createdAt || 0).getTime();
      return db - da;
    });
    res.json(sorted);
  } catch (err) {
    console.error('/branches error:', err.message || err);
    res.status(500).json({ success: false, error: err.message || 'Failed to list branches' });
  }
});

/** /search-branches?q= - filter cached branches */
app.get('/search-branches', async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim().toLowerCase();
    if (Date.now() - branchesCacheTS > BRANCH_CACHE_TTL) await refreshBranchesCache();
    if (!q) return res.json(cachedBranches);
    const filtered = cachedBranches.filter(b =>
      b.name.toLowerCase().includes(q) ||
      (b.date || '').toLowerCase().includes(q) ||
      (b.createdAt || '').toLowerCase().includes(q)
    );
    res.json(filtered);
  } catch (err) {
    console.error('/search-branches error:', err.message || err);
    res.status(500).json({ success: false, error: err.message || 'Search failed' });
  }
});

/** /delete-branch - body: {branch} */
app.post('/delete-branch', async (req, res) => {
  try {
    const branch = (req.body.branch || '').toString();
    if (!branch || !/^[\w\-_/]+$/.test(branch)) {
      return res.status(400).json({ success: false, error: 'Invalid branch name.' });
    }
    // Use -D with proper escaping
    await execGit(`git branch -D ${shellEscapeArg(branch)}`, repoPath);
    await refreshBranchesCache();
    res.json({ success: true, message: `Branch ${branch} deleted.` });
  } catch (err) {
    console.error('/delete-branch error:', err.message || err);
    res.status(500).json({ success: false, error: err.message || 'Failed to delete branch' });
  }
});

/** /ts-file-stats?branch= - show stats for last 3 commits */
app.get('/ts-file-stats', async (req, res) => {
  try {
    const branch = (req.query.branch || 'HEAD').toString();
    if (!/^[\w\-\/]+$/.test(branch)) return res.status(400).json({ error: 'Invalid branch name.' });

    const cmd = `git log -n 3 --numstat --pretty=format: ${shellEscapeArg(branch)}`;
    const { stdout } = await execGit(cmd, repoPath);
    const lines = stdout.trim().split('\n').filter(Boolean);
    const statsMap = {};
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 3) continue;
      const [addedStr, deletedStr, file] = parts;
      if (!file.endsWith('.ts')) continue;
      const added = addedStr === '-' ? 0 : parseInt(addedStr, 10);
      const deleted = deletedStr === '-' ? 0 : parseInt(deletedStr, 10);
      if (!statsMap[file]) statsMap[file] = { added: 0, deleted: 0 };
      statsMap[file].added += (Number.isNaN(added) ? 0 : added);
      statsMap[file].deleted += (Number.isNaN(deleted) ? 0 : deleted);
    }
    const result = Object.entries(statsMap).map(([file, { added, deleted }]) => ({
      file, added, deleted, net: added - deleted
    }));
    res.json(result);
  } catch (err) {
    console.error('/ts-file-stats error:', err.message || err);
    res.status(500).json({ error: err.message || 'Failed to compute ts-file-stats' });
  }
});

/** /create-branch - body: { remoteRepo, targetBranch, branchName } */
app.post('/create-branch', async (req, res) => {
  try {
    const { remoteRepo, targetBranch, branchName } = req.body;
    if (![remoteRepo, targetBranch, branchName].every(Boolean)) {
      return res.status(400).json({ error: 'Missing remoteRepo, targetBranch, or branchName.' });
    }
    // validate simple names
    if (!/^[\w\-]+$/.test(remoteRepo) || !/^[\w\-\/]+$/.test(targetBranch) || !/^[\w\-]+$/.test(branchName)) {
      return res.status(400).json({ error: 'Invalid characters in input.' });
    }

    // Building branch suffix with month/day (English)
    const now = new Date();
    const month = now.toLocaleString('en-US', { month: 'long' });
    const day = String(now.getDate()).padStart(2, '0');
    const newBranch = `${branchName}_${remoteRepo}_${month}_${day}`;

    await execGit(`git fetch ${shellEscapeArg(remoteRepo)}`, repoPath);

    // verify remote branch exists
    try {
      await execGit(`git show-ref --verify --quiet refs/remotes/${remoteRepo}/${targetBranch}`, repoPath);
    } catch (err) {
      return res.status(400).json({ error: `Remote branch ${remoteRepo}/${targetBranch} does not exist.` });
    }

    // create and checkout new branch
    await execGit(`git checkout -b ${shellEscapeArg(newBranch)} ${shellEscapeArg(`${remoteRepo}/${targetBranch}`)}`, repoPath);

    // Refresh cache
    await refreshBranchesCache();

    res.json({
      success: true,
      branch: newBranch,
      message: `Branch ${newBranch} created and checked out successfully.`,
    });
  } catch (err) {
    console.error('/create-branch error:', err.message || err);
    res.status(500).json({ success: false, error: err.message || 'Failed to create branch' });
  }
});

/** /pull-and-pnpm - pulls tracked upstream for current branch */
app.post('/pull-and-pnpm', async (req, res) => {
  try {
    // 1. current branch
    const { stdout: curBranchStdout } = await execGit('git branch --show-current', repoPath);
    const current_branch = curBranchStdout.trim();
    if (!current_branch) return res.status(500).json({ success: false, message: 'Could not determine current branch.' });

    // 2. get tracking info (git branch -vv)
    const { stdout: branchesStdout } = await execGit('git branch -vv', repoPath);
    const lines = branchesStdout.split('\n');
    let remote_branch_info = '';
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts[0] === '*' && parts[1] === current_branch && parts[3]) {
        remote_branch_info = parts[3].replace(/[\[\]]/g, '');
        break;
      }
    }

    let remote_name = '', branch_name = '';
    if (remote_branch_info) {
      const idx = remote_branch_info.indexOf('/');
      if (idx >= 0) {
        remote_name = remote_branch_info.slice(0, idx);
        branch_name = remote_branch_info.slice(idx + 1);
      }
    }

    let pullResult = '';
    let errorMsg = '';
    if (remote_branch_info) {
      try {
        const { stdout } = await execGit(`git pull ${shellEscapeArg(remote_name)} ${shellEscapeArg(branch_name)}`, repoPath);
        pullResult = stdout.trim();
      } catch (e) {
        errorMsg = e.message || e;
      }
    }

    // Optionally run pnpm install (uncomment if desired)
    // const { stdout: pnpmOut } = await execGit('pnpm install', repoPath);

    let message = '';
    if (remote_branch_info) {
      if (errorMsg) {
        message = `Failed to pull changes into branch "${current_branch}" from remote "${remote_name}/${branch_name}". Error: ${errorMsg}`;
      } else {
        message = `Successfully pulled changes into branch "${current_branch}" from remote "${remote_name}/${branch_name}".`;
      }
    } else {
      message = `Branch "${current_branch}" is not tracking any remote branch. Pull skipped.`;
    }

    res.json({
      success: !!(remote_branch_info && !errorMsg),
      current_branch,
      remote_branch_info,
      remote_name,
      branch_name,
      message,
      git_branch_vv: branchesStdout,
      pullResult
    });
  } catch (err) {
    console.error('/pull-and-pnpm error:', err.message || err);
    res.status(500).json({ success: false, message: err.message || 'pull failed' });
  }
});

/** /run-automation - start cypress via Terminal (macOS) */
app.post('/run-automation', async (req, res) => {
  try {
    // Accept either specPaths array or specPath string
    const specs = Array.isArray(req.body.specPaths)
      ? req.body.specPaths
      : (typeof req.body.specPath === 'string' ? [req.body.specPath] : []);
    if (!specs.length) {
      return res.status(400).json({ success: false, error: "No spec filename(s) provided." });
    }

    const joinedSpecs = specs.join(',');
    const cdDir = repoPath; // use configured repoPath
    const cyCommand = [
      `cd ${shellEscapeArg(cdDir)}`,
      `pnpm cy:run -s ${shellEscapeArg(joinedSpecs)}`,
      `echo`,
      `echo "[Cypress finished. Press Enter to close.]"`,
      `read`
    ].join(' && ');

    // Escape double quotes for AppleScript
    const appleScriptCmd = `osascript -e ${shellEscapeArg(`tell application "Terminal" to do script "${cyCommand.replace(/"/g, '\\"')}"`)}`;

    // Launch terminal (macOS)
    execCb(appleScriptCmd, (error, stdout, stderr) => {
      if (error) {
        console.error('osascript error:', stderr || error.message);
        return res.status(500).json({ success: false, error: stderr || error.message });
      }
      return res.json({ success: true, message: 'Cypress test(s) launched in a new Terminal window.', filesRun: specs });
    });
  } catch (err) {
    console.error('/run-automation error:', err.message || err);
    res.status(500).json({ success: false, error: err.message || 'Failed to launch automation' });
  }
});

/** /start-service - spawn dev server in new Terminal (macOS) */
app.get('/start-service', (req, res) => {
  try {
    res.json({ success: true, message: "Launching dev commands in a new Terminal window..." });

    const devCommand = [
      `cd ${shellEscapeArg(repoPath)}`,
      'lsof -ti:3000 | xargs kill -9 || true',
      `pnpm dev; echo; echo 'Dev server terminated. Press Enter to close.'; read`
    ].join(' && ');

    function escapeAppleScriptStr(s) {
      // escape backslashes and double quotes for AppleScript inline string
      return s.replace(/([\\"])/g, '\\$1');
    }
    const script = escapeAppleScriptStr(devCommand);
    const osaScriptCmd = `osascript -e "tell application \\"Terminal\\" to do script \\"${script}\\""`; 

    execCb(osaScriptCmd, (err, stdout, stderr) => {
      if (err) {
        console.error('Error launching terminal:', stderr || err.message);
      } else {
        console.log('Dev terminal launched.');
      }
    });
  } catch (err) {
    console.error('/start-service error:', err.message || err);
  }
});

/** /get-branches-tracking-remote?remote=aclp */
app.get('/get-branches-tracking-remote', async (req, res) => {
  try {
    const remote = (req.query.remote || '').toString();
    if (!remote) {
      return res.status(400).json({ success: false, message: "Missing required query parameter: 'remote'." });
    }
    // Use git branch -vv and filter locally
    const { stdout } = await execGit(`git branch -vv`, repoPath);
    const lines = stdout.split('\n');
    const branches = lines
      .map(l => l.trim())
      .filter(l => l.includes(`${remote}/`))
      .map(l => {
        // remove leading '* ' if present and return first token as branch name
        const cleaned = l.replace(/^\* /, '');
        const parts = cleaned.split(/\s+/);
        return parts[0];
      })
      .filter(Boolean);

    const start = Date.now();
    const duration = `${((Date.now() - start) / 1000).toFixed(2)}s`;

    if (branches.length === 0) {
      return res.json({ success: false, remote, count: 0, duration, message: 'No branches found for remote', branches: [] });
    }
    res.json({ success: true, remote, count: branches.length, duration, message: `Fetched ${branches.length} branches`, branches });
  } catch (err) {
    console.error('/get-branches-tracking-remote error:', err.message || err);
    res.status(500).json({ success: false, message: 'Failed to fetch branches for remote', error: err.message || err });
  }
});

/** /get-remote-names - list remotes */
app.get('/get-remote-names', async (req, res) => {
  try {
    const remotes = await getRemotesAsync(repoPath);
    res.json({ success: true, count: remotes.length, remotes, message: 'Git remote names fetched successfully.' });
  } catch (err) {
    console.error('/get-remote-names error:', err.message || err);
    res.status(500).json({ success: false, message: 'Failed to fetch Git remote names.', error: err.message || err });
  }
});

/** /stash - stash changes */
app.get('/stash', async (req, res) => {
  try {
    const { stdout } = await execGit('git stash', repoPath);
    // After stash, get current branch
    const { stdout: branchStdout } = await execGit('git rev-parse --abbrev-ref HEAD', repoPath);
    const branchName = branchStdout.trim();
    // Refresh branches cache optionally
    refreshBranchesCache();
    res.json({ success: true, message: stdout.trim() || 'Stash complete.', branch: branchName });
  } catch (err) {
    console.error('/stash error:', err.message || err);
    res.status(500).json({ success: false, error: err.message || 'Stash failed' });
  }
});

/** /current-branch */
app.get('/current-branch', async (req, res) => {
  try {
    const { stdout } = await execGit('git rev-parse --abbrev-ref HEAD', repoPath);
    res.json({ success: true, branch: stdout.trim() });
  } catch (err) {
    console.error('/current-branch error:', err.message || err);
    res.status(500).json({ success: false, error: err.message || 'Failed to get current branch' });
  }
});

/** /checkout-branch - body: { branch } */
app.post('/checkout-branch', async (req, res) => {
  try {
    const branch = (req.body.branch || '').toString();
    if (!branch) return res.status(400).json({ success: false, error: 'Branch name is required.' });
    await execGit(`git checkout ${shellEscapeArg(branch)}`, repoPath);
    await refreshBranchesCache();
    res.json({ success: true, message: `Checked out to branch "${branch}"` });
  } catch (err) {
    console.error('/checkout-branch error:', err.message || err);
    res.status(500).json({ success: false, error: err.message || 'Checkout failed' });
  }
});

/** /list-specs - list cached specs */
app.get('/list-specs', async (req, res) => {
  try {
    if (Date.now() - specsCacheTS > SPECS_CACHE_TTL) await refreshSpecsCache();
    res.json(cachedSpecs);
  } catch (err) {
    console.error('/list-specs error:', err.message || err);
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch specs' });
  }
});

// Fallback root
app.get('/', (req, res) => res.json({ success: true, message: 'Cloudpulse Git UI Backend running' }));

// Single app.listen
app.listen(port, () => {
  console.log(`CloudpulseGitUI Backend Server listening on port ${port} (repoPath=${repoPath})`);
});