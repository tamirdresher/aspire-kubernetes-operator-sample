import { spawn } from 'node:child_process';

const options = parseArgs(process.argv.slice(2));
const crdPath = requiredOption(options, 'crd');

if (!process.env.KUBECONFIG) {
  throw new Error('KUBECONFIG was not set. This script must be wired with withKindClusterReference(cluster).');
}

await runChecked('kubectl', ['apply', '-f', crdPath]);
await runChecked('kubectl', [
  'wait',
  '--for',
  'condition=Established',
  'crd/greeters.hello.tamirdresher.dev',
  '--timeout=60s',
]);

console.log(`Greeter CRD applied and Established: ${crdPath}`);

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
