# DEPLOY — putting Coding Night on ptcodingnight.com

Written for someone who has never deployed anything. Every command is meant to be typed exactly
as written, in order. Where a command needs a value only you have, the placeholder is in
`ANGLE_BRACKETS` and the line above says where to get it.

If something fails, jump to §13. Do not skip §3 — an unhardened box on a public IP is found by
automated scanners within minutes, not days.

---

## 0. What you are deploying, and what it will not do

One DigitalOcean droplet at `192.81.210.235`, serving `https://ptcodingnight.com`, running five
containers: Caddy (TLS), the Next.js web app, the judge worker, Postgres and Redis.

**Read this before the contest, not after.** This box is a demo and a staging host. It is
honestly not the machine `docs/HOSTING.md` recommends for a live contest, and the difference is
measurable rather than theoretical:

| | This droplet | What a contest wants (HOSTING.md §6) |
|---|---|---|
| CPU | 2 vCPU | 8 cores |
| RAM | 4 GB | 16 GB |
| Judge concurrency | 2 | 8 |
| Shared with | web, Postgres, Redis | nothing |

Three consequences, stated plainly:

1. **G8 (verdict latency) will not pass here.** The target is a 10 s p95. Correctness is
   unaffected — students get the right verdict, they wait longer for it. `docs/TODO.md` T3.
2. **Java time limits are not enforceable** on a slow host, and that is a *scoring* error rather
   than a speed one: a quadratic Java solution passes where the same idea in Python is caught.
   `docs/TODO.md` T2 and `docs/HOSTING.md` §5.
3. **The judge shares a box with the web app and the database.** The worker mounts the Docker
   socket, which is effectively root on the host — PRD §14 says to give the judge a machine with
   nothing else on it, and this deployment knowingly does not. See §10.

For a demo, a rehearsal, or a small round, this is fine. For the night itself, resize (§9) or
use a second machine.

---

## 1. Before you start

You need:

- The droplet's IP: **192.81.210.235**
- Root SSH access to it (DigitalOcean emails a password, or you added a key at creation)
- DNS for `ptcodingnight.com` pointing at that IP
- An SSH key pair on your own laptop

**Check DNS first.** Certificates cannot be issued before DNS resolves, and it is the one step
that can take hours to propagate:

```bash
dig +short ptcodingnight.com
dig +short www.ptcodingnight.com
```

Both must print `192.81.210.235`. If they do not, fix the A records at your registrar and wait.
Everything below assumes they resolve.

If you do not have an SSH key on your laptop yet:

```bash
ssh-keygen -t ed25519 -C "ptcodingnight"      # press Enter at each prompt
cat ~/.ssh/id_ed25519.pub                      # this is the PUBLIC half; it is safe to paste
```

---

## 2. First login

```bash
ssh root@192.81.210.235
```

Everything from here to §5 runs **on the server**.

---

## 3. Harden the box

Do this before anything else is listening.

### 3.1 A non-root user

Running the stack as root means any mistake is a root mistake.

```bash
adduser ptcn                      # set a password; the other prompts can be blank
usermod -aG sudo ptcn
```

Copy your SSH key over so you can log in as that user:

```bash
rsync --archive --chown=ptcn:ptcn ~/.ssh /home/ptcn/
```

**Open a SECOND terminal and confirm it works before closing this one:**

```bash
ssh ptcn@192.81.210.235
```

If that fails, fix it now. Once password auth is off in §3.2, a broken key means the DigitalOcean
web console is your only way in.

### 3.2 SSH keys only

```bash
sudo nano /etc/ssh/sshd_config
```

Set these three, uncommenting them if needed:

```
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
```

Save (`Ctrl+O`, Enter, `Ctrl+X`), then:

```bash
sudo systemctl restart ssh
```

**Keep your current session open.** In another terminal, prove you can still get in:

```bash
ssh ptcn@192.81.210.235
```

### 3.3 Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp     # SSH — allow this BEFORE enabling, or you lock yourself out
sudo ufw allow 80/tcp     # HTTP: redirects to HTTPS, and Let's Encrypt's challenge needs it
sudo ufw allow 443/tcp    # HTTPS
sudo ufw enable           # answer y
sudo ufw status verbose
```

Nothing else is opened. Postgres (5432) and Redis (6379) are deliberately absent: they publish
no port at all in `docker-compose.prod.yml` and are reachable only over the compose network.

> **Docker can punch holes in ufw.** Docker writes its own iptables rules and a published port
> bypasses ufw entirely. This is why the production compose file publishes nothing except
> Caddy's 80 and 443 — the firewall is the second line, not the first. Verify after §8 with
> `sudo ss -tlnp` and confirm nothing but 22, 80 and 443 is listening on a public address.

### 3.4 Automatic security updates

```bash
sudo apt update
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades   # answer Yes
```

Confirm it is armed:

```bash
systemctl status unattended-upgrades --no-pager
```

> These apply *security* updates only, and they do not restart your containers. A kernel update
> still needs a reboot; `ls /var/run/reboot-required` tells you when one is pending. Do not
> reboot during a contest.

---

## 4. Docker

Install from Docker's own repository — the version in Ubuntu's archive is old enough to matter.

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Let `ptcn` use Docker without `sudo`:

```bash
sudo usermod -aG docker ptcn
newgrp docker            # or log out and back in
docker run --rm hello-world
```

> Adding a user to the `docker` group is equivalent to giving them root. That is accepted here
> — see §10 — but it is worth knowing rather than discovering.

---

## 5. Swap

4 GB is not much, and a judging burst on top of Postgres is exactly when the kernel runs out.
Swap turns an OOM kill into slowness, which is far easier to recover from mid-contest.

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

---

## 6. The code

```bash
sudo mkdir -p /srv/ptcn
sudo chown -R ptcn:ptcn /srv/ptcn
cd /srv/ptcn
git clone <YOUR-REPO-URL> app
cd app
```

Create the judge's working directory. **This path matters more than it looks** — see the comment
on `JUDGE_HOST_ROOT` in `.env.production.example`:

```bash
mkdir -p /srv/ptcn/judge/scratch /srv/ptcn/judge/testcases
```

Now the environment:

```bash
cp .env.production.example .env
nano .env
```

Fill in every blank. Generate each secret **on this server** with the command written above it:

```bash
openssl rand -hex 24        # POSTGRES_PASSWORD
openssl rand -hex 24        # REDIS_PASSWORD
openssl rand -hex 32        # SESSION_SECRET
```

> **`-hex`, not `-base64`, and this is not a style preference.**
>
> `POSTGRES_PASSWORD` and `REDIS_PASSWORD` are interpolated into `postgresql://` and `redis://`
> URLs in `docker-compose.prod.yml`. Base64's alphabet includes `+`, `/` and `=`, all of which
> are meaningful inside a URL — `/` ends the authority section, `+` decodes to a space in some
> parsers, and `=` is unpredictable. A generated password containing one produces a connection
> string that parses into something other than what you generated, and the failure surfaces as
> an authentication error against a database whose password is, as far as you can see, correct.
>
> Hex is `[0-9a-f]` and needs no escaping anywhere. 24 bytes is 48 characters and 192 bits — more
> than base64's 32 bytes needed to be.
>
> `SESSION_SECRET` stays `-hex 32` because it was already hex; it is read as an opaque string and
> never goes in a URL, but there is no reason to make it the odd one out.

`ADMIN_PASSCODE` is typed by a human — four unrelated words beat a clever short one.
`ACME_EMAIL` must be an address someone reads; certificate-expiry warnings go there.

Lock the file down. It contains every secret this deployment has:

```bash
chmod 600 .env
```

> `.env` is gitignored and must never be committed. If a secret does reach git, rotate it —
> rewriting history does not un-publish it.

---

## 7. OAuth redirect URIs

Skip this if you are not using Google or GitHub sign-in; leave those variables blank in `.env`
and each provider's route will answer "not configured on this server". **The join code always
works and never depends on this.**

A redirect URI must match what the app sends **exactly** — scheme, host, path, no trailing
slash. A mismatch is the single most common OAuth setup failure and both providers' error
messages for it are unhelpful.

### Google

1. <https://console.cloud.google.com/apis/credentials> → **Create credentials** → **OAuth client ID**
2. Application type: **Web application**
3. **Authorised redirect URIs** — add exactly:

   ```
   https://ptcodingnight.com/api/auth/google/callback
   ```

4. Copy the client ID and secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

#### 7.1 Publish the consent screen, or nobody can sign in

**A new Google OAuth app starts in Testing mode, and in Testing mode it only works for accounts
you have explicitly listed.** Everyone else gets `Error 403: access_denied` — which reads like a
misconfiguration and is in fact the app working exactly as configured. This is the failure that
will hit you on the night, because it does not appear while you are testing with your own account:
the account that created the app can always sign in.

Two ways out, and pick deliberately:

**Publish it (recommended for the contest).** APIs & Services → **OAuth consent screen** →
**Publish app**. Anyone with a Google account can then sign in.

> Publishing sounds like it triggers a review, and for these scopes it does not. Verification is
> required only for **sensitive or restricted** scopes — Gmail, Drive, contacts. This app requests
> `openid`, `email` and `profile`, which are none of those, so publishing takes effect
> immediately. You will see an "unverified app" interstitial the first time; that is cosmetic and
> the user can continue past it.

**Or add test users**, if you would rather stay in Testing: OAuth consent screen → **Test users**
→ **Add users**. Capped at 100, and each address must be added by hand — workable for a rehearsal,
not for a room of students arriving at once.

Either way, verify with an account that is **not** the one that created the app. Testing your own
sign-in proves nothing here.

### GitHub

1. <https://github.com/settings/developers> → **New OAuth App**
2. Homepage URL: `https://ptcodingnight.com`
3. **Authorization callback URL** — exactly:

   ```
   https://ptcodingnight.com/api/auth/github/callback
   ```

4. Copy the client ID, generate a client secret, and put both in `.env`.

> If you also serve `www.ptcodingnight.com`, either register its callbacks too or leave
> `PUBLIC_ORIGIN` on the bare domain and let Caddy redirect. The app builds redirect URIs from
> `PUBLIC_ORIGIN`, so whatever is in there is what must be registered.

---

## 8. Bring it up

### 8.1 Judge runtime images

Required, and not just a wrapper around `docker pull`: `ptcn-go:1.23` is **built locally** and is
on no registry. Go since 1.20 does not ship a pre-compiled standard library, so a stock `golang`
image rebuilds it on every submission — 65.8 s against 2.5–11.8 s warm — which blows the compile
timeout and reports **CE on correct code**.

```bash
cd /srv/ptcn/app
./scripts/build-judge-images.sh --verify
```

This takes several minutes on a first run. `--verify` is what catches a Go build-cache miss, and
it must pass before you trust a verdict.

### 8.2 Start the stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

Every service should reach `healthy`. Caddy will be requesting a certificate; give it a minute
and watch:

```bash
docker compose -f docker-compose.prod.yml logs -f caddy
```

Look for `certificate obtained successfully`. If you see rate-limit errors, read §13.

### 8.3 Migrate the database

The app does not migrate itself on boot. That is deliberate: an automatic migration on a
restart-looping container will run repeatedly against a live database.

```bash
docker compose -f docker-compose.prod.yml exec web npx prisma migrate deploy
```

`migrate deploy`, never `migrate dev` — the latter can reset data.

> **If this fails with `EACCES ... /app/node_modules/@prisma/engines`, your image predates the
> fix.** The container runs as a non-root user, and the Prisma CLI writes when it resolves its
> query engine — a checksum probe, and a re-fetch if it is unhappy. The engine directories used to
> arrive from the build stage owned by root, so the command could not touch them.
>
> The Dockerfile now hands those two directories to the runtime user, so this works as written.
> Rebuild rather than working around it:
>
> ```bash
> docker compose -f docker-compose.prod.yml build web
> docker compose -f docker-compose.prod.yml up -d web
> ```
>
> `exec -u 0` also gets you past it and is the wrong fix: it runs the migration as root, which
> leaves root-owned files behind in a container that is deliberately not root.
>
> **Watch for the second failure this causes.** A migration that did not run is silent until the
> next step, where both seed commands fail with `table does not exist` — an error that points at
> the database and not at a permission problem three steps upstream. If you see that, come back
> here before debugging Postgres.

### 8.4 Seed

The problem bank (titles and history only, everything `DRAFT`):

```bash
docker compose -f docker-compose.prod.yml exec web npm run db:seed
```

Then the demo contest — two teams of **different sizes** so the mean is visibly doing work,
authored problems out of `DRAFT`, and enough submission history that the leaderboard is not
empty on first load:

```bash
docker compose -f docker-compose.prod.yml exec web npx tsx scripts/seed-demo.ts
```

**It prints a randomly generated join code. Write it down** — you need it for §8.5 and students
need it on the board.

The code is generated per seed rather than fixed, because it is the credential that admits anyone
to a `RUNNING` contest: a value committed to the repository would let anyone who has read the repo
— or guessed the school mascot — join the public deployment, take a session, read every problem
statement and drive the judge queue.

To pin it (a rehearsal you want to repeat, say), set it explicitly instead:

```bash
docker compose -f docker-compose.prod.yml exec -e SEED_JOIN_CODE=YOURCODE web \
  npx tsx scripts/seed-demo.ts
```

### 8.5 Prove it works

From your laptop, not the server:

```bash
SMOKE_JOIN_CODE=<the code seed-demo printed> \
SMOKE_ADMIN_PASSCODE=<your ADMIN_PASSCODE> \
  ./scripts/smoke-prod.sh
```

This checks the certificate, all three sign-in paths, a submission judged end to end, and that
both screens render. It exits non-zero if anything failed. §4 of its output is the important one:
it is the only check that exercises Redis, the worker, the Docker socket and the scratch mount
together.

---

## 9. Resizing for contest night

Judging is CPU- and RAM-bound, and this box has little of either. Resize **the day before**, not
an hour before — a resize needs a power-off, and you want time to re-run the checks.

1. Power off from the DigitalOcean console (or `sudo poweroff`).
2. Resize to at least **4 vCPU / 8 GB**; 8 vCPU / 16 GB matches the HOSTING.md recommendation.
   Choose the CPU-optimised class if offered — this workload is container creation, which is
   almost entirely CPU and I/O.
3. Power on, then `ssh ptcn@192.81.210.235`.

Raise the two limits that were sized for the small box:

```bash
cd /srv/ptcn/app
nano .env        # JUDGE_CONCURRENCY: 2 -> one per vCPU, so 4 or 8
```

Then in `docker-compose.prod.yml`, raise the memory limits — the numbers there are sized to fit
4 GB and are the reason the box does not OOM at that size:

| Service | 4 GB | 8 GB | 16 GB |
|---|---|---|---|
| `postgres` | 768M | 1536M | 3G |
| `web` | 768M | 1G | 2G |
| `worker` | 384M | 512M | 768M |
| `redis` | 256M | 512M | 512M |

Leave headroom for the judge containers themselves: `JUDGE_CONCURRENCY × JUDGE_MEMORY_LIMIT`.
At concurrency 8 and 256 MB that is 2 GB of siblings that no service limit accounts for, because
they are started on the host rather than as children of the worker.

Apply and re-check:

```bash
docker compose -f docker-compose.prod.yml up -d
./scripts/build-judge-images.sh --verify
```

**Then re-measure**, because the startup budgets in `lib/judge/runtimes.ts` were measured on
different hardware and a budget that is wrong in either direction fails correct code.
`docs/HOSTING.md` §7 is a ten-minute procedure for exactly this.

---

## 10. What this deployment accepts, on purpose

Recorded here so it is a decision rather than an oversight.

**The worker mounts `/var/run/docker.sock`.** Anything that can talk to that socket can start a
privileged container and own the host. The worker needs it because a submission must run in a
fresh, isolated sibling container — that is PRD §7 and it is not negotiable. What *is* being
accepted is running that worker on the same box as the web app and the database, which PRD §14
says not to do.

The mitigations that are real:

- The worker never executes untrusted code in its own process. It spawns a container with
  `--network=none`, a read-only rootfs, `--cap-drop=ALL`, `no-new-privileges`, a non-root user,
  and caps on memory, pids, cpus, file size and disk.
- The socket is mounted into the **worker only**, never the web service.
- Nothing but Caddy is reachable from the internet.

The mitigation that is not available: separation. If you have a second machine, put the judge on
it and point `REDIS_URL` at the first. If you do not, know that a sandbox escape here reaches the
database too.

---

## 11. Backups

The `backup` service dumps Postgres hourly to `./backups` and deletes dumps older than seven
days.

```bash
ls -lh /srv/ptcn/app/backups
```

**A backup you have not restored is a hope, not a backup.** Practise once, before the night:

```bash
# On the server. This DESTROYS the current database — do it on a test box or before seeding.
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U ptcn -d ptcn --clean --if-exists < backups/ptcn-<TIMESTAMP>.dump
```

Copy one off the box as well — a backup on the same droplet does not survive losing the droplet:

```bash
# From your laptop
scp ptcn@192.81.210.235:/srv/ptcn/app/backups/ptcn-*.dump ~/ptcn-backups/
```

---

## 12. Snapshot, and destroy when finished

A droplet costs money for as long as it exists. Take a snapshot first: it preserves the whole
machine and is far cheaper than leaving it running.

**Snapshot:**

1. Stop the stack cleanly so Postgres is not mid-write:

   ```bash
   cd /srv/ptcn/app
   docker compose -f docker-compose.prod.yml down
   sudo poweroff
   ```

2. DigitalOcean console → the droplet → **Snapshots** → **Take Snapshot**. Wait for it to
   complete.

**Destroy:**

3. Confirm the snapshot is listed and the size looks right.
4. Copy the backups off the box first if you have not (§11) — a snapshot is a whole-disk image
   and restoring one to get a single `.dump` out is tedious.
5. Console → **Destroy** → **Destroy this Droplet**.

**Restoring later:** create a new droplet *from the snapshot*. It comes back with a **new IP**,
so update the DNS A records, and re-run §8.5 to confirm the certificate re-issues.

> Do not destroy while DNS still points at it if you plan to redeploy soon — the domain will
> resolve to a dead or, worse, someone else's IP.

---

## 13. When something is wrong

**Look at the logs first.** Almost every failure below announces itself there.

```bash
cd /srv/ptcn/app
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=100 web
docker compose -f docker-compose.prod.yml logs --tail=100 worker
docker compose -f docker-compose.prod.yml logs --tail=100 caddy
```

### The web container exits immediately with "FATAL: refusing to start"

Working as designed. Production refuses to boot on an unsafe configuration rather than serving a
broken one. The message names the variable. The usual causes are `COOKIE_SECURE=false`, a
missing `SESSION_SECRET`, or a `PUBLIC_ORIGIN` that is not `https://`.

### No certificate / browser warning

- `dig +short ptcodingnight.com` must return this droplet's IP. Caddy cannot get a certificate
  for a name that does not point at it.
- Port 80 must be open. The HTTP-01 challenge uses it. `sudo ufw status`.
- Rate limited? Let's Encrypt allows 5 duplicate certificates per week. Uncomment the
  `acme_ca` staging line in the `Caddyfile`, get the configuration right against staging, then
  comment it out again. Staging certificates are untrusted — the browser warning is expected.

### Every submission comes back `IE`

Almost always the judge scratch mount. The worker asks the **host** daemon to bind-mount its
scratch directories, so the path must mean the same thing on the host and inside the worker
container:

```bash
grep JUDGE /srv/ptcn/app/.env
ls -la /srv/ptcn/judge/scratch
docker compose -f docker-compose.prod.yml exec worker ls -la /srv/ptcn/judge/scratch
```

The last two must show **the same directory**. If the container's is empty while the host's is
not, `JUDGE_HOST_ROOT` and the volume mount disagree.

Also confirm the runtime images exist on the host: `./scripts/build-judge-images.sh --verify`.

### Every submission comes back `CE`, including code that compiles

Go's build cache. `docker/go/Dockerfile` bakes a cache keyed by the exact build flags, and any
flag in the registry's `compileCommand` that the Dockerfile did not also use misses the entire
cache — which blows `compileTimeoutMs` and surfaces as CE. `--verify` is what catches it.

### Students see an empty problem list

A participant with no division sees no divisioned problems. Check the contest's problems and the
participant's division in the admin roster. `scripts/seed-demo.ts` creates the demo contest
without divisions for exactly this reason.

### A "Demo data" banner is on every screen

`NEXT_PUBLIC_CONTEST_BACKEND=stub` reached this deployment. Remove it from `.env`, rebuild
(`docker compose -f docker-compose.prod.yml up -d --build web`), and re-run `smoke-prod.sh`.
Nothing on a stub screen is scored.

### Everything is slow

Expected on this hardware, and quantified in §0 and `docs/TODO.md` T3. Check you are not also
out of memory:

```bash
free -h
docker stats --no-stream
```

If Postgres is being OOM-killed, its memory limit in `docker-compose.prod.yml` is too high for
the box, or swap (§5) is missing.

---

## 14. Updating a deployment that is already running

§§1–8 build a box from nothing. This is the other job: the site is live and you want the new
commits on it.

### 14.1 The local edits question, first

If you patched anything on the droplet with `sed` or an editor, `git pull` will either refuse or
merge, and neither is what you want. Look before you pull:

```bash
cd /srv/ptcn/app
git status --short
```

**Empty output — nothing to think about, go to §14.2.**

Otherwise, decide per file. `.env.production` will never appear here (it is gitignored, and it
survives every update — do not recreate it). Anything else that appears is a patch you applied by
hand, and the question is whether the repo has since fixed it properly. For the six bugs patched
on the droplet during the first deploy — hardcoded CPU counts, the Go verify fixture, swallowed
stderr, and the three `docs/DEPLOY.md` errors — the answer is yes, all six are fixed upstream, so
the local versions are strictly older:

```bash
git stash                 # keeps them recoverable — `git stash pop` if you were wrong
git pull --ff-only origin main
```

`--ff-only` rather than a bare `pull`: if the droplet's history has diverged, this stops and says
so instead of producing a merge commit on a production box at nine in the evening.

### 14.2 Does this update need a migration?

```bash
git diff --name-only HEAD@{1}..HEAD -- prisma/migrations
```

**No output: skip §14.4.** Output: it is a schema change, and §14.4 is not optional.

### 14.3 Rebuild and restart

The web image bakes the built application, so a pull alone changes nothing that is serving.

```bash
docker compose -f docker-compose.prod.yml up -d --build web worker
```

`web worker` rather than everything: Postgres, Redis and Caddy are unaffected by an application
change, and restarting Postgres for no reason is a way to lose a contest. The build takes a few
minutes on 2 vCPU and the old containers keep serving until the new ones are ready.

**If any judge runtime changed** — anything under `docker/`, or `lib/judge/runtimes.ts` — the
judge images are separate from the compose build and must be rebuilt too:

```bash
scripts/build-judge-images.sh --verify
```

Also do this if the images are more than a day old: **a judge image rots with age.** Go rewrites
`$GOCACHE/trim.txt` once the trim it records is over 24 hours old, the rootfs is read-only, the
write fails, and `go build` exits 1 — so the judge reports **CE on correct code**. `--verify`
asserts structurally that `trim.txt` resolves off the read-only rootfs. See CLAUDE.md.

### 14.4 Migrate, only if §14.2 said so

```bash
docker compose -f docker-compose.prod.yml exec web npx prisma migrate deploy
```

`migrate deploy`, never `migrate dev`: `dev` will offer to reset the database, and on this box
that is every student's submission history.

### 14.5 Prove it actually updated

A pull that failed silently and a rebuild that used a cached layer both look exactly like success.

**Wait for the web container to be healthy before testing anything.** `up -d --build` returns as
soon as the containers are *started*, and a Next.js server takes a few more seconds to serve. Run
a smoke test into that gap and every check fails with 502 — Caddy is up and has nothing to proxy
to. That is a healthy deployment reported as fourteen failures, which is worse than no test at
all: it sends you debugging a working system.

```bash
git log --oneline -1                                   # the commit you expected

# Healthy, not merely "Up". The healthcheck is what knows the difference.
docker compose -f docker-compose.prod.yml ps

# Then, and only then:
export SMOKE_ADMIN_PASSCODE='<the console passcode>'   # or section 3b fails, correctly
./scripts/smoke-prod.sh
```

`smoke-prod.sh` now waits up to 90s for `/api/health` before its first check and says which
situation you are in, so running it early is no longer a trap. `SMOKE_WAIT_SECS` overrides.

**Then re-seed if the contest window has closed.** Section 4 of the smoke test checks this and it
is the failure most likely to be mistaken for a broken platform: a deployment can pass every other
check and still be dead to a student, because the seeded contest ended hours ago. Nothing looks
wrong — the site loads, the board renders, sign-in works — and nothing can be submitted.

```bash
docker compose -f docker-compose.prod.yml exec web npx tsx scripts/seed-demo.ts
```

**Then open the site and press something that changed.** A green smoke test proves this box is
serving; it cannot prove the screen you rewrote does what you rewrote it to do, and it can no
longer test the competitor journey at all — that needs a real provider round trip. Two minutes:

- `/` renders, `/sign-in` offers both providers
- sign in with Google or GitHub as yourself, land on `/contest`, open a problem, **submit one
  solution and wait for the verdict.** This is the only check that exercises Redis, the worker,
  the Docker socket, the runtime images and the scratch mount together. If `JUDGE_HOST_ROOT` is
  wrong, every submission comes back `IE` and this is where you find out.
- `/sign-in` → "Organizer passcode" → the console → freeze the board, watch `/projector` stop,
  unfreeze

### 14.6 If the new containers will not start

```bash
docker compose -f docker-compose.prod.yml logs --tail=100 web
```

`FATAL: refusing to start` is the boot check and it names the variable — §13. A new release that
requires a variable your `.env.production` does not have will fail exactly this way, which is the
intended behaviour: it refuses rather than serving a half-configured site.

Rolling back is the same procedure aimed at the previous commit:

```bash
git reset --hard <previous-sha>
docker compose -f docker-compose.prod.yml up -d --build web worker
```

**A rollback across a migration is not a rollback.** `migrate deploy` moved the schema forward and
this moves only the code; if §14.2 reported a migration, restore from §11 instead.
