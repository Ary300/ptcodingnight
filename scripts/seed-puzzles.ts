// Standalone tsx entrypoint — load .env before anything reads process.env.
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { normalizePuzzleAnswer, seededPuzzleActiveOnCreate } from "@/lib/contest/puzzles";
import { parseServerEnv } from "@/lib/schemas/env";

/**
 * Seeds the browser puzzles: decode the binary, break the cipher, finish the sudoku.
 *
 * These exist because the organizer asked for something a student can do on the night without
 * knowing a language yet. They pay their team through the same side-activity award the metal
 * puzzle pays through, so nothing about scoring changes.
 *
 * Idempotent, keyed on slug: re-running updates the prompt, the points and the seat letter, and
 * leaves every solve and every award already made exactly where they are.
 *
 * ONE PUZZLE PER TEAM MEMBER. Teams are up to four, and under `RANDOM_ASSIGNED` every teammate
 * holds a different set letter, so the four lettered puzzles below map one per seat: a student on
 * set A gets the binary, B the cipher, C the hex, D the seating puzzle. All four are worth the
 * same, so no letter is luckier than another. EVERY puzzle is created HIDDEN, the seat ones too,
 * because the night's puzzles are on paper; an organizer shows any of these from /admin/puzzles.
 *
 * TEXT answers are stored NORMALISED, through the same function the checker uses on the way in.
 * Storing "Meridian Hills" and comparing it against a normalised attempt would fail forever, and
 * it would fail silently: the puzzle would simply be unsolvable.
 */

interface PuzzleSeed {
  readonly slug: string;
  readonly title: string;
  readonly topic: string;
  readonly promptMd: string;
  readonly check: "TEXT" | "SUDOKU";
  /** For TEXT the accepted answer, written naturally; normalised before it is stored. */
  readonly answer: string;
  readonly hint?: string;
  readonly points: number;
  readonly sortOrder: number;
  /** The set letter this puzzle is for, or null for one every teammate can see. */
  readonly forSetLabel: string | null;
}

/** Every seat puzzle pays this, so the letter a student drew never decides their points. */
const SEAT_PUZZLE_POINTS = 25;

/*
  A sudoku whose solution is unique, written as 81 characters with 0 for a blank. The checker
  validates a completion against these givens rather than against a stored solution, so the
  answer key here is the PUZZLE, not its answer.
*/
const SUDOKU_GIVENS =
  "530070000" +
  "600195000" +
  "098000060" +
  "800060003" +
  "400803001" +
  "700020006" +
  "060000280" +
  "000419005" +
  "000080079";

const PUZZLES: readonly PuzzleSeed[] = [
  {
    slug: "binary-panthers",
    title: "Read the machine's mind",
    topic: "Binary",
    check: "TEXT",
    points: SEAT_PUZZLE_POINTS,
    sortOrder: 10,
    forSetLabel: "A",
    promptMd: `Computers spell in ones and zeros. Every letter is one group of eight bits, and the
groups below are separated by spaces.

\`\`\`
01010000 01100001 01101110 01110100 01101000 01100101 01110010 01110011
\`\`\`

Decode it and type the word.`,
    hint: "Each group is one ASCII character. 01000001 is a capital A, and 01100001 is a lower case a.",
    answer: "Panthers",
  },
  {
    slug: "caesar-cider",
    title: "The orchard cipher",
    topic: "Cipher",
    check: "TEXT",
    points: SEAT_PUZZLE_POINTS,
    sortOrder: 20,
    forSetLabel: "B",
    promptMd: `Every letter below has been pushed the same number of places forward through the
alphabet, wrapping from Z back to A. Push them back to read the message.

\`\`\`
FLGHU VWRUH
\`\`\`

Type the two words you get.`,
    hint: "Try shifting by three. F becomes C.",
    answer: "cider store",
  },
  {
    slug: "hex-color",
    title: "What colour is that?",
    topic: "Numbers",
    check: "TEXT",
    points: SEAT_PUZZLE_POINTS,
    sortOrder: 30,
    forSetLabel: "C",
    promptMd: `Colours on the web are written in hexadecimal: base sixteen, where the digits run
0 to 9 and then A to F. This site's red is written \`E4572E\`.

The first two characters are the red channel. Convert \`E4\` to an ordinary base ten number and
type it.`,
    hint: "E is 14. The value is 14 times 16, plus 4.",
    answer: "228",
  },
  {
    slug: "logic-seating",
    title: "Mr. Ritz seats the Science Bowl team",
    topic: "Logic",
    check: "TEXT",
    points: SEAT_PUZZLE_POINTS,
    sortOrder: 40,
    forSetLabel: "D",
    /*
      THREE CLUES, AND THE PUZZLE HAS EXACTLY ONE ANSWER. The first draft had four clues and TWO
      answers (Kylie Dominic Navraj Oliver also satisfied every one of them), which would have
      told a correct student they were wrong. Brute-forced all 24 seatings against this wording
      before shipping it; a clue set is only finished once something has counted the solutions.
    */
    promptMd: `Four students sit in a row of four chairs, numbered 1 to 4 from the left.

- Navraj is in chair 3.
- Kylie is not sitting next to Navraj.
- Dominic sits at one end of the row.

Type the four names in chair order, separated by spaces.`,
    hint: "Navraj is fixed, so start by ruling out the chairs Kylie cannot take.",
    answer: "Kylie Oliver Navraj Dominic",
  },
  {
    slug: "sequence-orchard",
    title: "The next number",
    topic: "Patterns",
    check: "TEXT",
    points: 20,
    sortOrder: 50,
    forSetLabel: null,
    promptMd: `The apple crates in the old orchard barn are stacked in a pattern:

\`\`\`
1, 1, 2, 3, 5, 8, 13, 21, ?
\`\`\`

Type the next number.`,
    hint: "Each number is built from the two before it.",
    answer: "34",
  },
  {
    slug: "sudoku-warmup",
    title: "Sudoku",
    topic: "Sudoku",
    check: "SUDOKU",
    points: 40,
    sortOrder: 60,
    forSetLabel: null,
    promptMd: `Fill the grid so every row, every column and every three by three box contains
each digit from 1 to 9 exactly once. Zeros are the blanks.

\`\`\`
5 3 .  . 7 .  . . .
6 . .  1 9 5  . . .
. 9 8  . . .  . 6 .

8 . .  . 6 .  . . 3
4 . .  8 . 3  . . 1
7 . .  . 2 .  . . 6

. 6 .  . . .  2 8 .
. . .  4 1 9  . . 5
. . .  . 8 .  . 7 9
\`\`\`

Type your finished grid as 81 digits, reading left to right and top to bottom. Spaces and line
breaks are fine.`,
    hint: "Start with the row, column or box that has only one number missing.",
    answer: SUDOKU_GIVENS,
  },
];

async function main(): Promise<void> {
  const env = parseServerEnv();
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    for (const puzzle of PUZZLES) {
      const answerKey =
        puzzle.check === "SUDOKU" ? puzzle.answer : normalizePuzzleAnswer(puzzle.answer);
      const shared = {
        title: puzzle.title,
        topic: puzzle.topic,
        promptMd: puzzle.promptMd,
        check: puzzle.check,
        answerKey,
        hint: puzzle.hint ?? null,
        points: puzzle.points,
        sortOrder: puzzle.sortOrder,
        // In the update too, so re-seeding an existing database assigns the letters.
        forSetLabel: puzzle.forSetLabel,
      };
      await prisma.puzzle.upsert({
        where: { slug: puzzle.slug },
        // `active` only on create: an organizer who hid a puzzle mid-contest must not have it
        // reappear because somebody re-ran the seed, and one shown as a bonus must not vanish.
        // A fresh database shows NONE of them, seat puzzles included, because the night runs on
        // paper puzzles; an organizer shows any of these from /admin/puzzles.
        create: {
          slug: puzzle.slug,
          active: seededPuzzleActiveOnCreate(),
          ...shared,
        },
        update: shared,
      });
      const seat = puzzle.forSetLabel === null ? "everyone" : `set ${puzzle.forSetLabel}`;
      console.log(`  ${puzzle.slug}: ${puzzle.topic}, ${String(puzzle.points)} points, ${seat}`);
    }
    console.log(`Seeded ${String(PUZZLES.length)} puzzles.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
