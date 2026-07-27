import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBuilder } from './.aspire/modules/aspire.mjs';

const appHostDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(appHostDir, '..');
const operatorDir = resolve(repoRoot, 'operator');
const kubeconfigPath = resolve(repoRoot, '.kube', 'dev-cluster.yaml');
const crdPath = resolve(repoRoot, 'config', 'greeter-crd.yaml');
const clusterName = 'dev-cluster';

validatePrerequisites(['docker', 'kind', 'kubectl', 'go']);
mkdirSync(dirname(kubeconfigPath), { recursive: true });

const builder = await createBuilder();

const cluster = builder.addExecutable('dev-cluster', process.execPath, appHostDir, [
  './scripts/kind-cluster.mjs',
  '--cluster-name',
  clusterName,
  '--kubeconfig',
  kubeconfigPath,
  '--crd',
  crdPath,
  '--timeout-seconds',
  '300',
]);

await builder
  .addGoApp('greeter-operator', operatorDir, { packagePath: '.' })
  .withEnvironment('KUBECONFIG', kubeconfigPath)
  .withEnvironment('GOFLAGS', '-mod=mod')
  .waitForCompletion(cluster);

await builder.build().run();

function validatePrerequisites(tools: string[]): void {
  const missing = tools.filter((tool) => !canRun(tool));

  if (missing.length > 0) {
    throw new Error(
      `Missing prerequisite(s): ${missing.join(', ')}. Install Docker Desktop, kind, kubectl, and Go, then retry \`aspire start\`.`,
    );
  }
}

function canRun(tool: string): boolean {
  const argsByTool = new Map<string, string[]>([
    ['docker', ['--version']],
    ['kind', ['--version']],
    ['kubectl', ['version', '--client']],
    ['go', ['version']],
  ]);

  try {
    execFileSync(tool, argsByTool.get(tool) ?? ['--version'], {
      stdio: 'ignore',
      timeout: 10_000,
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}