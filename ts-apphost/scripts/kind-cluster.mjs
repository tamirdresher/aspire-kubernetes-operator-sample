import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const options = parseArgs(process.argv.slice(2));
const clusterName = requiredOption(options, 'cluster-name');
const kubeconfigPath = requiredOption(options, 'kubeconfig');
const crdPath = requiredOption(options, 'crd');
const timeoutMs = Number(requiredOption(options, 'timeout-seconds')) * 1000;

await mkdir(dirname(kubeconfigPath), { recursive: true });

if (!(await tryReuseExistingCluster())) {
  await deleteStaleClusterIfExists();
  await runChecked('kind', ['create', 'cluster', '--name', clusterName, '--kubeconfig', kubeconfigPath]);
}

await exportDefaultKubeconfig();
await waitForClusterReady();
await runChecked('kubectl', ['apply', '-f', crdPath, '--kubeconfig', kubeconfigPath]);
await runChecked('kubectl', [
  'wait',
  '--for',
  'condition=Established',
  'crd/greeters.hello.tamirdresher.dev',
  '--timeout=60s',
  '--kubeconfig',
  kubeconfigPath,
]);

console.log(`Kind cluster '${clusterName}' is ready. Kubeconfig: ${kubeconfigPath}`);

async function tryReuseExistingCluster() {
  const exportResult = await run('kind', [
    'export',
    'kubeconfig',
    '--name',
    clusterName,
    '--kubeconfig',
    kubeconfigPath,
  ]);

  if (exportResult.exitCode !== 0) {
    return false;
  }

  const healthResult = await run('kubectl', [
    'get',
    'nodes',
    '--kubeconfig',
    kubeconfigPath,
    '--request-timeout',
    '5s',
  ]);

  if (healthResult.exitCode === 0) {
    console.log(`Reusing existing persistent Kind cluster '${clusterName}'.`);
    return true;
  }

  console.warn(`Existing Kind cluster '${clusterName}' did not answer kubectl; recreating it.`);
  return false;
}

async function deleteStaleClusterIfExists() {
  const listResult = await run('kind', ['get', 'clusters']);

  if (listResult.exitCode !== 0) {
    return;
  }

  const exists = listResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .includes(clusterName);

  if (exists) {
    await runChecked('kind', ['delete', 'cluster', '--name', clusterName]);
  }
}

async function exportDefaultKubeconfig() {
  const result = await run('kind', ['export', 'kubeconfig', '--name', clusterName]);
  if (result.exitCode !== 0) {
    console.warn(`Could not export '${clusterName}' to the default kubeconfig: ${result.stderr.trim()}`);
  }
}

async function waitForClusterReady() {
  const started = Date.now();
  let attempt = 1;

  while (Date.now() - started < timeoutMs) {
    const result = await run('kubectl', ['get', 'nodes', '--kubeconfig', kubeconfigPath]);

    if (result.exitCode === 0) {
      return;
    }

    const delayMs = Math.min(2_000 * 2 ** Math.min(attempt - 1, 4), 30_000);
    console.log(`Kind cluster '${clusterName}' not ready yet (attempt ${attempt}); retrying in ${delayMs / 1000}s.`);
    await delay(delayMs);
    attempt += 1;
  }

  throw new Error(`Kind cluster '${clusterName}' did not become ready within ${timeoutMs / 1000}s.`);
}

async function runChecked(command, args) {
  const result = await run(command, args);

  if (result.exitCode !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.exitCode}\n${result.stderr}`);
  }

  return result;
}

function run(command, args) {
  console.log(`> ${command} ${args.join(' ')}`);

  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on('error', (error) => {
      stderr += error.message;
      resolvePromise({ exitCode: 1, stdout, stderr });
    });

    child.on('close', (exitCode) => {
      resolvePromise({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}

function parseArgs(args) {
  const parsed = new Map();

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    const value = args[i + 1];

    if (!key || value === undefined) {
      throw new Error(`Invalid argument list: ${args.join(' ')}`);
    }

    parsed.set(key, value);
  }

  return parsed;
}

function requiredOption(optionsMap, key) {
  const value = optionsMap.get(key);

  if (!value) {
    throw new Error(`Missing --${key}`);
  }

  return value;
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
