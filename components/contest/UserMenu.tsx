"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { API_ROUTES } from "@/lib/schemas/api";

/**
 * The account menu HackerRank puts at the right of its nav: an avatar and a chevron, a panel with
 * the viewer's headline stat at the top, then divided destinations and finally sign-out.
 *
 * ## What goes in the highlighted slot
 *
 * HackerRank puts a currency there ("Hackos: 1110"). The equivalent fact here is the one a
 * competitor actually wants at a glance and currently has to change page to see: **their team, and
 * the problem set that team was assigned.** Sets are assigned and never chosen or previewed
 * (PRD §6.2), so naming the set is the only feedback a student ever gets about it.
 *
 * A student who is on no team gets told so in that slot, because it is the single most important
 * thing about their standing — an unassigned player contributes to no team score, and that is
 * worth interrupting them about rather than hiding a page away.
 *
 * The slot is left-aligned where HackerRank centres it: theirs is one short balanced string, ours
 * is a name over a quieter second line, and centred text with two weights reads as a wobble.
 *
 * ## Behaviour
 *
 * Closes on Escape, on outside click, and on navigating. Escape is not optional: this is a menu
 * that covers the page on a phone, and a student who opened it by accident mid-round needs it
 * gone without hunting for the exact pixel that dismisses it.
 */

export interface UserMenuProps {
  readonly displayName: string;
  /** The viewer's team, when they have one. */
  readonly teamName?: string | null;
  /** The problem set an organizer assigned, when there is one. */
  readonly setLabel?: string | null;
  /** The account behind the session, so the avatar image can be addressed. Null for join-by-code. */
  readonly userId?: string | null;
  /** The avatar's last-changed instant, used to bust the image cache. Null when there is none. */
  readonly avatarVersion?: string | null;
  readonly onSignOut: () => void;
}

const ITEMS = [
  { href: "/contest", label: "Problems" },
  { href: "/team", label: "My team" },
  { href: "/submissions", label: "My submissions" },
  { href: "/projector", label: "Live standings" },
  { href: "/settings", label: "Settings" },
] as const;

/**
 * The account picture, at a given size.
 *
 * When the account has uploaded an avatar (`userId` set and `version` present) it renders the
 * image; otherwise, and if the image fails to load, it falls back to the first initial in a disc.
 * The initial is not a placeholder to be embarrassed about: on a shared lab machine it is the
 * fastest possible answer to "am I still signed in as the last student", which is exactly the
 * question at 360px where the name itself is hidden.
 */
function Avatar({
  displayName,
  userId,
  version,
  sizeClass = "h-7 w-7",
}: {
  displayName: string;
  userId?: string | null;
  version?: string | null;
  sizeClass?: string;
}) {
  const initial = displayName.trim().charAt(0).toUpperCase();
  const [broken, setBroken] = useState(false);
  const showImage =
    typeof userId === "string" && userId !== "" && (version ?? null) !== null && !broken;

  if (showImage) {
    return (
      // A plain <img>, not next/image: the source is our own dynamic route with its own cache
      // headers, and next/image would try to optimise a route it cannot statically know.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={API_ROUTES.userAvatar(userId, version)}
        alt=""
        aria-hidden="true"
        onError={() => setBroken(true)}
        className={`${sizeClass} shrink-0 rounded-full object-cover`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-panther font-semibold text-paper`}
      style={{ fontSize: "var(--text-xs)" }}
    >
      {initial === "" ? "?" : initial}
    </span>
  );
}

export function UserMenu({
  displayName,
  teamName = null,
  setLabel = null,
  userId = null,
  avatarVersion = null,
  onSignOut,
}: UserMenuProps) {
  const [open, setOpen] = useState(false);
  /*
    Where the phone sheet's top edge sits, in viewport pixels — null on `sm` and up, where the
    panel is the ordinary anchored dropdown.

    Below `sm` the header stacks (avatar row, then the Problems / My team / My submissions row),
    and a panel anchored `mt-2` under the trigger opened at y=106 — exactly over the nav tabs at
    y=106-158, so an open account menu hid the three destinations it does not contain. The sheet
    is anchored to the HEADER's bottom edge instead, measured rather than hard-coded because the
    stub banner and the wrapping rows both move it.
  */
  const [sheetTop, setSheetTop] = useState<number | null>(null);
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    const onClick = (event: MouseEvent): void => {
      if (root.current !== null && !root.current.contains(event.target as Node)) setOpen(false);
    };
    // The sheet is `position: fixed` while the header scrolls with the page, so a scroll would
    // detach it from the edge it claims to hang from. Closing is the honest response, and it is
    // what a student scrolling to read the page wants from an overlay anyway. Phone only: the
    // desktop dropdown is anchored to its trigger and moves with it.
    const onScroll = (): void => {
      if (!window.matchMedia("(min-width: 640px)").matches) setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    window.addEventListener("scroll", onScroll);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("scroll", onScroll);
    };
  }, [open]);

  // Layout effect, not effect: the measurement decides where the panel PAINTS, and running it
  // after paint shows one frame of the dropdown covering the nav before it jumps to the sheet.
  useLayoutEffect(() => {
    if (!open) return undefined;

    const place = (): void => {
      if (window.matchMedia("(min-width: 640px)").matches) {
        setSheetTop(null);
        return;
      }
      const header = root.current?.closest("header");
      setSheetTop(header == null ? null : header.getBoundingClientRect().bottom);
    };

    place();
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("resize", place);
    };
  }, [open]);

  return (
    /*
      `min-w-0` is load-bearing, not tidiness. A flex item's default `min-width: auto` refuses to
      shrink below its content, so without it a long display name pushed the whole header past the
      viewport — measured 436px inside a 360px phone, which is a sideways scroll on every
      competitor page. The chrome carries a comment about this exact failure; replacing the block
      it described reintroduced it.
    */
    <div ref={root} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        /*
          The name is hidden below `sm`, so the button would otherwise be an unlabelled disc and a
          chevron. Stating the whole label here rather than relying on the visible text means the
          accessible name does not change with the viewport.
        */
        aria-label={`Account: ${displayName}`}
        className="flex min-w-0 items-center gap-2 rounded-chip px-1.5 py-1 text-paper/85 hover:text-paper"
        style={{ fontSize: "var(--text-sm)" }}
      >
        <Avatar displayName={displayName} userId={userId} version={avatarVersion} />
        <span // Hidden only BELOW 400px, where 10rem of display name is a third of the viewport
          // spent on something the student already knows; the avatar and the aria-label still
          // identify the account there.
          //
          // 400 rather than the `sm` breakpoint on purpose. `sm` is 640px, which would hide the
          // name on every phone including the 412px profile G7 runs — and G7 asserts that the
          // banner shows who you are signed in as. A breakpoint chosen for tidiness would have
          // turned a deliberate mobile affordance into a failing gate on the second-widest
          // device in the suite.
          className="hidden min-w-0 max-w-[10rem] truncate min-[400px]:block"
        >
          {displayName}
        </span>
        <span aria-hidden="true" className={open ? "shrink-0 rotate-180" : "shrink-0"}>
          &#9662;
        </span>
      </button>

      {open && (
        <div
          /*
            `text-ink` is not optional here. This panel is a paper surface rendered INSIDE the
            header, which sets `text-paper` for the dark bar — so every item that did not set its
            own colour inherited near-white and was invisible on white. Only "Sign out" showed,
            because it happens to specify `text-panther`.

            Stating the colour at the surface, rather than on each item, is what stops the next
            item added here from disappearing.
          */
          className={
            sheetTop !== null
              ? "fixed inset-x-0 z-50 overflow-hidden border-y border-rule-edge bg-paper text-ink shadow-lg"
              : "absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-panel border border-rule-edge bg-paper text-ink shadow-lg"
          }
          style={sheetTop !== null ? { top: sheetTop } : undefined}
        >
          {/*
            The highlighted slot. Panther red with paper text rather than red text on paper: at
            this size red-on-paper is below the contrast floor (DESIGN.md §2 pins --panther out
            of small body text), and inverting it puts the emphasis where HackerRank puts it
            without breaking the rule.

            **The second line is FULL-STRENGTH paper, not a muted alpha.** It was `text-paper/85`
            and axe measured it at 4.07:1 — a serious violation and a G9 failure. DESIGN.md §7's
            47% floor is measured against `--ink`, which is 18.65:1 to begin with; `--panther` is a
            far lighter ground at 5.08:1, so there is almost no headroom to spend and any alpha at
            all drops it under AA. The floor does not transfer between grounds, and this is what
            that looks like when you assume it does.

            The two lines are still distinguished — by weight, which costs no contrast.
          */}
          <div className="bg-panther px-3.5 py-3 text-paper">
            {teamName === null ? (
              <>
                <span className="block font-semibold" style={{ fontSize: "var(--text-sm)" }}>
                  Not on a team yet
                </span>
                <span className="block" style={{ fontSize: "var(--text-xs)" }}>
                  An organizer will add you
                </span>
              </>
            ) : (
              <>
                <span className="block truncate font-semibold" style={{ fontSize: "var(--text-sm)" }}>
                  {teamName}
                </span>
                <span className="block" style={{ fontSize: "var(--text-xs)" }}>
                  {setLabel === null ? "No problem set assigned yet" : `Problem set ${setLabel}`}
                </span>
              </>
            )}
          </div>

          {/*
            The `menu` role lives on the LIST, not on the panel, and the `li`s are `role="none"`.

            axe called this as two criticals when the panel carried the role: `menu` must contain
            `menuitem` CHILDREN (`aria-required-children`), and `ul`/`li` between them break that
            relationship (`aria-required-parent`). The team slot above is not a menu item either —
            it is a header — so having it inside the menu was part of the same mistake.

            Caught by the audit added alongside this component, which is the argument for auditing
            an open dropdown rather than only the page behind it.
          */}
          {/*
            The row dividers are inset to the panel's 14px content gutter (`mx-3.5`, the same
            gutter the team slot and every label sit on) rather than run edge to edge — the
            reference keeps one alignment line governing chip, labels and rules. Drawn as their
            own element because a border on the `li` can only be full-bleed.
          */}
          <ul role="menu" aria-label="Account">
            {ITEMS.map((item) => (
              <li key={item.href} role="none">
                <div aria-hidden="true" className="mx-3.5 border-t border-rule-hair" />
                <Link
                  href={item.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="block px-3.5 py-2.5 hover:bg-ink/5"
                  style={{ fontSize: "var(--text-sm)" }}
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li role="none">
              <div aria-hidden="true" className="mx-3.5 border-t border-rule-hair" />
              {/*
                Styled like every other row, as the reference styles Logout. It carried
                `font-semibold text-panther`, which made the one action a student least wants
                mid-round the only emphasized, destructive-looking row in the menu.
              */}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}
                className="block w-full px-3.5 py-2.5 text-left hover:bg-ink/5"
                style={{ fontSize: "var(--text-sm)" }}
              >
                Sign out
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
