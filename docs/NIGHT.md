# NIGHT.md

The run-of-show for Coding Night, written for Sameer Zaidi (CS Club president, runs the room),
Aryav Das (built the site, runs the console) and the teacher. Read it on a phone. Every screen
named here is a real path on ptcodingnight.com. `{id}` is the contest's id, which appears in the
URL of every tab once the contest exists.

Sign in as an organizer with the passcode on `/sign-in`. Every organizer screen lives under
`/admin`.

## 1. The night at a glance

Doors open at 6:30 and the room empties before 8:45. The contest window is 7:00 PM to 8:15 PM
Eastern. Once it starts, the site acts on its own twice: the public board freezes at 8:00, and
submissions close at 8:15.

**The format, confirmed by Navraj on 2026-11-15.** There are no team problems. Every student has
three problems of their own, one Easy and two Medium, and only that student can submit them. For
the first 30 minutes everyone works alone; after that, teammates may help each other in person,
but each problem still lives on its owner's computer. The non-programming puzzle (a sudoku or
similar) is on paper, worked during the contest, and its points are entered by hand. Two
divisions.

| Time | What happens | Who | On the site |
|---|---|---|---|
| 6:15 | Projector on. Laptop open on `/admin/contests/{id}/setup`. Run the 6:15 check in §3. | Aryav | `/projector?contest={id}` on the wall |
| 6:30 | Intro and pizza. Slips handed out at the door, or the code wall on the projector. | Sameer, teacher | `/wall/{id}` on the wall, press B to black it out |
| 6:50 | Site up or down? Decision rule in §3. | Sameer decides, Aryav reports | `/admin/contests/{id}/console` judge bar reads ok |
| 6:55 | Hype video. Students sit with their teams, phones and laptops on `/join`. | Sameer | Code wall still up |
| 7:00 | Press **Open now** on the Setup tab at 7:00 sharp. The window becomes 7:00 to 8:15 from the moment you press. | Aryav | Setup tab, Lifecycle panel. Swap the wall for `/projector?contest={id}` |
| 7:00 to 7:30 | Individual stretch. Each student works their own three problems. Paper puzzles handed out. | Everyone | Nothing to press |
| 7:30 | Teammates may start helping each other. Announce it. | Sameer announces | Nothing to press; the site has no switch for this |
| 7:30 to 8:15 | Collaboration, in person. Each problem is still submitted by its owner. | Everyone | Live console open, judge bar watched. Enter puzzle points as teams finish |
| 8:00 | Public board freezes on its own. Judging continues. | Nobody | Projector shows the frozen plate. Do not press End contest |
| 8:15 | Submissions close by the clock. Say so. Clean rooms. | Sameer, teacher | Nothing to press. The board stays frozen |
| 8:25 | Kahoot, 5 to 10 minutes. | Sameer hosts | Kahoot on the wall |
| 8:35 | Enter Kahoot placings as side-activity points. | Aryav | `/admin/contests/{id}/side-activities`, Kahoot preset |
| 8:36 | **Unfreeze and reveal** on the live console. The projector shows the final board. | Aryav presses, Sameer narrates | `/admin/contests/{id}/console`, button inside the frozen plate |
| 8:38 | Read the top three teams in each division. Hand out awards at the front. | Sameer, teacher | `/admin/contests/{id}/awards` on the laptop |
| 8:45 | Dismiss. | Teacher | Export CSV from the Awards tab before closing the laptop |

The projector always shows the public board, frozen from 8:00, even when it runs on the organizer
laptop that is signed in to the console. The wall asks the server for the public view on every
poll and sends no session with it, so nothing an organizer does in another tab can unfreeze it.
The Awards tab and the live console on the same laptop still see the live scores behind the freeze.
A private browser window for the wall also works, since it carries no session at all, and is a
fine habit to keep.

Two warnings about the lifecycle buttons. **Open now** moves the whole window to the instant you
press it, so pressing it at 6:58 closes submissions at 8:13. **End contest** turns the public board
into the final board the moment you press it, which is the reveal with nobody watching. Leave the
contest alone through Kahoot and let the unfreeze do the ending.

Both are recoverable on the Setup tab's Window panel. **Change the end time** gives the room 5, 10
or 15 more minutes, or takes an exact Indianapolis time, and a scheduled freeze moves with the end.
On an ended contest the same place reads **Reopen the contest**: type the end time, confirm, then
press the 15 minute freeze preset again, because ending early erased the freeze.

The clock will not spoil this for you. Once the board is frozen, the site stops accepting
submissions at 8:15 and otherwise waits: it does not end a frozen contest on its own, because an
ended contest's board is public. The only way the final board reaches the wall is **Unfreeze and
reveal**. A contest with no freeze set ends on the clock at 8:15 as before, final board and all,
which is one more reason the freeze preset in §2 is on the checklist.

## 2. The week before

Each line in the teacher's email, mapped to a screen or a person.

### On the site

- [ ] **Create the contest.** `/admin/contests/new`. Name it, set Starts at to 7:00 PM and Ends
  at to 8:15 PM on the night, Eastern. Leave Freeze at blank here; the Setup tab sets it in
  minutes later. Add the divisions on this form (Division 1 name, Division 2 name) if the night
  runs Intermediate and Advanced.
- [ ] **Build the roster.** `/admin/contests/{id}/teams`. New team name plus its division, then
  Add a student by name onto each team, or move students between teams with the move form.
  Teams of two to four, and one team of five if the numbers need it. Team size is the divisor in
  every team score, so a wrong roster is a wrong result. The screen lists everybody on no team at
  the top; that list must be empty. A student added onto a team after the sets are assigned is
  dealt a set no teammate holds, and a student moved between teams or divisions keeps their code.
- [ ] **Give everyone a join code.** Same Teams tab, the button of that name. One code per seat.
  A student who changes teams keeps their code.
- [ ] **Print the slips.** `/admin/contests/{id}/slips`. Print, cut, sort by team. Each slip
  says the student's name, team, division, set and code, and tells them to go to
  ptcodingnight.com/join. Print one extra copy of the whole page as the paper list for §3.
- [ ] **Check the problems for odd requirements.** `/admin/problems`. Open each problem the
  planner may deal and read its statement and limits. A problem whose whole point is a data type
  (a sum that needs 64 bits, an unsigned 32-bit flip) carries `keepOutOfSets` in its manifest in
  `content/problems/`, so the planner never deals it. It is missing from the cleared count on
  `/admin/problems`; to see why, open the contest's Problems tab and switch the bank filter to
  Everything, where its row says it is kept out of sets. Every problem must have passed
  `npm run test:content` (G13), which runs each reference solution through the real judge. A
  reference that passes locally proves the algorithm only.
- [ ] **Build the sets.** `/admin/contests/{id}/sets`. Number of sets is the size of the largest
  team, so 5 with a team of five (the screen starts there). The recipe defaults to 1 Easy and 2
  Medium per set, which is the teacher's brief: one quick solve and two problems of 15 to 20
  minutes each. Five sets of three is fifteen distinct problems per division, and no problem
  appears in two columns of one division. The same problem may be dealt to both divisions. If the bank cannot fill it, the
  screen says exactly how many more of which difficulty it needs. Leave Team questions at 0:
  there are no team problems this year. Press Build and read the grid back.
- [ ] **Assign the sets.** Setup tab, Assign problem sets. Every student gets a letter A to E,
  and teammates get different letters. The slips print the letter, so do this before printing.
- [ ] **Leave the group clock alone.** Setup tab, "Open team questions after the individual
  stretch". It only opens team questions, and there are none this year, so it should read "Team
  questions open with everything else at the start." The 7:30 switch to collaboration happens in
  the room.
- [ ] **Set the freeze to 15 minutes before the end.** Setup tab, Freeze the board before the
  finish, preset 15. The screen prints 8:00 PM. Judging never stops at the freeze and the live
  console stays live.
- [ ] **Hide the on-site puzzles.** `/admin/puzzles`. The puzzle this year is on paper, so every
  puzzle here should show as hidden; a student would otherwise see extra puzzles worth points.
  Hiding keeps nothing from anyone and is one press to undo.
- [ ] **Print the paper puzzles**, one per team member, and decide the points for a correct one
  before the night. Entry at the desk is on `/admin/contests/{id}/side-activities`: press Sudoku
  or Another puzzle, choose the team and, if you like, the seat or student, then type the points.
- [ ] **Publish.** Setup tab, Publish. The checklist above the button says what is missing.
  Students can then sign in with their codes before 7:00 and will wait in the lobby.
- [ ] **Tell students they can practice beforehand.** "Try practice problems" on the homepage and
  on `/join` opens the practice problems with no code, in the same editor and judge. Nothing there
  counts. A student already signed in to the contest is told to sign out first.
- [ ] **Run one full student journey yourself.** Use a rehearsal contest that uses the same
  problems, so the real roster stays clean. Sign in at `/join` with a code, open `/contest`,
  open a problem, Run samples, Submit, watch the verdict, open `/team`. Do this on a phone as
  well as a laptop.
- [ ] **Check the projector and the code wall on the actual projector.** Open
  `/projector?contest={id}` from the Setup tab's link and `/wall/{id}` from the Join slips tab's
  button, on the laptop that will drive the wall, plugged into the room's projector. Read the
  clock and the smallest text from the back row. On the wall, space pauses the rotation, the
  arrow keys page, and B blacks it out.
- The projector switches between divisions every 20 seconds on its own. To hold one division, add `&division={divisionId}` to its URL; clicking a tab pauses the switching for a minute.

### Not on the site

- [ ] **Kahoot deck.** Sameer. 8 to 12 questions, 5 to 10 minutes. Test the join flow with a
  second device.
- [ ] **Hype video.** Sameer. Under two minutes, on the projector laptop, tested with sound.
- [ ] **Physical awards.** Teacher and Sameer. Decide the tiers in §5 and have them at the front
  before 8:30.
- [ ] **HackerRank fallback.** Sameer. Built and tested per §3.

## 3. Stability test and contingency

### The morning of

From a laptop, with the organizer passcode in hand.

1. `SMOKE_ADMIN_PASSCODE=<passcode> ./scripts/smoke-prod.sh` (DEPLOY.md §8.5). It checks the
   certificate, the health route, the organizer sign-in, both OAuth redirects, that a published
   contest is being served with its window still ahead, and that the landing page, sign-in and
   projector render. Every line must say PASS. The script says plainly that it cannot submit a
   solution, so step 2 covers that.
2. One full student journey, as in §2, through the rehearsal contest.
3. One submission in each of the three languages students can pick on one easy problem: Python
   3, Java 21 and C++17. Each must come back AC. A CE on correct code means a judge image is
   unhealthy; Aryav rebuilds with `scripts/build-judge-images.sh --verify` on the box.
4. Check the judge bar on `/admin/contests/{id}/console`: workers alive is at least 1, queue
   reachable says yes.
5. On the box, `scripts/build-judge-images.sh --verify` must end in PASS (a judge image can rot
   with age; CLAUDE.md), and `df -h /` must show room. `docker ps --format '{{.Names}}' | grep -c
   javac` should print 6: the warm Java compilers, one per judge lane.

What to expect from the judge, measured on this droplet (4 vCPU shared, 8 GB, `JUDGE_CONCURRENCY=6`)
on 2026-11-16 with the board frozen and real browser behaviour: 35 students submitting in the same
second, last verdict about 23 s; 57 submissions in the same second (16 students sending two or three),
about 33 s; submissions spread a second apart, about 5 s. Zero wrong verdicts in every run. The
droplet's CPUs are shared, and once in testing the provider took half of them away for a few minutes;
that is the only measured case where results took minutes without slow programs. In the final round
the provider took 8-16% of the CPU throughout, and 57 same-second submissions then took 51 to 61 s.
With 8 of 35 students sending Java that times out on every test, everyone else had their verdict
within 47 s and the slow ones got TLE within about 2 minutes 45 seconds.

### Before the doors open

At 6:15, repeat steps 3 and 4. Then open the projector and the wall.

### The fallback

- A redundant HackerRank contest, built the week before, with the same problem titles as our
  sets. Use HackerRank's own library problems under those titles. Never paste our statements or
  our test data into HackerRank, and never copy theirs into ours.
- The paper join-code list, printed from `/admin/contests/{id}/slips` in §2, so the roster and the
  teams exist on paper if the site does not.
- The awards spreadsheet with the team formula from SCORING.md §1 already typed in: the sum of
  every member's points divided by team size, plus side-activity points flat. Check it against the
  worked example in SCORING.md §2, which must give 543.75 and never 512.5.

### The decision rule

If the site is down at 6:50, or dies for more than 10 minutes during the round, switch to
HackerRank and keep team scoring on the awards spreadsheet. Points earned on the site before the
switch count; Aryav reads them off the live console or the Awards tab if it still loads.

**Sameer makes the call.** Aryav tells him what the site is doing and how long a fix will take.
Sameer tells the teacher before he tells the room, and the call stands once the room knows.

## 4. Kahoot and scoring

Kahoot runs 8:25 to 8:35, after rooms are clean and before awards. Plan 8 to 12 questions in 5
to 10 minutes, because a longer game bores the room. Teams play as teams on one device each, so
the placing is a team placing.

At 8:35 Aryav opens `/admin/contests/{id}/side-activities` and presses the Kahoot button at the
top of the form. The screen then shows the suggested payout. Enter one line per team that
played, choosing the team and typing its points:

| Kahoot placing | Points |
|---|---|
| 1st | 60 |
| 2nd | 40 |
| 3rd | 20 |
| Every other team | 10 |

Every award is listed under its team with what it was for, its points, who entered it and when.
A wrong one is fixed with Edit or Remove on its own row, and the audit log keeps what it said
before. Entering the same award twice for a team (the same puzzle and seat, or a second Kahoot) is
refused with the first one named, and goes through only if you press Record it as a second award.
While the board is frozen, an award that was already on it cannot change its points; the Kahoot,
entered after the freeze, can.

The engine adds these points flat to the team score and never divides them by team size.
SCORING.md §1 explains why: a side activity is something the team did as a unit, so dividing it
would charge a big team for its size. A problem solved by one member goes into the mean; a Kahoot placing does
not. The arithmetic the board shows for each team is

```
teamScore = (sum of every member's points) / teamSize
            + sideActivityPoints
```

The paper puzzles are entered on the same screen, so the puzzles and the Kahoot all land in the
flat term, shown as the Puzzle column. Expand a team on the Awards tab to see each award under the
player pool, and check they add up to the Puzzle column.

## 5. Awards in under ten minutes

The freeze at 8:00 keeps the mystery. Everyone has seen the board as it stood at 8:00 and nobody
has seen the last fifteen minutes, the puzzles solved since, or the Kahoot points. Judging and
entry carry on behind the frozen plate the whole time, and the clock leaves a frozen contest alone
past 8:15 instead of ending it, so the plate stays up until you press the reveal.

**Before the reveal, check the judge bar reads 0 queued and 0 judging now.** A submission made
before 8:15 still counts if the judge finishes it after 8:15, and the reveal does not wait for it:
pressing it with work still queued means the "final" board can change after the room has seen it.
On this server the queue drains within a couple of minutes of 8:15, long before 8:36, so this is a
glance, not a wait.

The reveal takes one press on the live console. On `/admin/contests/{id}/console`, inside the
frozen plate at the top, press **Unfreeze and reveal**, then confirm **Reveal the final board**. The contest is past its
end, so this ends it and the projector repaints with the final standings. Sameer should be at the
front, mid-sentence, when Aryav presses it.

Read the top three teams in each division from `/admin/contests/{id}/awards` on the laptop; the
screen has one podium per division. Every row shows the
numbers its team score was computed from. Ties are shown as ties. Hand out awards at the front
while the board stays on the wall, and dismiss by 8:45. Press Export CSV on the Awards tab before
the laptop closes.

Decide these before the night, in writing, so nobody decides anything in front of the room:

- How many places get an award, overall or per division.
- What happens on a tie. The board will show two teams on one step of the podium and will not
  pick between them. Either both get the award, or Sameer announces a tiebreak before 7:00.
- Whether there is an individual award for the top scorer, or team awards only. There is no
  separate individual board. Expand the teams on the Awards board (`/admin/contests/{id}/awards`,
  or Expand all) to see every member's points, and read the top scorer in each division from there.
- Whether a puzzle-only or Kahoot-only award exists for a team that did not place.
- Who speaks, and where the awards sit at 8:30.

## 6. If something breaks during the round

Aryav takes every row in this table. Sameer keeps the room working; a student whose submission
is stuck should keep solving, because judging resumes without them re-submitting. A row that is
not fixed in 10 minutes triggers the decision rule in §3.

| What the room sees | What it usually is | The one action | Call |
|---|---|---|---|
| Every submission comes back IE | The judge cannot see its scratch directory, or the runtime images are missing on the box | On the box, compare `ls -la /srv/ptcn/judge/scratch` on the host and inside the worker container (DEPLOY.md §13); they must list the same files. Then `scripts/build-judge-images.sh --verify`. Students never see IE as a failure; it requeues once. | Aryav |
| Every submission comes back CE, including code that compiles | The Go image has aged past 24 hours, or a compile flag misses its cache | `scripts/build-judge-images.sh --verify` on the box, then Rejudge each CE from the live console feed | Aryav |
| A student's problem list is empty | They have no division or no set, or the contest has not been opened | Teams tab: set their division and set in the move form. Check the Setup tab says Live. | Sameer at the roster, Aryav on Setup |
| "The judge is busy right now" on Run samples in the last minutes | Run samples shares the judge with submissions, and 50 students submitting at once fills the queue | Nothing is broken. Tell them to Submit instead: a submission is accepted at once and judged in order, and it counts even if the verdict arrives after 8:15 | Sameer, to the room |
| A student cannot sign in | Code typed wrong, or the Google button failing for its own reasons | Join slips tab: type the code into the lookup to see whose it is. Reissue the code from the Teams tab if it is lost. Google failing is why the codes exist; use the code. | Sameer at the door |
| Verdicts take minutes and the console queue keeps growing | A burst of slow programs. A Java test that times out runs to its 6 s limit before it is stopped, and every test runs because each one earns partial credit. A submission that starts timing out moves to a slow lane so the rest of the room keeps getting verdicts, but a large wave of them still slows everything | Nothing is lost. Tell the room their submissions are saved and judged in order, and that pressing Submit again on identical code only adds to the queue. Do not restart the worker for this | Sameer, to the room |
| The worker died or was restarted | A crash, or a redeploy during the round | Submissions waiting in the queue resume at once. The ones it was judging at that moment come back after about a minute, by themselves, with no verdict changed (a shutdown releases them unjudged). Still do not run the update script during the round | Aryav |
| Java verdicts look wrong: correct Java gets RE, TLE or CE that the same code does not get in practice | A fault in one of the three Java speedups | On the box, set the matching line in `/srv/ptcn/app/.env` to `off` and recreate only the worker: `JUDGE_JVM_HARNESS` (tests in one JVM), `JUDGE_JAVAC_SERVICE` (warm compiler) or `JUDGE_TLE_AT_THRESHOLD` (stop at the limit). Then `docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate worker` and Rejudge the affected submissions from the live console. Java gets slower; verdicts return to the plain path every gate covers | Aryav, only if verdicts are wrong |
| The room needs more time, or End contest was pressed by mistake | An outage that cost the room minutes, or the wrong button | Setup tab, Window panel. **Change the end time** for more minutes, or **Reopen the contest** with a new end time, then press the 15 minute freeze preset again | Aryav, after Sameer decides |
| The board froze too early, or was frozen by hand and unfrozen | A wrong freeze preset, or the live console's freeze button | Setup tab, freeze presets: press 15 again. Unfreezing by hand before 8:00 clears the scheduled freeze, so it has to be set again or the final board shows at 8:15 | Aryav |
| Projector shows the wrong thing | Bare `/projector` picked a different contest, or the page was never refreshed | Open `/projector?contest={id}` from the Setup tab's link. The wall shows the public board even on the organizer laptop, so a frozen plate missing after 8:00 means the Window panel on Setup has no freeze; press Freeze the public board on the live console instead. If it still shows live scores, reload it, or open it in a private window. | Aryav |

Logs, if a row needs them: on the box, `docker compose -f docker-compose.prod.yml logs --tail=100
worker` and the same for `web`. Almost every failure announces itself there.
