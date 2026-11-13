// `npm run deploy`: publish the built site (dist/) to the gh-pages branch of this repo's GitHub
// remote. GitHub Pages then serves it at https://<user>.github.io/<repo>/
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();

const remote = run('git remote get-url origin');
writeFileSync('dist/.nojekyll', ''); // serve files as-is (no Jekyll processing)
run('git init -q -b gh-pages', 'dist');
run('git add -A', 'dist');
run('git -c user.name="DineTogether deploy" -c user.email="deploy@users.noreply.github.com" commit -q -m "Deploy DineTogether"', 'dist');
execSync(`git push -f "${remote}" gh-pages`, { cwd: 'dist', stdio: 'inherit' });

const m = remote.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
console.log(m ? `\nPublished. Live in about a minute at: https://${m[1]}.github.io/${m[2]}/\n` : '\nPublished to gh-pages.\n');
