'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { MeetingSummary } from '@/lib';
import { ADMIN_MEETING_STATUS_LABELS, l, numberToCredits } from '@/lib';
import { api } from '@/client/admin-api';
import { useAdminAction, useAdminQuery } from '@/client/admin-hooks';
import { Badge, DataTable, Field, Loading, Modal, PageTitle, Spinner } from '@/components/admin/ui';

interface MeetingDetail {
  meeting: MeetingSummary;
  calculationSettings: Record<string, unknown> | null;
  operatorMessage: string | null;
  preConversion: Record<string, unknown> | null;
  postConversion: Record<string, unknown> | null;
  reviews: Array<{ id: number; stars: number | null; comment: string | null; reviewerId: number | null; revieweeId: number | null }>;
  cast: Array<{
    id: number;
    userId: number;
    nickName: string;
    role: string;
    decisionBy: string | null;
    startTime: string | null;
    endTime: string | null;
    serviceFeePermille: number | null;
    additionalScore: number;
    leaderId: number | null;
    costs: { base: number; prolong: number; night: number; selection: number; total: number };
    earnings: number;
    creditTransaction: { id: number; chargedAmount: number | null; creditedAmount: number | null } | null;
  }>;
  totalCosts: number;
}

/** Meetings#view, plus the operator actions that drive an order's lifecycle. */
export function MeetingDetailPage(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const { run } = useAdminAction();
  const { data, isLoading, refetch } = useAdminQuery<MeetingDetail>(['admin', 'meeting', id], `/admin/meetings/${id}`);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [discount, setDiscount] = useState('');
  const [editing, setEditing] = useState<MeetingDetail['cast'][number] | null>(null);

  if (isLoading || !data) return <Loading />;
  const { meeting } = data;
  const invalidate = [['admin', 'meeting', id], ['admin', 'meetings']];

  async function act(path: string, confirmation: string, body?: unknown): Promise<void> {
    if (!window.confirm(confirmation)) return;
    await run(api.post(path, body), { invalidate, success: '処理しました' });
    await refetch();
  }

  async function applyDiscount(): Promise<void> {
    await run(api.patch(`/admin/meetings/${meeting.id}/discount`, { finalDiscount: Number(discount) }), {
      invalidate,
      success: '割引を適用しました',
    });
    await refetch();
  }

  return (
    <div>
      <PageTitle
        title={`オーダー ${meeting.id}`}
        subtitle={`${ADMIN_MEETING_STATUS_LABELS[meeting.status]} / ${meeting.category === 'individual' ? '個TOLA' : 'グループ'}`}
        actions={
          <>
            {meeting.status === 'in_progress' || meeting.status === 'finished' ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void act(`/admin/meetings/${meeting.id}/finish`, 'このオーダーを終了にしますか？')}
              >
                終了にする
              </button>
            ) : null}
            {meeting.status === 'finished' ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => void act(`/admin/meetings/${meeting.id}/complete`, '決済を実行しますか？')}
              >
                決済する
              </button>
            ) : null}
            {meeting.status === 'post_charge_fail' ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => void act(`/admin/meetings/${meeting.id}/recharge`, '再決済を実行しますか？')}
              >
                再決済する
              </button>
            ) : null}
            {!meeting.status.endsWith('_fail') && meeting.status !== 'completed' ? (
              <button type="button" className="btn-danger" onClick={() => setCancelOpen(true)}>
                キャンセル
              </button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-4">
          <h2 className="mb-2 text-[13px] font-bold">基本情報</h2>
          <dl className="space-y-1.5 text-[12px]">
            <Row label="ゲスト" value={meeting.owner ? <Link href={`/users/${meeting.owner.id}`}>{meeting.owner.nickName}</Link> : `ID ${meeting.ownerId}`} />
            <Row label="エリア" value={meeting.areaName} />
            <Row label="料金メニュー" value={meeting.castRank?.name ?? '—'} />
            <Row label="募集" value={`${l(meeting.requestStartTime)} 〜 ${l(meeting.requestEndTime)}`} />
            <Row label="予定" value={`${l(meeting.plannedStartTime)} 〜 ${l(meeting.plannedEndTime)}`} />
            <Row label="実終了" value={meeting.realEndTime ? l(meeting.realEndTime) : '—'} />
            <Row label="人数" value={`${meeting.neededPersonCount} 名${meeting.minimumPersonCount ? `（最低 ${meeting.minimumPersonCount}）` : ''}`} />
            <Row label="単価" value={`${numberToCredits(meeting.baseCostPerTime ?? 0)} / 延長 ${numberToCredits(meeting.prolongCostPerTime ?? 0)}`} />
            <Row label="匿名" value={meeting.anonymous ? 'はい' : 'いいえ'} />
            <Row label="チャット" value={meeting.conversationId ? `ID ${meeting.conversationId}` : '未作成'} />
          </dl>
        </section>

        <section className="card p-4">
          <h2 className="mb-2 text-[13px] font-bold">金額</h2>
          <dl className="space-y-1.5 text-[12px]">
            <Row label="概算（深夜込）" value={numberToCredits(meeting.estimatedCostsWithNightSurcharge)} />
            <Row label="算出合計" value={numberToCredits(data.totalCosts)} />
            <Row label="確定金額" value={meeting.finalCosts === null ? '—' : numberToCredits(meeting.finalCosts)} />
            <Row label="割引" value={numberToCredits(meeting.finalDiscount)} />
            <Row label="予約中ポイント" value={numberToCredits(meeting.frozenCredits)} />
            <Row label="事前決済" value={data.preConversion ? `変換ID ${String(data.preConversion.id)}` : '—'} />
            <Row label="事後決済" value={data.postConversion ? `変換ID ${String(data.postConversion.id)}` : '—'} />
          </dl>

          <div className="mt-3 flex items-end gap-2">
            <Field label="割引を適用（ポイント）">
              <input type="number" className="input" value={discount} onChange={(event) => setDiscount(event.target.value)} />
            </Field>
            <button type="button" className="btn-secondary" onClick={() => void applyDiscount()} disabled={!discount}>
              適用
            </button>
          </div>
        </section>

        <section className="card p-4">
          <h2 className="mb-2 text-[13px] font-bold">計算設定（凍結値）</h2>
          <pre className="overflow-x-auto rounded bg-slate-50 p-2 text-[11px] text-slate-600">
            {JSON.stringify(data.calculationSettings, null, 2)}
          </pre>
          {meeting.description ? (
            <>
              <h3 className="mb-1 mt-3 text-[13px] font-bold">ゲストのメッセージ</h3>
              <p className="whitespace-pre-wrap text-[12px]">{meeting.description}</p>
            </>
          ) : null}
          {data.operatorMessage ? (
            <>
              <h3 className="mb-1 mt-3 text-[13px] font-bold">運営メモ</h3>
              <p className="whitespace-pre-wrap text-[12px]">{data.operatorMessage}</p>
            </>
          ) : null}
        </section>
      </div>

      <section className="card mt-4">
        <h2 className="border-b border-slate-200 px-4 py-2.5 text-[13px] font-bold">キャストと内訳</h2>
        <DataTable
          rows={data.cast}
          rowKey={(row) => row.id}
          empty="キャストがいません"
          columns={[
            { header: 'キャスト', cell: (row) => <Link href={`/users/${row.userId}`}>{row.nickName}</Link> },
            {
              header: '役割',
              cell: (row) => (
                <div>
                  <Badge tone={row.role === 'attending' ? 'ok' : row.role === 'out' ? 'bad' : 'warn'}>{row.role}</Badge>
                  {row.decisionBy ? <p className="text-[11px] text-slate-400">{row.decisionBy}</p> : null}
                  {row.leaderId ? <p className="text-[11px] text-sky-600">チーム {row.leaderId}</p> : null}
                </div>
              ),
            },
            { header: '開始', cell: (row) => <span className="text-[11px]">{row.startTime ? l(row.startTime) : '—'}</span> },
            { header: '終了', cell: (row) => <span className="text-[11px]">{row.endTime ? l(row.endTime) : '—'}</span> },
            { header: '基本', className: 'text-right', cell: (row) => numberToCredits(row.costs.base) },
            { header: '延長', className: 'text-right', cell: (row) => numberToCredits(row.costs.prolong) },
            { header: '深夜', className: 'text-right', cell: (row) => numberToCredits(row.costs.night) },
            { header: '指名', className: 'text-right', cell: (row) => numberToCredits(row.costs.selection) },
            {
              header: '請求額',
              className: 'text-right',
              cell: (row) => <span className="font-semibold">{numberToCredits(row.costs.total)}</span>,
            },
            {
              header: '獲得',
              className: 'text-right',
              cell: (row) => (
                <div className="text-right">
                  <p className="font-semibold text-brand-600">{numberToCredits(row.earnings)}</p>
                  <p className="text-[11px] text-slate-400">
                    {row.serviceFeePermille === null ? '—' : `${row.serviceFeePermille / 10}%`}
                  </p>
                </div>
              ),
            },
            {
              header: '取引',
              cell: (row) =>
                row.creditTransaction ? (
                  <span className="text-[11px]">#{row.creditTransaction.id}</span>
                ) : (
                  <span className="text-[11px] text-slate-400">未作成</span>
                ),
            },
            {
              header: '',
              cell: (row) => (
                <button type="button" className="btn-secondary px-2 py-1" onClick={() => setEditing(row)}>
                  編集
                </button>
              ),
            },
          ]}
        />
        <div className="flex justify-end border-t border-slate-200 px-4 py-2.5 text-[13px]">
          <span className="mr-2 text-slate-500">合計</span>
          <span className="font-bold">{numberToCredits(data.totalCosts)}</span>
        </div>
      </section>

      {data.reviews.length ? (
        <section className="card mt-4">
          <h2 className="border-b border-slate-200 px-4 py-2.5 text-[13px] font-bold">レビュー</h2>
          <DataTable
            rows={data.reviews}
            rowKey={(row) => row.id}
            columns={[
              { header: '評価', cell: (row) => '★'.repeat(row.stars ?? 0) },
              { header: 'レビュアー', cell: (row) => (row.reviewerId ? <Link href={`/users/${row.reviewerId}`}>{row.reviewerId}</Link> : '—') },
              { header: '対象', cell: (row) => (row.revieweeId ? <Link href={`/users/${row.revieweeId}`}>{row.revieweeId}</Link> : '—') },
              { header: 'コメント', cell: (row) => <span className="whitespace-pre-wrap text-[11px]">{row.comment ?? ''}</span> },
            ]}
          />
        </section>
      ) : null}

      <CancelModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        meeting={meeting}
        onDone={() => {
          setCancelOpen(false);
          void refetch();
        }}
      />

      <EditAttendanceModal
        attendance={editing}
        onClose={() => setEditing(null)}
        onDone={() => {
          setEditing(null);
          void refetch();
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }): ReactNode {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1">{value}</dd>
    </div>
  );
}

/** CancelMeeting: optional chargeback, optional cancellation fee, who to tell. */
function CancelModal({
  open,
  onClose,
  meeting,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  meeting: MeetingSummary;
  onDone: () => void;
}): ReactNode {
  const { run } = useAdminAction();
  const [form, setForm] = useState({
    informParticipants: 'all' as 'nobody' | 'all' | 'owner' | 'cast',
    chargeBack: true,
    cancelFee: '0',
    errorMessage: '',
  });
  const [saving, setSaving] = useState(false);

  // The suggested fees: a share of base price × planned time × needed cast,
  // without the night or designation surcharges.
  const fullFee =
    ((meeting.baseCostPerTime ?? 0) * meeting.plannedLengthMinutes * meeting.neededPersonCount) / 30;
  const suggestedFees = [10, 50, 100].map((percent) => ({
    percent,
    fee: Math.floor((fullFee * percent) / 100),
  }));

  async function submit(): Promise<void> {
    setSaving(true);
    await run(
      api.post(`/admin/meetings/${meeting.id}/cancel`, {
        informParticipants: form.informParticipants,
        chargeBack: form.chargeBack,
        cancelFee: Number(form.cancelFee),
        errorMessage: form.errorMessage || undefined,
      }),
      { success: 'キャンセルしました' },
    );
    setSaving(false);
    onDone();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="オーダーをキャンセル"
      footer={
        <button type="button" className="btn-danger w-full" onClick={() => void submit()} disabled={saving}>
          {saving ? <Spinner /> : null}
          キャンセルを実行する
        </button>
      }
    >
      <div className="space-y-3">
        <Field label="通知先">
          <select
            className="input"
            value={form.informParticipants}
            onChange={(event) => setForm({ ...form, informParticipants: event.target.value as typeof form.informParticipants })}
          >
            <option value="all">全員</option>
            <option value="owner">ゲストのみ</option>
            <option value="cast">キャストのみ</option>
            <option value="nobody">通知しない</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={form.chargeBack}
            onChange={(event) => setForm({ ...form, chargeBack: event.target.checked })}
          />
          事前決済をチャージバックする
        </label>
        <Field label="キャンセル料（ポイント）" hint="0 なら徴収しません">
          <input
            type="number"
            className="input"
            value={form.cancelFee}
            onChange={(event) => setForm({ ...form, cancelFee: event.target.value })}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestedFees.map(({ percent, fee }) => (
              <button
                key={percent}
                type="button"
                className="btn-secondary px-2 py-1 text-[12px]"
                onClick={() => setForm({ ...form, cancelFee: String(fee) })}
              >
                {percent}%（{numberToCredits(fee)}）
              </button>
            ))}
          </div>
        </Field>
        <Field label="通知文" hint="空欄なら既定の文面を送ります">
          <textarea
            className="input min-h-24"
            value={form.errorMessage}
            onChange={(event) => setForm({ ...form, errorMessage: event.target.value })}
          />
        </Field>
      </div>
    </Modal>
  );
}

/** Correcting the recorded times, which changes what the order bills. */
function EditAttendanceModal({
  attendance,
  onClose,
  onDone,
}: {
  attendance: MeetingDetail['cast'][number] | null;
  onClose: () => void;
  onDone: () => void;
}): ReactNode {
  const { run } = useAdminAction();
  const [form, setForm] = useState({
    startTime: attendance?.startTime?.slice(0, 16) ?? '',
    endTime: attendance?.endTime?.slice(0, 16) ?? '',
    role: attendance?.role ?? 'attending',
    serviceFeePermille: attendance?.serviceFeePermille === null ? '' : String(attendance?.serviceFeePermille ?? ''),
    additionalScore: String(attendance?.additionalScore ?? 0),
  });
  const [saving, setSaving] = useState(false);

  if (!attendance) return null;
  // bound to a const so the null-narrowing above survives into the closure
  const row = attendance;

  async function submit(): Promise<void> {
    setSaving(true);
    await run(
      api.patch(`/admin/cast_attendances/${row.id}`, {
        startTime: form.startTime ? new Date(form.startTime).toISOString() : null,
        endTime: form.endTime ? new Date(form.endTime).toISOString() : null,
        role: form.role,
        serviceFeePermille: form.serviceFeePermille === '' ? null : Number(form.serviceFeePermille),
        additionalScore: Number(form.additionalScore),
      }),
      { success: '更新しました' },
    );
    setSaving(false);
    onDone();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${attendance.nickName} の参加記録`}
      footer={
        <button type="button" className="btn-primary w-full" onClick={() => void submit()} disabled={saving}>
          {saving ? <Spinner /> : null}
          保存する
        </button>
      }
    >
      <p className="mb-3 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
        開始・終了時刻を変更すると請求額と獲得ポイントが変わります。決済後に変更した場合は再計算が必要です。
      </p>
      <div className="space-y-3">
        <Field label="開始時刻">
          <input
            type="datetime-local"
            className="input"
            value={form.startTime}
            onChange={(event) => setForm({ ...form, startTime: event.target.value })}
          />
        </Field>
        <Field label="終了時刻">
          <input
            type="datetime-local"
            className="input"
            value={form.endTime}
            onChange={(event) => setForm({ ...form, endTime: event.target.value })}
          />
        </Field>
        <Field label="役割">
          <select className="input" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
            <option value="attending">attending</option>
            <option value="unconfirmed">unconfirmed</option>
            <option value="requested">requested</option>
            <option value="out">out</option>
          </select>
        </Field>
        <Field label="バック率（パーミル）" hint="このオーダーに適用される率です">
          <input
            type="number"
            className="input"
            value={form.serviceFeePermille}
            onChange={(event) => setForm({ ...form, serviceFeePermille: event.target.value })}
          />
        </Field>
        <Field label="マッチング加点">
          <input
            type="number"
            className="input"
            value={form.additionalScore}
            onChange={(event) => setForm({ ...form, additionalScore: event.target.value })}
          />
        </Field>
      </div>
    </Modal>
  );
}
