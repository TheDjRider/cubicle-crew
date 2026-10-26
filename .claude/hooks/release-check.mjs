// PostToolUse hook: след успешно пускане на нова версия напомня на Claude да попита за release-announcer.
// Чете JSON от stdin; при всичко друго не извежда нищо.
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => {
  let cmd = '';
  try { cmd = String(JSON.parse(raw)?.tool_input?.command || ''); } catch { return; }
  if (!isRelease(cmd)) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: 'Току-що излезе нова версия. Попитай потребителя дали да подготви постове с release-announcer. Не започвай без изрично да.',
    },
  }));
});

// Всяка част от верига (&&, ;, |, нов ред) се проверява поотделно.
function isRelease(cmd) {
  return cmd.split(/&&|\|\||[;|\n]/).some(part => {
    const p = part.trim();
    // gh release create v… – така излизат версиите тук (чернова не се брои)
    if (/^gh\s+release\s+create\b/.test(p)) return !/--draft\b/.test(p);
    // push на таг v… или на всички тагове
    if (/^git\s+push\b/.test(p)) return /--tags\b/.test(p) || /\s(refs\/tags\/)?v\d+\.\d+/.test(p);
    // npm publish (без --dry-run)
    if (/^npm\s+publish\b/.test(p)) return !/--dry-run\b/.test(p);
    return false;
  });
}
