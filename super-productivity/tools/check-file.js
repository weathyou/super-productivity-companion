#!/usr/bin/env node
const { execFileSync } = require('child_process');
const path = require('path');

const file = process.argv[2];
if (!file) {
  console.error('❌ Please provide a file path');
  process.exit(1);
}

// Get absolute path
const absolutePath = path.resolve(file);
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const execOptionsBase = {
  stdio: 'pipe',
  encoding: 'utf8',
};

const quoteCmdArg = (arg) => {
  const text = String(arg);
  return /[\s&()^|<>]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const runCommand = (command, args) => {
  if (process.platform === 'win32') {
    execFileSync(
      process.env.ComSpec || 'cmd.exe',
      ['/d', '/c', [command, ...args.map(quoteCmdArg)].join(' ')],
      execOptionsBase,
    );
  } else {
    execFileSync(command, args, execOptionsBase);
  }
};

try {
  // Run prettier
  console.log(`🎨 Formatting ${path.basename(file)}...`);
  runCommand(npmCmd, ['run', 'prettier:file', '--', absolutePath]);

  // Run lint based on file type
  console.log(`🔍 Linting ${path.basename(file)}...`);

  if (file.endsWith('.scss')) {
    // Use stylelint for SCSS files
    runCommand(npxCmd, ['stylelint', absolutePath]);
  } else {
    // Use ng lint for TypeScript/JavaScript files
    runCommand(npmCmd, ['run', 'lint:file', '--', absolutePath]);
  }

  // If we get here, both commands succeeded
  console.log(`✅ ${path.basename(file)} - All checks passed!`);
} catch (error) {
  // If there's an error, show the full output
  console.error('\n❌ Errors found:\n');
  console.error(error.stdout || error.stderr || error.message);
  process.exit(1);
}
