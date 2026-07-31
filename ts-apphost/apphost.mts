import { execFileSync, spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ClusterLifetime,
  CommandResultFormat,
  createBuilder,
  ResourceCommandState,
  type ExecuteCommandContext,
  type ExecuteCommandResult,
  type WithCommandOptions,
} from './.aspire/modules/aspire.mjs';

const appHostDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(appHostDir, '..');
const operatorDir = resolve(repoRoot, 'operator');
const crdPath = resolve(repoRoot, 'config', 'greeter-crd.yaml');

validatePrerequisites(['docker', 'kind', 'kubectl', 'go']);

const builder = await createBuilder();

const applyGreeterOptions = {
  commandOptions: {
    description: 'Applies a timestamped Greeter custom resource to trigger the operator reconcile loop.',
    iconName: 'Add',
    updateState: async () => ResourceCommandState.Enabled,
  },
} satisfies WithCommandOptions;

const deleteGreetersOptions = {
  commandOptions: {
    description: 'Deletes all Greeter custom resources from the default namespace.',
    iconName: 'Delete',
    updateState: async () => ResourceCommandState.Enabled,
  },
} satisfies WithCommandOptions;

const cluster = builder
  .addKindCluster('dev-cluster')
  .withClusterLifetime(ClusterLifetime.Persistent)
  .withCommand('apply-greeter', 'Apply Greeter (timestamped)', applyGreeter, applyGreeterOptions)
  .withCommand('delete-greeters', 'Delete all Greeters', deleteGreeters, deleteGreetersOptions);

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

function formatStamp(date = new Date()): string {
  const pad = (value: number) => value.toString().padStart(2, '0');

  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(
    date.getMinutes(),
  )}${pad(date.getSeconds())}`;
}

async function applyGreeter(context: ExecuteCommandContext): Promise<ExecuteCommandResult> {
  const stamp = formatStamp();
  const crName = `greeter-${stamp}`;
  const specName = `tamir-${stamp}`;
  const kubeconfigPath = await getKubeconfigPath(await context.resourceName());
  const yaml = `apiVersion: hello.tamirdresher.dev/v1alpha1
kind: Greeter
metadata:
  name: ${crName}
  namespace: default
spec:
  name: ${specName}
`;

  const result = await runKubectl(['--kubeconfig', kubeconfigPath, 'apply', '-f', '-'], yaml);

  if (result.exitCode !== 0) {
    return commandFailure(`kubectl apply failed for ${crName}.`, result.stderr || result.stdout);
  }

  return commandSuccess(`Applied ${crName} (spec.name=${specName})`, result.stdout.trim());
}

async function deleteGreeters(context: ExecuteCommandContext): Promise<ExecuteCommandResult> {
  const kubeconfigPath = await getKubeconfigPath(await context.resourceName());
  const result = await runKubectl(
    ['--kubeconfig', kubeconfigPath, 'delete', 'greeters', '--all', '-n', 'default', '--ignore-not-found'],
    null,
  );

  if (result.exitCode !== 0) {
    return commandFailure('kubectl delete greeters --all failed.', result.stderr || result.stdout);
  }

  return commandSuccess('Deleted all Greeters.', result.stdout.trim());
}

async function getKubeconfigPath(resourceName: string): Promise<string> {
  const result = await runProcess('aspire', ['describe', '--non-interactive', '--format', 'Json'], null);

  if (result.exitCode !== 0) {
    throw new Error(`Unable to describe Aspire resources. ${result.stderr || result.stdout}`);
  }

  const jsonStart = result.stdout.indexOf('{');
  const description = JSON.parse(result.stdout.slice(jsonStart)) as {
    resources: Array<{
      name: string;
      displayName?: string;
      properties?: {
        KubeConfigPath?: string;
      };
    }>;
  };
  const resource = description.resources.find((candidate) => candidate.name === resourceName || candidate.displayName === resourceName);
  const kubeconfigPath = resource?.properties?.KubeConfigPath;

  if (kubeconfigPath) {
    return kubeconfigPath;
  }

  throw new Error(`Unable to resolve the Kind kubeconfig path from the ${resourceName} resource.`);
}

async function runKubectl(
  args: string[],
  stdin: string | null,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return await runProcess('kubectl', args, stdin);
}

async function runProcess(
  fileName: string,
  args: string[],
  stdin: string | null,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(fileName, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolvePromise({ exitCode, stdout, stderr });
    });

    if (stdin) {
      child.stdin.end(stdin);
    } else {
      child.stdin.end();
    }
  });
}

function commandSuccess(message: string, value: string): ExecuteCommandResult {
  return {
    success: true,
    message,
    data: {
      value,
      format: CommandResultFormat.Text,
      displayImmediately: true,
    },
  };
}

function commandFailure(message: string, value: string): ExecuteCommandResult {
  return {
    success: false,
    errorMessage: message,
    data: {
      value,
      format: CommandResultFormat.Text,
      displayImmediately: true,
    },
  };
}
