/**
 * Port of server/app/support/meeting_costs.rb.
 *
 * A map from cast_attendance id to the four cost buckets. Entries zero-fill so
 * callers can always read `.night` etc., and `total` sums everything.
 */
export const COST_TYPES = ['base', 'prolong', 'night', 'selection'] as const;
export type CostType = (typeof COST_TYPES)[number];

export type CostInput = Partial<Record<CostType, number>>;

export class MeetingCostsEntry {
  private readonly cost: Record<CostType, number>;

  constructor(input: CostInput = {}) {
    const unknown = Object.keys(input).filter((k) => !(COST_TYPES as readonly string[]).includes(k));
    if (unknown.length) throw new Error(`invalid cost_type(s): ${unknown.join(',')}`);
    this.cost = { base: 0, prolong: 0, night: 0, selection: 0 };
    for (const type of COST_TYPES) this.cost[type] = input[type] ?? 0;
  }

  get base() { return this.cost.base; }
  get prolong() { return this.cost.prolong; }
  get night() { return this.cost.night; }
  get selection() { return this.cost.selection; }

  get(type: CostType): number {
    return this.cost[type];
  }

  get total(): number {
    return COST_TYPES.reduce((sum, type) => sum + this.cost[type], 0);
  }

  toJSON(): Record<CostType, number> & { total: number } {
    return { ...this.cost, total: this.total };
  }
}

export class MeetingCosts {
  private readonly costs = new Map<number, MeetingCostsEntry>();

  add(key: number, input: CostInput): this {
    this.costs.set(key, new MeetingCostsEntry(input));
    return this;
  }

  get(key: number): MeetingCostsEntry {
    return this.costs.get(key) ?? new MeetingCostsEntry();
  }

  has(key: number): boolean {
    return this.costs.has(key);
  }

  get entries(): MeetingCostsEntry[] {
    return [...this.costs.values()];
  }

  get total(): number {
    return this.entries.reduce((sum, entry) => sum + entry.total, 0);
  }

  toJSON(): Record<string, ReturnType<MeetingCostsEntry['toJSON']>> {
    const out: Record<string, ReturnType<MeetingCostsEntry['toJSON']>> = {};
    for (const [key, entry] of this.costs) out[String(key)] = entry.toJSON();
    return out;
  }
}
