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
    <aside aria-label="Filters" className="flex flex-col gap-5">
      {groups.map((group, index) => (
        <fieldset
          key={group.id}
          className={index === 0 ? "" : "border-t border-ink/12 pt-5"}
        >
          <legend
            className="mb-2 text-ink/60 uppercase"
            style={{ fontSize: "var(--text-xs)", letterSpacing: "0.08em" }}
          >
            {group.label}
          </legend>

          <div className="flex flex-col gap-1.5">
            {group.options.map((option) => {
              const checked = (selected[group.id] ?? []).includes(option.value);
              return (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2"
                  style={{ fontSize: "var(--text-sm)" }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => onChange(group.id, option.value, event.target.checked)}
                    className="h-4 w-4 shrink-0 accent-panther"
                  />
                  {option.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      {footer !== undefined && (
        <p
          role="status"
          className="numeric border-t border-ink/12 pt-3 text-ink/65"
          style={{ fontSize: "var(--text-xs)" }}
        >
          {footer}
        </p>
      )}
    </aside>
  );
}
