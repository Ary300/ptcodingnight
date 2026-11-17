"use client";

/**
 * Parameter Info and Quick Documentation: a quiet panel above the caret. Focus stays in the
 * editor; the text is a polite live region so a screen reader hears it once, and Escape (handled
 * by the editor's key order) closes it.
 */

export type InfoContent =
  | { readonly kind: "parameters"; readonly signatures: readonly string[]; readonly activeParameter: number }
  | { readonly kind: "doc"; readonly title: string; readonly body: string }
  | { readonly kind: "none"; readonly message: string };

export interface InfoPopupProps {
  readonly id: string;
  readonly content: InfoContent;
  readonly top: number;
  readonly left: number;
}

/** Splits "max(int a, int b)" into the parts before, inside each argument, and after. */
export function signatureParts(signature: string): { head: string; params: readonly string[]; tail: string } {
  const open = signature.indexOf("(");
  const close = signature.lastIndexOf(")");
  if (open === -1 || close < open) return { head: signature, params: [], tail: "" };
  const inner = signature.slice(open + 1, close);
  const params = inner.trim() === "" ? [] : inner.split(",").map((part) => part.trim());
  return { head: signature.slice(0, open + 1), params, tail: signature.slice(close) };
}

function Signature({ signature, active }: { signature: string; active: number }) {
  const { head, params, tail } = signatureParts(signature);
  return (
    <p className="font-mono">
      {head}
      {params.map((param, index) => (
        <span key={index}>
          {index > 0 && ", "}
          <span className={index === active ? "font-bold text-gold" : undefined}>{param}</span>
        </span>
      ))}
      {tail}
    </p>
  );
}

export function InfoPopup({ id, content, top, left }: InfoPopupProps) {
  return (
    <div
      id={id}
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute z-30 max-w-[28rem] rounded-chip border border-paper/20 bg-ink px-3 py-1.5 text-paper shadow-lg"
      style={{ top, left, fontSize: "var(--text-xs)" }}
    >
      {content.kind === "parameters" &&
        content.signatures.map((signature) => (
          <Signature key={signature} signature={signature} active={content.activeParameter} />
        ))}
      {content.kind === "doc" && (
        <>
          <p className="font-mono font-semibold">{content.title}</p>
          <p className="text-paper/85">{content.body}</p>
        </>
      )}
      {content.kind === "none" && <p className="text-paper/85">{content.message}</p>}
    </div>
  );
}
