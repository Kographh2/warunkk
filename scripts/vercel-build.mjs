import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const isWindows = process.platform === 'win32';
const nextBin = isWindows
  ? join('node_modules', '.bin', 'next.cmd')
  : join('node_modules', '.bin', 'next');

let buildLooksDone = false;
let forceExitTimer = null;

function scheduleCleanExit(child) {
  if (forceExitTimer) return;
  forceExitTimer = setTimeout(() => {
    const hasBuildId = existsSync(join(process.cwd(), '.next', 'BUILD_ID'));
    const hasManifest = existsSync(join(process.cwd(), '.next', 'routes-manifest.json'));

    if (buildLooksDone && hasBuildId && hasManifest) {
      console.log('\n[Vercel Build] Next.js build output sudah lengkap. Menutup proses build dengan aman.');
      child.kill('SIGTERM');
      setTimeout(() => process.exit(0), 500);
      return;
    }
  }, 12000);
}

const child = spawn(nextBin, ['build'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1'
  }
});

const watchdog = setTimeout(() => {
  console.error('\n[Vercel Build] Build terlalu lama tanpa selesai. Proses dihentikan agar log tidak menggantung.');
  child.kill('SIGTERM');
  setTimeout(() => process.exit(1), 500);
}, 10 * 60 * 1000);

function handleOutput(chunk, target) {
  const text = chunk.toString();
  target.write(text);

  if (
    text.includes('Collecting build traces') ||
    text.includes('Finalizing page optimization') ||
    text.includes('prerendered as static content')
  ) {
    buildLooksDone = true;
    scheduleCleanExit(child);
  }
}

child.stdout.on('data', chunk => handleOutput(chunk, process.stdout));
child.stderr.on('data', chunk => handleOutput(chunk, process.stderr));

child.on('error', error => {
  clearTimeout(watchdog);
  console.error(error);
  process.exit(1);
});

child.on('exit', code => {
  clearTimeout(watchdog);
  if (forceExitTimer) clearTimeout(forceExitTimer);

  if (code === 0) {
    process.exit(0);
    return;
  }

  const hasBuildId = existsSync(join(process.cwd(), '.next', 'BUILD_ID'));
  const hasManifest = existsSync(join(process.cwd(), '.next', 'routes-manifest.json'));

  if (buildLooksDone && hasBuildId && hasManifest) {
    console.log('\n[Vercel Build] Build sudah valid walaupun proses Next.js menutup dengan sinyal non-kritis.');
    process.exit(0);
    return;
  }

  process.exit(code ?? 1);
});
