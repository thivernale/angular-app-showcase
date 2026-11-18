// Starts the dev frontend against the deployed interval timer storage API.
//
// Reads the stack's FunctionUrl output, writes it into a generated, gitignored copy of environment.development.ts
// (environment.real-backend.ts), serves the app with the "real-backend" configuration that uses that copy, and deletes
// the copy when the dev server stops. The stack name and region come from BACKEND_STACK_NAME and AWS_REGION, or from
// the repository variables of the same names (via the GitHub CLI).
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const devEnvFile = join(root, 'src/environments/environment.development.ts');
const realEnvFile = join(root, 'src/environments/environment.real-backend.ts');

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    const detail = error.code === 'ENOENT' ? `${cmd} is not installed or not on the PATH` : error.stderr?.trim();
    throw new Error(`${cmd} ${args.join(' ')} failed: ${detail || error.message}`);
  }
}

function setting(name) {
  return process.env[name] || run('gh', ['variable', 'get', name]);
}

function fetchApiUrl() {
  const stack = setting('BACKEND_STACK_NAME');
  const region = setting('AWS_REGION');
  const url = run('aws', [
    'cloudformation', 'describe-stacks', '--stack-name', stack, '--region', region,
    '--query', "Stacks[0].Outputs[?OutputKey=='FunctionUrl'].OutputValue", '--output', 'text',
  ]).replace(/\/$/, '');
  if (!url.startsWith('https://')) {
    throw new Error(`No FunctionUrl output on stack ${stack} in ${region} (got '${url}')`);
  }
  return url;
}

function writeRealEnv(url) {
  const pattern = /intervalTimerApiUrl: '[^']*'/;
  const dev = readFileSync(devEnvFile, 'utf8');
  if (!pattern.test(dev)) {
    throw new Error(`intervalTimerApiUrl not found in ${devEnvFile}`);
  }
  writeFileSync(realEnvFile, dev.replace(pattern, `intervalTimerApiUrl: '${url}'`));
}

let url;
try {
  url = fetchApiUrl();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
writeRealEnv(url);
console.log(`Interval timer API: ${url}`);

const cleanup = () => rmSync(realEnvFile, { force: true });
const ngCli = join(root, 'node_modules/@angular/cli/bin/ng.js');
const ng = spawn(process.execPath, [ngCli, 'serve', '--host', '0.0.0.0', '--configuration', 'real-backend'], {
  cwd: root,
  stdio: 'inherit',
});

// Ctrl+C reaches the dev server as well; wait for it to stop, then the exit handler cleans up.
process.on('SIGINT', () => {});
process.on('SIGTERM', () => ng.kill());
ng.on('error', (error) => {
  cleanup();
  console.error(error.message);
  process.exit(1);
});
ng.on('exit', (code) => {
  cleanup();
  process.exit(code ?? 0);
});
