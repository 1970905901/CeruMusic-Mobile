/**
 * 一次性跑完本地验证：typecheck → 测试 → 构建。
 * 用法：node scripts/verify.cjs
 */
const { execSync } = require('child_process')
const path = require('path')

const cwd = path.join(__dirname, '..')

function run(label, command) {
  process.stdout.write(`\n=== ${label} ===\n`)
  try {
    execSync(command, { cwd, stdio: 'inherit', shell: true })
    return true
  } catch {
    return false
  }
}

const results = [
  ['typecheck', run('typecheck', 'npx vue-tsc --noEmit')],
  ['test', run('test', 'npx vitest run')],
  ['build', run('build', 'npx vite build')]
]

process.stdout.write('\n=== summary ===\n')
for (const [name, ok] of results) process.stdout.write(`${name}: ${ok ? 'PASS' : 'FAIL'}\n`)
process.exit(results.every(([, ok]) => ok) ? 0 : 1)
