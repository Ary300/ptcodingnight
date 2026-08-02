import Image from "next/image";

/**
 * The dark half of the split-screen entry pages, following HackerRank's login layout: brand mark
 * and a line of welcome copy on a dark panel, the form on white beside it.
 *
 * ## Why the panther and not the crest
 *
 * `pt-crest-*.svg` is the school SEAL — crown, shield, tree, "PARK TUDOR SCHOOL" banner. It is
 * the formal institutional mark and DESIGN.md §8 keeps it reserved. This is the ATHLETIC mark:
 * the panther head with the PT monogram, which is what the room already associates with a Park
 * Tudor team competing at something. Coding Night is a competition, so it gets the competition
 * mark.
 *
 * ## Why it is `alt=""`
 *
 * The heading beside it already says "Park Tudor Coding Night". A logo with alt text next to a
 * heading that says the same thing makes a screen reader announce the name twice, which is the
 * usual way a decorative-but-meaningful image ends up being noise. The visible heading carries
 * the meaning; the mark is presentation.
 */
export function BrandPanel({ children }: { children?: React.ReactNode }) {
  return (
    <aside
      aria-label="Coding Night welcome"
      /*
        `motion-swap-in`: the entry pages sit outside both route groups, so the group templates'
        arrival never wraps them. The panel rises with the form column beside it (the page root
        carries `motion-stagger`, so the form lands 35ms behind). Transform-only on purpose: the
        welcome copy in here is `text-paper/75`, and a wrapper fade would drag it below its
        contrast floor for the length of the animation.
      */
      className="motion-swap-in relative hidden flex-col justify-between overflow-hidden bg-ink px-10 pt-10 pb-14 text-paper lg:flex"
    >
      {/*
        The panther, oversized and bled off the corner at low opacity. HackerRank uses a dark
        globe photograph here; we have one brand image and no photograph, so the mark itself
        becomes the field. Kept under 12% so nothing on top of it drops below the DESIGN.md §7
        contrast floor — the a11y gate checks the copy in this panel, not just the form.
      */}
      <Image
        src="/brand/pt-panther.png"
        alt=""
        aria-hidden="true"
        width={275}
        height={235}
        priority
        className="pointer-events-none absolute -right-16 -bottom-10 w-[28rem] max-w-none opacity-[0.06]"
      />

      <Image
        src="/brand/pt-panther.png"
        alt=""
        aria-hidden="true"
        width={275}
        height={235}
        priority
        className="relative h-auto w-24"
      />

      {/* A measure on the copy. Set across a half-screen panel it runs to ~90 characters, which
          is well past the 45-75 DESIGN.md §4 asks for and reads as a caption stretched to fit. */}
      <div className="relative max-w-md">{children}</div>
    </aside>
  );
}
