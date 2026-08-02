"use client";

/**
 * The filter rail HackerRank puts beside a challenge list: uppercase group labels, checkboxes,
 * a hairline between groups.
 *
 * ## Why checkboxes and not a dropdown
 *
 * Every filter is visible in its resting state, and so is whether it is on. A student mid-round
 * who cannot find a problem needs to see at a glance that they left "Unsolved" ticked twenty
 * minutes ago — a closed dropdown hides exactly the fact that explains the empty list.
 *
 * ## Why nothing is selected by default
 *
 * No boxes ticked means no filtering, not "nothing matches". Filters that arrive pre-applied are
 * the reason people think a list is broken, and in a ninety-minute contest that costs minutes
 * nobody gets back.
 */

export interface FilterGroup {
  readonly id: string;
  /** Shown above the group, in caps. */
  readonly label: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

export interface FilterRailProps {
  readonly groups: readonly FilterGroup[];
  /** Group id to the set of selected values. A group absent or empty means "do not filter". */
  readonly selected: Readonly<Record<string, readonly string[]>>;
  readonly onChange: (groupId: string, value: string, checked: boolean) => void;
  /** Rendered under the last group — usually "Showing 4 of 12". */
  readonly footer?: React.ReactNode;
}

export function FilterRail({ groups, selected, onChange, footer }: FilterRailProps) {
  return (
    /*
      On its own paper card, matching the list beside it.

      The rail used to sit bare on the tinted ground while the problems sat on paper, so the two
      halves of the same screen belonged to different surfaces. HackerRank puts both on the same
      one; it costs a border and it is what makes the pair read as one screen rather than a list
      with some loose controls next to it.
    */
    <aside
      aria-label="Filters"
      className="flex h-fit flex-col gap-5 rounded-panel border border-rule-edge bg-paper p-4"
    >
      {groups.map((group, index) => (
        /*
          The group divider lives on a plain wrapper, never on the fieldset. A <legend> punches a
          hole through its fieldset's own border box (that is what legends are for on a framed
          fieldset), so `border-t` on the fieldset painted only the stub to the RIGHT of the
          label — measured 62.5px of a 160px rail, vertically centred on the word instead of
          above it. The wrapper draws the full-width rule the reference shows; the fieldset stays
          inside for the group semantics it was there for.
        */
        <div key={group.id} className={index === 0 ? "" : "border-t border-rule-hair pt-5"}>
          <fieldset>
            {/*
              One mb on the legend is the whole spacing story. When the fieldset carried the
              border, the legend sat ON the border line and the fieldset's pt-5 stacked under it,
              so the two groups showed different label-to-first-option gaps (measured 8px vs
              28px). The reference runs ~28px on both; mb-7 is that number, applied once.
            */}
            <legend
              className="mb-7 text-ink/60 uppercase"
              style={{ fontSize: "var(--text-xs)", letterSpacing: "0.08em" }}
            >
              {group.label}
            </legend>

            {/* 20px boxes on a 34px pitch, the reference's density; 16px on 30px read cramped. */}
            <div className="flex flex-col gap-2.5">
              {group.options.map((option) => {
                const checked = (selected[group.id] ?? []).includes(option.value);
                return (
                  /*
                    The press state a native checkbox does not give you: the whole label row
                    dips 2% for the duration of the press, so ticking a box is acknowledged by
                    the control under the finger rather than only by rows vanishing elsewhere.
                    Same scale and duration as every Button.
                  */
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-center gap-2 transition-transform duration-[var(--motion-press)] active:scale-[0.98]"
                    style={{ fontSize: "var(--text-sm)" }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => onChange(group.id, option.value, event.target.checked)}
                      className="h-5 w-5 shrink-0 accent-panther"
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
      ))}

      {footer !== undefined && (
        <p
          role="status"
          className="numeric border-t border-rule-hair pt-3 text-ink/65"
          style={{ fontSize: "var(--text-xs)" }}
        >
          {footer}
        </p>
      )}
    </aside>
  );
}
