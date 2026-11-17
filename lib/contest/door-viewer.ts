import { doorFor, type Door } from "./door";
import { contestFacts } from "./practice-guest";
import { viewerFromCookies } from "./viewer";

/**
 * The door for whoever holds this request's cookie, inside a server component.
 *
 * One extra read for a competitor (the contest's `isPractice` and name); none for anybody else.
 */
export async function doorFromCookies(): Promise<Door> {
  const viewer = await viewerFromCookies();
  const contest = viewer.kind === "competitor" ? await contestFacts(viewer.contestId) : null;
  return doorFor(viewer, contest);
}
