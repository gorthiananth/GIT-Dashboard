const express = require('express');
const cors = require('cors');
const { exec, execSync, spawn } = require('child_process');
const util = require('util');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const { glob } = require('glob')	

require('dotenv').config({ path: path.resolve(__dirname, '../frontend/.env') });
const execAsync = util.promisify(exec);
const port = process.env.Backendport;  // Ensure this matches your frontend's API_URL port
const repoPath = process.env.REPO_PATH;
//const repoPath = '/Users/agorthi/Downloads/repo/manager';
const localPackagesEnvFile = path.resolve('./packages/manager/.env');
const localPackagesEnvDir = path.dirname(localPackagesEnvFile);


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
// Initialize Express app
const app = express();
// Middleware to enable CORS and parse JSON bodies
app.use(cors());
app.use(express.json());

function formatEnv(config) {
  return Object.entries(config)
    .map(([key, value]) => {
      if (typeof value === 'string') {
        value = value.trim().replace(/%$/, ''); // Trim whitespace and remove trailing %
      }
      return `${key}='${value}'`;
    })
    .join('\n');
}
function replacePlaceholders(template, values) {
  return template.replace(/{{(.*?)}}/g, (_, key) => values[key] || '');
}


app.get('/env', (req, res) => {
  try {
    const env = req.query.env || 'alpha';
    const config = REACT_ENVS[env];

    if (!config) throw new Error(`No config for env: ${env}`);

    // 1) Create repo .env at /Users/agorthi/Downloads/repo/manager/.env
    const repoEnvFile = path.join(repoPath, '.env');
    fs.writeFileSync(repoEnvFile, formatEnv(config), 'utf8');
    console.log(`Created .env at repo root: ${repoEnvFile}`);

    // 2) Copy to ./packages/manager/.env relative inside repoPath (like cd into repoPath)
    const repoPackagesDir = path.join(repoPath, 'packages', 'manager');
    const repoPackagesEnvFile = path.join(repoPackagesDir, '.env');
    if (!fs.existsSync(repoPackagesDir)) {
      fs.mkdirSync(repoPackagesDir, { recursive: true });
      console.log(`Created directory: ${repoPackagesDir}`);
    }
    if (fs.existsSync(repoPackagesEnvFile)) {
      fs.unlinkSync(repoPackagesEnvFile);
      console.log(`Removed existing .env at repo packages path: ${repoPackagesEnvFile}`);
    }
    fs.copyFileSync(repoEnvFile, repoPackagesEnvFile);
    console.log(`Copied .env inside repo at: ${repoPackagesEnvFile}`);

    // 3) Copy to local backend ./packages/manager/.env (relative to current cwd)
    if (!fs.existsSync(localPackagesEnvDir)) {
      fs.mkdirSync(localPackagesEnvDir, { recursive: true });
      console.log(`Created local packages directory: ${localPackagesEnvDir}`);
    }
    if (fs.existsSync(localPackagesEnvFile)) {
      fs.unlinkSync(localPackagesEnvFile);
      console.log(`Removed existing local .env at: ${localPackagesEnvFile}`);
    }
    fs.copyFileSync(repoEnvFile, localPackagesEnvFile);
    console.log(`Copied .env to local backend path: ${localPackagesEnvFile}`);

    // Log contents
    console.log(`Contents of repo root .env:\n${fs.readFileSync(repoEnvFile, 'utf8')}`);
    console.log(`Contents of repo packages .env:\n${fs.readFileSync(repoPackagesEnvFile, 'utf8')}`);
    console.log(`Contents of local backend packages .env:\n${fs.readFileSync(localPackagesEnvFile, 'utf8')}`);

    // Export line for token
    const CYPRESS_MANAGER_OAUTH = config.CYPRESS_MANAGER_OAUTH || config.MANAGER_OAUTH;
    if (CYPRESS_MANAGER_OAUTH) {
      console.log(`export CYPRESS_MANAGER_OAUTH='${CYPRESS_MANAGER_OAUTH}'`);
    } else {
      console.warn('No CYPRESS_MANAGER_OAUTH or MANAGER_OAUTH found in config');
    }

    res.json({ envKey: env, config });
  } catch (error) {
    console.error('Error in /env:', error);
    res.status(500).json({ error: 'Could not generate env.' });
  }
});




// Fetch remotes dynamically from Git repo

function getRemotes(repoPath) {
  try {
    const remotesOutput = execSync('git remote', { cwd: repoPath }).toString().trim();
    const remotes = remotesOutput.split('\n').map(r => r.trim()).filter(Boolean);
    return remotes;
  } catch (err) {
    console.error('Failed to fetch git remotes:', err);
    return [];
  }
}

// Dynamically build regex for remotes to parse createdFrom from branch name

const remotes = getRemotes(repoPath);

const remotesPattern = remotes.length > 0 ? remotes.join('|') : '';

const remoteRegex = remotesPattern ? new RegExp(`_(${remotesPattern})_[A-Za-z]+_\\d+$`) : null;



function extractCreatedFrom(branchName) {

  if (remoteRegex) {

    const match = branchName.match(remoteRegex);

    return match ? match[1] : '';

  }

  return '';

}

/** ----------get  remotes ---------- **/

app.get('/remotes', (req, res) => {
  try {
    const remotes = getRemotes(repoPath);
    console.log("Remotes sent to frontend:", remotes); // DEBUG LOG
    res.json({ remotes });
  } catch (err) {
    console.error('Failed to fetch git remotes:', err);
    res.status(500).json({ error: 'Could not fetch remotes.' });
  }
});


/** ---------- Branch info & cache utils ---------- **/

function getAllBranchNames() {
  const cmd = `git for-each-ref --format="%(refname:short)" refs/heads`;
  try {
    const output = execSync(cmd, { cwd: repoPath }).toString().trim();
    return output ? output.split('\n') : [];
  } catch (error) {
    console.error(`Error in getAllBranchNames: ${error.message}`);
    return [];
  }
}

function getBranchesWithCreationDate() {
  const branchNames = getAllBranchNames();
  return branchNames.map((name) => {
    try {
      const firstCommitDate = execSync(
        `git log --reverse --format="%aI" ${name} | head -1`, { cwd: repoPath }
      ).toString().trim();
      const lastCommitDate = execSync(
        `git log -1 --format="%cI" ${name}`, { cwd: repoPath }
      ).toString().trim();
      
      // Get upstream branch (remote/branch)
      let createdFrom = '';
      try {
        createdFrom = execSync(
          `git for-each-ref --format='%(upstream:short)' refs/heads/${name}`, 
          { cwd: repoPath }
        ).toString().trim();
      } catch (_) {
        createdFrom = '';
      }

      // fallback to parsing from branchName if upstream missing
      if (!createdFrom) createdFrom = extractCreatedFrom(name);

      return {
        name,
        date: lastCommitDate,
        createdAt: firstCommitDate,
        createdFrom
      };
    } catch (error) {
      console.error(`Error getting info for branch ${name}: ${error.message}`);
      return { name, date: '', createdAt: '', createdFrom: '' };
    }
  });
}

let cachedBranches = [];
let lastCacheTime = 0;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

function refreshCache() {
  try {
    cachedBranches = getBranchesWithCreationDate();
    lastCacheTime = Date.now();
    console.log(`[Cache] Updated with ${cachedBranches.length} branches.`);
  } catch (err) {
    console.error('[Cache] Failed to refresh:', err);
  }
}

// Initial cache refresh and set interval
refreshCache();
setInterval(refreshCache, CACHE_TTL_MS);

/** ------------ Branch endpoints ----------------- **/

app.get('/branches', (req, res) => {
  console.log('GET /branches hit');
  if (Date.now() - lastCacheTime > CACHE_TTL_MS) refreshCache();
  const sorted = [...cachedBranches].sort((a, b) =>
    (b.date ?? '').localeCompare(a.date ?? '')
  );
  res.json(sorted);
});

app.get('/search-branches', (req, res) => {
  console.log('GET /search-branches hit');
  if (Date.now() - lastCacheTime > CACHE_TTL_MS) refreshCache();
  const q = (req.query.q || '').toLowerCase();
  if (!q) return res.json(cachedBranches);
  const filtered = cachedBranches.filter(
    (branch) =>
      branch.name.toLowerCase().includes(q) ||
      (branch.date || '').toLowerCase().includes(q) ||
      (branch.createdAt || '').toLowerCase().includes(q)
      
  );
  res.json(filtered);
});

app.post('/delete-branch', (req, res) => {
  console.log('POST /delete-branch hit');
  const { branch } = req.body;
  if (!branch || !/^[\w\-_/]+$/.test(branch)) {
    return res.status(400).json({ error: 'Invalid branch name.' });
  }
  exec(`git branch -D ${branch}`, { cwd: repoPath }, (err, stdout, stderr) => {
    if (err) {
      console.error(`Error deleting branch ${branch}: ${stderr || err.message}`);
      return res.status(500).json({ error: stderr || err.message });
    }
    console.log(`Branch ${branch} deleted.`);
    refreshCache();
    res.json({ success: true, message: stdout });
  });
});



app.get('/ts-file-stats', (req, res) => {
  console.log('GET /ts-file-stats hit');
  const branch = req.query.branch || 'HEAD';
  if (!/^[\w\-\/]+$/.test(branch)) {
    return res.status(400).json({ error: 'Invalid branch name.' });
  }
  const cmd = `git log -n 3 --numstat --pretty=format: ${branch}`;
  
  exec(cmd, { cwd: repoPath }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error fetching ts-file-stats for ${branch}: ${stderr || error.message}`);
      return res.status(500).json({ error: stderr || error.message });
    }
    const lines = stdout.trim().split('\n').filter(Boolean);
    const statsMap = {};
    lines.forEach((line) => {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 3) return;
      const [addedStr, deletedStr, file] = parts;
      if (!file.endsWith('.ts')) return;
      const added = addedStr === '-' ? 0 : parseInt(addedStr, 10);
      const deleted = deletedStr === '-' ? 0 : parseInt(deletedStr, 10);
      if (!statsMap[file]) statsMap[file] = { added: 0, deleted: 0 };
      statsMap[file].added += added;
      statsMap[file].deleted += deleted;
    });
    const result = Object.entries(statsMap).map(([file, { added, deleted }]) => ({
      file,
      added,
      deleted,
      net: added - deleted,
    }));
    // Always return 200, even if empty array
    if (result.length === 0) {
      console.log(`No ts-file-stats found for ${branch}`);
      return res.status(200).json([]); // Return empty array, not 404
    }
    console.log(`Ts-file-stats fetched for ${branch}`);
    res.json(result);
  });
});

// Example: app.listen...

/** ------------ Create Branch: /create-branch ------------ **/

app.post('/create-branch', (req, res) => {
  console.log('POST /create-branch hit');
  const { remoteRepo, targetBranch, branchName } = req.body;
  if (![remoteRepo, targetBranch, branchName].every(Boolean)) {
    return res.status(400).json({ error: 'Missing remoteRepo, targetBranch, or branchName.' });
  }
  const now = new Date();
  const month = now.toLocaleString('en-US', { month: 'long' });
  const day = String(now.getDate()).padStart(2, '0');
  const newBranch = `${branchName}_${remoteRepo}_${month}_${day}`;

  // Step 1: git fetch remote
  exec(`git fetch ${remoteRepo}`, { cwd: repoPath }, (fetchErr) => {
    if (fetchErr) {
      console.error(`git fetch failed for ${remoteRepo}: ${fetchErr.message}`);
      return res.status(500).json({ error: `git fetch failed: ${fetchErr.message}` });
    }
    console.log(`git fetch ${remoteRepo} successful.`);

    // Step 2: Verify remote branch exists
    exec(
      `git show-ref --verify --quiet refs/remotes/${remoteRepo}/${targetBranch}`,
      { cwd: repoPath },
      (refErr) => {
        if (refErr) {
          console.error(`Remote branch ${remoteRepo}/${targetBranch} does not exist.`);
          return res.status(400).json({ error: `Remote branch ${remoteRepo}/${targetBranch} does not exist.` });
        }
        console.log(`Remote branch ${remoteRepo}/${targetBranch} verified.`);

        // Step 3: Create and checkout new branch from remote branch
        exec(
          `git checkout -b ${newBranch} ${remoteRepo}/${targetBranch}`,
          { cwd: repoPath },
          (checkoutErr) => {
            if (checkoutErr) {
              console.error(`Branch creation failed for ${newBranch}: ${checkoutErr.message}`);
              return res.status(500).json({ error: `Branch creation failed: ${checkoutErr.message}` });
            }
            console.log(`Branch ${newBranch} created and checked out.`);

            // Refresh cache after successful branch creation
            try {
              refreshCache();
              console.log('Cache refreshed after branch creation.');
            } catch (cacheErr) {
              console.error('Cache refresh failed after branch creation:', cacheErr);
            }

            return res.json({
              success: true,
              branch: newBranch,
              message: `Branch ${newBranch} created and checked out successfully after fetching every time.`,
            });
          }
        );
      }
    );
  });
});


/** ----------- Pull ----------- **/

app.post('/pull-and-pnpm', async (req, res) => {
  console.log('POST /pull-and-pnpm hit');
  try {
    // 1. Get current branch
    const { stdout: curBranchStdout } = await execAsync('git branch --show-current', { cwd: repoPath });
    const current_branch = curBranchStdout.trim();
    console.log(`Current branch: ${current_branch}`);

    // 2. Get tracking info using 'git branch -vv'
    const { stdout: branchesStdout } = await execAsync('git branch -vv', { cwd: repoPath });
    console.log(`git branch -vv output:\n${branchesStdout}`);

    // 3. Extract tracking remote/branch
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
      remote_name = remote_branch_info.split('/')[0];
      branch_name = remote_branch_info.split('/').slice(1).join('/');
      console.log(`Pulling changes from remote: ${remote_name}, branch: ${branch_name}`);
    } else {
      console.log('Current branch is not tracking a remote branch.');
    }

    // 4. If branch is tracking a remote, pull from it
    let pullOutput = '', errorMsg = '';
    if (remote_branch_info) {
      try {
        console.log(`Executing: git pull ${remote_name} ${branch_name}`);
        const { stdout } = await execAsync(`git pull ${remote_name} ${branch_name}`, { cwd: repoPath });
        pullOutput = stdout.trim();
        console.log(`Git pull successful:\n${pullOutput}`);
      } catch (e) {
        errorMsg = e.stderr || e.message;
        console.error(`Error during git pull: ${errorMsg}`);
      }
    }

    // 5. Compose response with polished pull message
    let message = '';
    if (remote_branch_info) {
      if (errorMsg) {
        message = `Failed to pull changes into branch "${current_branch}" from remote branch "${remote_name}/${branch_name}". Error: ${errorMsg}`;
      } else {
        message = `Successfully pulled changes into branch "${current_branch}" from remote branch "${remote_name}/${branch_name}".`;
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
    });
  } catch (err) {
    console.error('Server-side error in /pull-and-pnpm:', err.stderr || err.message);
    res.status(500).json({ success: false, message: err.stderr || err.message });
  }
});



/** --------------- Cypress Automation /run-automation -------------- **/


app.post('/run-automation', async (req, res) => {
  try {
    // Accept both an array or single string for specPath(s)
    const specs = Array.isArray(req.body.specPaths)
      ? req.body.specPaths
      : (typeof req.body.specPath === 'string' ? [req.body.specPath] : []);
    if (!specs.length) {
      return res.status(400).json({ success: false, error: "No spec filename(s) provided." });
    }

    // Join for Cypress CLI
    const joinedSpecs = specs.join(',');
    const cdDir = '/Users/agorthi/Downloads/repo/manager';
    const cyCommand = [
      `cd '${cdDir}'`,
      `pnpm cy:run -s "${joinedSpecs}"`,
      `echo`,
      `echo "[Cypress finished. Press Enter to close.]"`,
      `read`
    ].join(' && ');

    // Escape double quotes for AppleScript only
    const appleScriptCmd = `osascript -e 'tell application "Terminal" to do script "${cyCommand.replace(/"/g, '\\"')}"'`;

    // Print out for debugging - you may copy-paste this in Terminal for instant feedback
    console.log("osascript command:\n", appleScriptCmd);

    exec(appleScriptCmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error launching Cypress:`, stderr || error.message);
        return res.status(500).json({ success: false, error: stderr || error.message });
      }
      return res.json({
        success: true,
        message: 'Cypress test(s) launched in a new Terminal window.',
        filesRun: specs
      });
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});




/** --------------- Start Service: /start-service --------------- **/


app.get('/start-service', (req, res) => {
  console.log('GET /start-service endpoint hit!');
  res.json({ success: true, message: "We are in progress..." });
  console.log('Sent immediate "in progress" response.');

  // Use single quotes in your echo to avoid AppleScript interpretation issues
  const devCommand = [
    `cd '${repoPath}'`,
    'lsof -ti:3000 | xargs kill -9',
    `pnpm dev; echo; echo 'Dev server terminated. Press Enter to close.'; read`
  ].join(' && ');

  // Escape for AppleScript (escape \ and ")
  function escapeAppleScript(str) {
    return str.replace(/([\\"])/g, '\\$1');
  }

  const script = escapeAppleScript(devCommand);

  const osaScriptCmd =
    `osascript -e "tell application \\"Terminal\\" to do script \\"${script}\\""`; 

  exec(
    osaScriptCmd,
    (err, stdout, stderr) => {
      if (err) {
        console.error('Error launching terminal:', stderr || err.message);
      } else {
        console.log('All pnpm commands, including dev, launched in new Terminal window (macOS).');
      }
    }
  );
});


/** --------------- stash--------------- **/

/** --------------- get-remote-bybranches--------------- **/


app.get('/get-branches-tracking-remote', (req, res) => {
  const remote = req.query.remote;

  if (!remote) {
    return res.status(400).json({
      success: false,
      message: "Missing required query parameter: 'remote'. Example: /get-branches-tracking-remote?remote=aclp"
    });
  }

  const command = `git branch -vv | grep '${remote}/' | sed 's/^\\* //' | awk '{print $1}'`;
  const start = Date.now();

  exec(command, { cwd: repoPath, timeout: 10000 }, (error, stdout, stderr) => {
    const duration = (Date.now() - start) / 1000;

    if (error) {
      console.error(`[ERROR] Failed to fetch branches for remote '${remote}':`, stderr || error.message);
      return res.status(500).json({
        success: false,
        message: `Failed to fetch branches tracking remote '${remote}'. Please ensure the remote exists and git repo is valid.`,
        error: stderr || error.message
      });
    }

    const branches = stdout
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean); // remove empty lines

    // *** FIX: Return message if no branches found ***
    if (branches.length === 0) {
      return res.json({
        success: false,
        remote,
        count: 0,
        duration: `${duration}s`,
        message: "No branches are found with the remote.",
        branches: []
      });
    }

    console.log(`[INFO] Fetched ${branches.length} branches from remote '${remote}' in ${duration}s`);

    res.json({
      success: true,
      remote,
      count: branches.length,
      duration: `${duration}s`,
      message: `Fetched ${branches.length} branches tracking remote '${remote}' successfully.`,
      branches
    });
  });
});


/** --------------- get-remote-names--------------- **/


app.get('/get-remote-names', (req, res) => {
  const command = 'git remote';

  exec(command, { cwd: repoPath, timeout: 5000 }, (error, stdout, stderr) => {
    if (error) {
      console.error('[ERROR] Failed to fetch git remote names:', stderr || error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch Git remote names.',
        error: stderr || error.message
      });
    }

    const remoteNames = stdout
      .split('\n')
      .map(name => name.trim())
      .filter(Boolean); // remove empty lines

    res.json({
      success: true,
      count: remoteNames.length,
      message: 'Git remote names fetched successfully.',
      remotes: remoteNames
    });
  });
});

/** --------------- get-remote-names--------------- **/


/** --------------- get-remote-bybranches--------------- **/


app.get('/stash', (req, res) => {
  console.log('GET /stash hit');  // Changed to GET since your route says app.get

  try {
    exec('git stash', { cwd: repoPath }, (err, stdout, stderr) => {
      if (err) {
        console.error('[Stash] Error:', stderr || err.message);
        return res.status(500).json({ error: stderr || err.message });
      }
      
      // After stash success, get current branch name
      exec('git rev-parse --abbrev-ref HEAD', { cwd: repoPath }, (err2, branchStdout, branchStderr) => {
        if (err2) {
          console.error('[Branch] Error:', branchStderr || err2.message);
          return res.status(500).json({ error: branchStderr || err2.message });
        }

        refreshCache(); // if needed

        const branchName = branchStdout.trim();
        console.log(`Git stash completed on branch: ${branchName}`);

        res.json({
          success: true,
          message: stdout.trim() || "Stash complete.",
          branch: branchName
        });
      });
    });
  } catch (e) {
    console.error('Exception in /stash:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/current-branch', (req, res) => {
  try {
    exec('git rev-parse --abbrev-ref HEAD', { cwd: repoPath }, (err, stdout, stderr) => {
      if (err) {
        console.error('Error getting current branch:', stderr || err.message);
        return res.status(500).json({ error: stderr || err.message });
      }

      const branchName = stdout.trim();
      res.json({ success: true, branch: branchName });
    });
  } catch (e) {
      console.error('Exception in /current-branch:', e.message);
      res.status(500).json({ error: e.message });
  }
});

app.post('/checkout-branch', (req, res) => {
  const { branch } = req.body;
  if (!branch) return res.status(400).json({ success: false, error: 'Branch name is required.' });

  // Run git checkout command
  exec(`git checkout ${branch}`, { cwd: repoPath }, (error, stdout, stderr) => {
    if (error) {
      console.error('Checkout Error:', stderr);
      return res.status(500).json({ success: false, error: stderr || error.message });
    }
    console.log('Checkout Success:', stdout);
    res.json({ success: true, message: `Checked out to branch "${branch}"` });
  });
});

const managerPath = path.join(repoPath, 'packages/manager');
const relRoot = 'cypress/e2e/core/cloudpulse';

// CHANGE pattern to include ** for subfolders!
app.get('/list-specs', (req, res) => {
  glob(`${relRoot}/**/*.spec.{ts,js}`, { cwd: managerPath })
    .then(files => res.json(files))
    .catch(err => res.status(500).json({ error: err.message }));
});
// This must be the ONLY app.listen call in your entire application
app.listen(port, () => {
  console.log(`CloudpulseGitUI Backend Server listening on port ${port}`);
});
