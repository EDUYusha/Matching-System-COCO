'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MeetingPreferenceDto, MeetingSummary } from '@/lib';
import { config } from '@/lib';
import { formatDurationMinutes, l, numberToCredits } from '@/client/format';
import { api, ApiRequestError } from '@/client/api';
import { useAction, useApiQuery } from '@/client/hooks';
import { useAppStore, useCurrentUser } from '@/client/store';
import { Field, PageHeader, PageLoading, Spinner } from '@/components/ui';
import { MeetingDetails } from '@/components/MeetingCard';

interface OrderOptions {
  businessAreas: Array<{ id: number; name: string; color: string }>;
  selectedBusinessAreaId: number;
  areas: Array<{ id: number; name: string; businessAreaId: number; custom: boolean }>;
  castRanks: Array<{
    id: number;
    name: string;
    baseCostPerTime: number;
    prolongCostPerTime: number;
    proposedPrice: boolean;
    fixedPrice: boolean;
  }>;
  meetingPreferences: MeetingPreferenceDto[];
  minMeetingDelay: number;
  costTimeInterval: number;
}

/**
 * MeetingsController#new / #confirm / #create — the group order wizard.
 *
 * Three steps, as the original had: the form, the price confirmation
 * (`#confirm` prices it without persisting), then creation.
 */
export function OrderWizardPage(): ReactNode {
  const user = useCurrentUser();
  const pushToast = useAppStore((state) => state.pushToast);
  const { run } = useAction();

  const [businessAreaId, setBusinessAreaId] = useState<number | null>(null);
  const { data: options, isLoading } = useApiQuery<OrderOptions>(
    ['meetings', 'new', businessAreaId],
    `/meetings/new${businessAreaId ? `?businessAreaId=${businessAreaId}` : ''}`,
  );

  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [preview, setPreview] = useState<MeetingSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const [form, setForm] = useState({
    areaId: '',
    areaName: '',
    castRankId: '',
    neededPersonCount: '2',
    minimumPersonCount: '',
    timeSpan: '120',
    startMode: 'delay' as 'delay' | 'absolute',
    startTimeDelay: String(config.min_meeting_delay),
    startTime: '',
    proposedPrice: '',
    description: '',
    anonymous: false,
    meetingPrefs: [] as number[],
  });

  useEffect(() => {
    if (!options) return;
    setBusinessAreaId((current) => current ?? options.selectedBusinessAreaId);
    setForm((current) => ({
      ...current,
      areaId: current.areaId || String(options.areas[0]?.id ?? ''),
      castRankId: current.castRankId || String(options.castRanks[0]?.id ?? ''),
    }));
  }, [options]);

  const selectedRank = options?.castRanks.find((rank) => String(rank.id) === form.castRankId);
  const selectedArea = options?.areas.find((area) => String(area.id) === form.areaId);

  /** Mirrors Meeting#estimated_costs so the form can price itself live. */
  const localEstimate = useMemo(() => {
    if (!selectedRank) return 0;
    const people = Number(form.neededPersonCount) || 0;
    const base = form.proposedPrice ? Number(form.proposedPrice) : selectedRank.baseCostPerTime;
    if (selectedRank.fixedPrice) return people * base;
    const intervals = Math.floor(Math.floor(Number(form.timeSpan) || 0) / (options?.costTimeInterval ?? 30));
    return people * base * intervals;
  }, [selectedRank, form.neededPersonCount, form.proposedPrice, form.timeSpan, options?.costTimeInterval]);

  if (isLoading) return <PageLoading />;

  function payload(): Record<string, unknown> {
    return {
      businessAreaId: businessAreaId ?? options?.selectedBusinessAreaId,
      areaId: Number(form.areaId),
      // a "custom" area lets the guest type a place of their own
      areaName: selectedArea?.custom ? form.areaName : (selectedArea?.name ?? ''),
      neededPersonCount: Number(form.neededPersonCount),
      minimumPersonCount: form.minimumPersonCount ? Number(form.minimumPersonCount) : null,
      castRankId: Number(form.castRankId),
      timeSpan: Number(form.timeSpan),
      ...(form.startMode === 'delay'
        ? { startTimeDelay: Number(form.startTimeDelay) }
        : { startTime: form.startTime ? new Date(form.startTime).toISOString() : null }),
      ...(selectedRank?.proposedPrice && form.proposedPrice ? { proposedPrice: Number(form.proposedPrice) } : {}),
      description: form.description,
      anonymous: form.anonymous,
      meetingPrefs: form.meetingPrefs,
    };
  }

  async function confirm(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});
    try {
      const result = await api.post<{ meeting: MeetingSummary }>('/meetings/confirm', payload());
      setPreview(result.meeting);
      setStep('confirm');
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrors(error.details ?? {});
        pushToast(error.flash ?? { type: 'alert', message: error.message });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function create(): Promise<void> {
    setSubmitting(true);
    await run(api.post<{ redirect: string }>('/meetings', payload()), {
      invalidate: [['meetings'], ['conversations'], ['me']],
    });
    setSubmitting(false);
  }

  if (step === 'confirm' && preview) {
    return (
      <div>
        <PageHeader title="オーダー内容の確認" back="/home" />
        <MeetingDetails meeting={preview} />

        <div className="px-4 py-4 text-[11px] leading-relaxed text-ink-500">
          <p>・キャストが集まり次第、お好みのキャストを選択いただけます。</p>
          <p>・募集締切までに集まらない場合はキャンセルとなります。</p>
          <p>・リクエスト確定後のキャンセルはお受けできません。</p>
          <p>
            ・お手持ちのポイント {numberToCredits(user?.creditBalance ?? 0)}
            {(user?.creditBalance ?? 0) < preview.estimatedCostsWithNightSurcharge
              ? '（不足分はご登録のカードから自動チャージされます）'
              : ''}
          </p>
        </div>

        <div className="flex gap-2 px-4 pb-8">
          <button type="button" className="btn-secondary flex-1" onClick={() => setStep('form')} disabled={submitting}>
            修正する
          </button>
          <button type="button" className="btn-primary flex-1" onClick={() => void create()} disabled={submitting}>
            {submitting ? <Spinner /> : null}
            確定する
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="グループTOLAをオーダー" back="/home" />
      <form onSubmit={confirm} className="space-y-4 px-4 py-4 pb-10">
        {options && options.businessAreas.length > 1 ? (
          <Field label="支店">
            <select
              className="input"
              value={String(businessAreaId ?? '')}
              onChange={(event) => {
                setBusinessAreaId(Number(event.target.value));
                setForm((current) => ({ ...current, areaId: '', castRankId: '' }));
              }}
            >
              {options.businessAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <Field label="エリア" error={errors.area_id}>
          <select
            className="input"
            value={form.areaId}
            onChange={(event) => setForm({ ...form, areaId: event.target.value })}
            required
          >
            {options?.areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
        </Field>

        {selectedArea?.custom ? (
          <Field label="待ち合わせ場所" hint="お店の名前など">
            <input
              className="input"
              value={form.areaName}
              onChange={(event) => setForm({ ...form, areaName: event.target.value })}
              required
            />
          </Field>
        ) : null}

        <Field label="料金メニュー" error={errors.cast_rank_id}>
          <select
            className="input"
            value={form.castRankId}
            onChange={(event) => setForm({ ...form, castRankId: event.target.value, proposedPrice: '' })}
            required
          >
            {options?.castRanks.map((rank) => (
              <option key={rank.id} value={rank.id}>
                {rank.name}（
                {rank.fixedPrice
                  ? `${numberToCredits(rank.baseCostPerTime)} 固定`
                  : `${numberToCredits(rank.baseCostPerTime)} / ${options.costTimeInterval}分`}
                ）
              </option>
            ))}
          </select>
        </Field>

        {selectedRank?.proposedPrice ? (
          <Field
            label="提案価格"
            error={errors.proposed_price}
            hint={`最低 ${numberToCredits(selectedRank.baseCostPerTime)} から指定できます`}
          >
            <input
              type="number"
              min={selectedRank.baseCostPerTime}
              step={500}
              className="input"
              value={form.proposedPrice}
              onChange={(event) => setForm({ ...form, proposedPrice: event.target.value })}
            />
          </Field>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="募集人数" error={errors.needed_person_count}>
            <select
              className="input"
              value={form.neededPersonCount}
              onChange={(event) => setForm({ ...form, neededPersonCount: event.target.value })}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((count) => (
                <option key={count} value={count}>
                  {count}名
                </option>
              ))}
            </select>
          </Field>

          {config.minimal_cast_selection ? (
            <Field label="最低人数" error={errors.minimum_person_count} hint="未指定なら募集人数と同じ">
              <select
                className="input"
                value={form.minimumPersonCount}
                onChange={(event) => setForm({ ...form, minimumPersonCount: event.target.value })}
              >
                <option value="">指定なし</option>
                {Array.from({ length: Number(form.neededPersonCount) }, (_, index) => index + 1).map((count) => (
                  <option key={count} value={count}>
                    {count}名
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>

        <Field label="実施時間" error={errors.time_span}>
          <select
            className="input"
            value={form.timeSpan}
            onChange={(event) => setForm({ ...form, timeSpan: event.target.value })}
          >
            {[60, 90, 120, 150, 180, 240, 300, 360].map((minutes) => (
              <option key={minutes} value={minutes}>
                {formatDurationMinutes(minutes)}
              </option>
            ))}
          </select>
        </Field>

        <div>
          <span className="label">開始時刻</span>
          <div className="mb-2 flex gap-2">
            <button
              type="button"
              className={`badge flex-1 py-2 ${form.startMode === 'delay' ? 'bg-brand-500 text-white' : 'border border-ink-300 bg-white text-ink-700'}`}
              onClick={() => setForm({ ...form, startMode: 'delay' })}
            >
              今から
            </button>
            <button
              type="button"
              className={`badge flex-1 py-2 ${form.startMode === 'absolute' ? 'bg-brand-500 text-white' : 'border border-ink-300 bg-white text-ink-700'}`}
              onClick={() => setForm({ ...form, startMode: 'absolute' })}
            >
              日時を指定
            </button>
          </div>

          {form.startMode === 'delay' ? (
            <select
              className="input"
              value={form.startTimeDelay}
              onChange={(event) => setForm({ ...form, startTimeDelay: event.target.value })}
            >
              {[30, 40, 50, 60, 75, 90, 105, 120].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes}分後
                </option>
              ))}
            </select>
          ) : (
            <input
              type="datetime-local"
              className="input"
              value={form.startTime}
              onChange={(event) => setForm({ ...form, startTime: event.target.value })}
              required
            />
          )}
          {errors.start_time_delay?.length ? (
            <span className="mt-1 block text-[11px] text-red-600">{errors.start_time_delay.join(' ')}</span>
          ) : null}
          {errors.start_time?.length ? (
            <span className="mt-1 block text-[11px] text-red-600">{errors.start_time.join(' ')}</span>
          ) : null}
          <span className="mt-1 block text-[11px] text-ink-500">
            最短 {options?.minMeetingDelay ?? config.min_meeting_delay} 分後から指定できます
          </span>
        </div>

        {options?.meetingPreferences.length ? (
          <div>
            <span className="label">ご希望（マッチングに使用します）</span>
            <div className="flex flex-wrap gap-2">
              {options.meetingPreferences.map((preference) => {
                const active = form.meetingPrefs.includes(preference.id);
                return (
                  <button
                    key={preference.id}
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        meetingPrefs: active
                          ? form.meetingPrefs.filter((id) => id !== preference.id)
                          : [...form.meetingPrefs, preference.id],
                      })
                    }
                    className={`badge px-2.5 py-1.5 ${active ? 'bg-brand-500 text-white' : 'border border-ink-300 bg-white text-ink-700'}`}
                  >
                    {preference.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <Field label="キャストへのメッセージ（任意）">
          <textarea
            className="input min-h-24"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.anonymous}
            onChange={(event) => setForm({ ...form, anonymous: event.target.checked })}
          />
          匿名でオーダーする
        </label>

        <div className="card border-brand-300 bg-brand-50">
          <p className="text-xs text-ink-700">
            概算料金 <span className="text-base font-bold text-brand-700">{numberToCredits(localEstimate)}</span>
          </p>
          <p className="mt-0.5 text-[10px] text-ink-500">
            深夜（{config.night_interval.start}〜{config.night_interval.end}）にかかる場合は深夜手当
            {numberToCredits(config.night_surcharge)}／人が加算されます
          </p>
        </div>

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? <Spinner /> : null}
          内容を確認する
        </button>
      </form>
    </div>
  );
}

export { l };
