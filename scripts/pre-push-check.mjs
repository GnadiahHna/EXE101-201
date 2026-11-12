import readline from 'node:readline';

const currentBranch = process.env.GIT_BRANCH || '';
const allowMainPush = process.env.ALLOW_MAIN_PUSH === 'true' || process.env.ALLOW_MAIN_PUSH === '1';

async function checkRef() {
  if (allowMainPush) {
    return;
  }

  // Read git pre-push standard input: <local ref> <local sha> <remote ref> <remote sha>
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  for await (const line of rl) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 3) {
      const remoteRef = parts[2];
      if (remoteRef === 'refs/heads/main' || remoteRef === 'refs/heads/master') {
        console.error('\n❌ Pre-push Check Failed:');
        console.error(`Direct push to protected branch "${remoteRef}" is forbidden!`);
        console.error('Please create a feature branch and open a Pull Request.');
        console.error('(To force push in emergency, set ALLOW_MAIN_PUSH=true git push ...)\n');
        process.exit(1);
      }
    }
  }
}

await checkRef();
