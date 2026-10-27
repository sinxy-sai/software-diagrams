import path from 'node:path';
import fs from 'node:fs';

// Commands that read only an exit code (or write a file themselves) must never
// use piped stdio: a confined agent sandbox forbids the pipe and reports EPERM,
// which would make every check look like a missing prerequisite. Capture goes
// through file descriptors instead, and everything else inherits the terminal.
let captureCounter = 0;

function shellQuote(arg) {
  // Only used on Windows, where npm and .cmd shims need a shell. Reject the
  // characters cmd.exe treats as syntax instead of trying to escape them.
  if (/[\r\n]/.test(arg)) throw new Error(`refusing to run a command with a newline in an argument: ${JSON.stringify(arg)}`);
  return /[\s"&|<>^()]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}

export function makeRun({ platform = process.platform, spawnSync, fsx = fs, tmpDir }) {
  return function run(command, args = [], options = {}) {
    const { capture = false, cwd, ...rest } = options;
    const needsShell =
      platform === 'win32' &&
      (/^(npm|npx)$/i.test(command) || /\.(cmd|bat)$/i.test(command));

    const spawnCommand = needsShell ? [command, ...args.map(shellQuote)].join(' ') : command;
    const spawnArgs = needsShell ? [] : args;
    const base = needsShell ? { ...rest, shell: true } : { ...rest };
    if (cwd) base.cwd = cwd;

    if (!capture) {
      const result = spawnSync(spawnCommand, spawnArgs, { ...base, stdio: rest.stdio ?? 'inherit' });
      return {
        status: result.status ?? -1,
        stdout: '',
        stderr: '',
        error: result.error ? String(result.error.code ?? result.error.message) : undefined,
      };
    }

    const dir = tmpDir ?? path.join(process.cwd(), '.dsh');
    let fd;
    let outFile;
    try {
      fsx.mkdirSync(dir, { recursive: true });
      outFile = path.join(dir, `.sd-capture-${process.pid}-${captureCounter++}.log`);
      fd = fsx.openSync(outFile, 'w');
    } catch {
      // No writable capture file: fall back to a silent run and no output.
      const result = spawnSync(spawnCommand, spawnArgs, { ...base, stdio: 'ignore' });
      return {
        status: result.status ?? -1,
        stdout: '',
        stderr: '',
        error: result.error ? String(result.error.code ?? result.error.message) : undefined,
      };
    }

    const result = spawnSync(spawnCommand, spawnArgs, { ...base, stdio: ['ignore', fd, fd] });
    try {
      fsx.closeSync(fd);
    } catch {
      // ignore
    }
    let text = '';
    try {
      text = fsx.readFileSync(outFile, 'utf8');
    } catch {
      // ignore
    }
    try {
      fsx.unlinkSync(outFile);
    } catch {
      // ignore
    }
    return {
      status: result.status ?? -1,
      stdout: text,
      stderr: text,
      error: result.error ? String(result.error.code ?? result.error.message) : undefined,
    };
  };
}

/** Detect Java and parse its major version. Returns { ok, version, detail }. */
export function checkJava(run) {
  const result = run('java', ['-version'], { capture: true });
  if (result.status !== 0) {
    return {
      ok: false,
      version: null,
      detail:
        result.error === 'EPERM'
          ? 'cannot execute java in this sandbox'
          : 'java was not found on PATH',
    };
  }
  const match = /version "(\d+)(?:\.(\d+))?/.exec(result.stdout);
  if (!match) {
    // A JDK that prints nothing parseable is still present; accept it.
    return { ok: true, version: null, detail: 'java present' };
  }
  const major = Number(match[2] === undefined ? match[1] : match[1] === '1' ? match[2] : match[1]);
  return {
    ok: major >= 17,
    version: major,
    detail: major >= 17 ? `java ${major}` : `java ${major} is older than 17`,
  };
}