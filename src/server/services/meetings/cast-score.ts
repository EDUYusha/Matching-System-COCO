/**
 * Port of AutoSelectCast::CastScore.
 *
 * Scores candidate cast and picks the best set. Cast who signed up together form
 * a team (all sharing one leader_id) and must be taken or dropped as a unit, so
 * the selection is not simply "top N by score": it searches the combinations of
 * whole teams whose sizes add up to exactly the number of people still needed.
 */

export interface ScoredAttendance {
  id: number;
  userId: number;
  leaderId: number | null;
  additionalScore: number;
}

interface TeamScore {
  score: number;
  teamSize: number;
}

export class CastScore {
  readonly pendingCast: ScoredAttendance[];
  readonly targetCount: number;
  private readonly scores = new Map<number, number>();
  private readonly teamScores = new Map<number, TeamScore>();

  constructor(pendingCast: ScoredAttendance[], targetCount: number) {
    this.pendingCast = pendingCast;
    this.targetCount = targetCount;

    for (const attendance of pendingCast) this.scores.set(attendance.id, 0);

    for (const attendance of pendingCast) {
      // only leaders and solo entrants head a team
      if (this.isFollower(attendance)) continue;
      const teamSize = this.isIndividual(attendance)
        ? 1
        : pendingCast.filter((candidate) => candidate.leaderId === attendance.leaderId).length;
      this.teamScores.set(attendance.id, { score: 0, teamSize });
    }
  }

  /** CastAttendance#individual? — no leader means they joined alone. */
  private isIndividual(attendance: ScoredAttendance): boolean {
    return attendance.leaderId === null;
  }

  /** CastAttendance#follower? */
  private isFollower(attendance: ScoredAttendance): boolean {
    return attendance.leaderId !== null && attendance.leaderId !== attendance.id;
  }

  add(attendance: ScoredAttendance, score: number): void {
    this.scores.set(attendance.id, (this.scores.get(attendance.id) ?? 0) + score);
    const teamId = attendance.leaderId ?? attendance.id;
    const team = this.teamScores.get(teamId);
    if (team) team.score += score;
  }

  /** The chosen attendance ids. */
  finalCastIds(): number[] {
    // no teams in play: plain sort by score
    if (this.scores.size === this.teamScores.size) {
      return [...this.scores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, this.targetCount)
        .map(([id]) => id);
    }

    let bestCombination: number[] = [];
    let bestScore = Number.NEGATIVE_INFINITY;
    const teamKeys = [...this.teamScores.keys()];

    // prefer fewer, larger teams: the original counts down from target_count
    for (let size = this.targetCount; size >= 1; size -= 1) {
      for (const combination of combinations(teamKeys, size)) {
        const totalSize = combination.reduce((sum, key) => sum + (this.teamScores.get(key)?.teamSize ?? 0), 0);
        if (totalSize !== this.targetCount) continue;
        const score = combination.reduce((sum, key) => sum + (this.teamScores.get(key)?.score ?? 0), 0);
        if (score > bestScore) {
          bestScore = score;
          bestCombination = combination;
        }
      }
    }

    const chosen = new Set(bestCombination);
    return this.pendingCast
      .filter((attendance) => (attendance.leaderId !== null && chosen.has(attendance.leaderId)) || chosen.has(attendance.id))
      .map((attendance) => attendance.id);
  }

  totalScoreFor(ids: number[]): number {
    return ids.reduce((sum, id) => sum + (this.scores.get(id) ?? 0), 0);
  }

  scoreOf(id: number): number {
    return this.scores.get(id) ?? 0;
  }
}

/** Ruby's Array#combination(k), as a generator. */
export function* combinations<T>(items: T[], k: number): Generator<T[]> {
  if (k < 0 || k > items.length) return;
  if (k === 0) {
    yield [];
    return;
  }
  const indices = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield indices.map((i) => items[i]);
    let i = k - 1;
    while (i >= 0 && indices[i] === i + items.length - k) i -= 1;
    if (i < 0) return;
    indices[i] += 1;
    for (let j = i + 1; j < k; j += 1) indices[j] = indices[j - 1] + 1;
  }
}
