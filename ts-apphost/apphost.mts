import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClusterLifetime, createBuilder } from './.aspire/modules/aspire.mjs';

const appHostDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(appHostDir, '..');
const operatorDir = resolve(repoRoot, 'operator');
const crdPath = resolve(repoRoot, 'config', 'greeter-crd.yaml');

validatePrerequisites(['docker', 'kind', 'kubectl', 'go']);

const builder = await createBuilder();

const cluster = builder.addKindCluster('dev-cluster').withClusterLifetime(ClusterLifetime.Persistent);

const greeterCrd = builder
  .addExecutable('greeter-crd', process.execPath, appHostDir, ['./scripts/apply-crd.mjs', '--crd', crdPath])
  .withKindClusterReference(cluster)
  .waitFor(cluster);

await builder
  .addGoApp('greeter-operator', operatorDir, { packagePath: '.' })
  .withKindClusterReference(cluster)
  .withEnvironment('GOFLAGS', '-mod=mod')
  .waitFor(cluster)
  .waitForCompletion(greeterCrd);

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