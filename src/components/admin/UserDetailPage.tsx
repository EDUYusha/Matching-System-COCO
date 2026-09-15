'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ADMIN_MEETING_STATUS_LABELS, l, numberToCredits, type MeetingStatus } from '@/lib';
import { api } from '@/client/admin-api';
import { useAdminAction, useAdminQuery } from '@/client/admin-hooks';
import { Badge, DataTable, Field, Loading, Modal, PageTitle, Spinner } from '@/components/admin/ui';

interface Options {
  businessAreas: Array<{ id: number; name: string }>;
  castLevels: Array<{ id: number; name: string }>;
  customerLevels: Array<{ id: number; name: string }>;
  trophies: Array<{ id: number; name: string }>;
  accessLevels: string[];
  userTypes: string[];
}

interface UserDetail {
  user: Record<string, unknown> & {
    id: number;
    nickName: string;
    realName: string | null;
    email: string | null;
    phone: string | null;
    userType: string;
    accessLevel: string;
    creditBalance: number;
    frozenCredits: number;
    serviceFeePermille: number | null;
    orderFeePerTime: number | null;
    firstExperienceRewardPermille: number;
    meetingRankingCheat: number;
    stickerRankingCheat: number;
    additionalScore: number;
    individualRepeatCount: number;
    guestTitle: string | null;
    businessAreaId: number | null;
    castLevelId: number | null;
    customerLevelId: number | null;
    discardedAt: string | null;
    adSource: string | null;
    snsId: string | null;
    publicProfile: boolean;
    motto: string | null;
    inviter: { id: number; nickName: string; userType: string } | null;
    firstPrivatelyMetUserId: number | null;
    firstPrivatelyMetAt: string | null;
    profilePicUrl: string;
  };
  settings: Record<string, unknown> | null;
  bankAccount: Record<string, string> | null;
  creditCard: Record<string, unknown> | null;
  accessRequest: { uploadedPicture: string | null; interview: boolean } | null;
  attributes: Array<{ id: number; name: string; value: string | null; valueType: string | null; category: string }>;
  assessments: Array<{ id: number; name: string; value: string }>;
  trophies: Array<{ id: number; name: string; imageUrl: string }>;
  payoutRequests: Array<Record<string, unknown> & { id: number; status: string; netAmount: number; creditAmount: number }>;
  meetings: Array<{ id: number; status: MeetingStatus; areaName: string; plannedStartTime: string; finalCosts: number | null }>;
  transactions: Array<{
    id: number;
    category: string;
    chargedAmount: number | null;
    creditedAmount: number | null;
    reason: string | null;
    createdAt: string;
  }>;
  notes: Array<{ id: number; content: string | null; createdAt: string; adminName: string | null }>;
  reviews: Array<{ id: number; stars: number | null; comment: string | null; reviewer: { id: number; nickName: string } | null }>;
}

/** Users#view plus the per-user actions the PHP admin offered. */
export function UserDetailPage(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const { run } = useAdminAction();
  const { data, isLoading, refetch } = useAdminQuery<UserDetail>(['admin', 'user', id], `/admin/users/${id}`);
  const { data: options } = useAdminQuery<Options>(['admin', 'options'], '/admin/options');

  const [editOpen, setEditOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [noteContent, setNoteContent] = useState('');

  if (isLoading || !data) return <Loading />;
  const user = data.user;
  const invalidate = [['admin', 'user', id]];

  async function freeze(): Promise<void> {
    if (!window.confirm('このアカウントを凍結しますか？ ログインできなくなります。')) return;
    await run(api.post(`/admin/users/${user.id}/freeze`), { invalidate, success: '凍結しました' });
    await refetch();
  }

  async function unfreeze(): Promise<void> {
    await run(api.post(`/admin/users/${user.id}/unfreeze`), { invalidate, success: '凍結を解除しました' });
    await refetch();
  }

  async function withdraw(): Promise<void> {
    if (!window.confirm('このアカウントを退会にしますか？ メールアドレスとLINE連携は無効になります。復元は「復元」から可能です。')) return;
    await run(api.delete(`/admin/users/${user.id}`), { invalidate, success: '退会にしました' });
    await refetch();
  }

  async function restore(): Promise<void> {
    const result = await run(
      api.post<{ credentials: { email: string; password: string } }>(`/admin/users/${user.id}/restore`),
      { invalidate },
    );
    if (result) {
      window.alert(`復元しました。\nメール: ${result.credentials.email}\nパスワード: ${result.credentials.password}`);
    }
    await refetch();
  }

  async function addNote(): Promise<void> {
    if (!noteContent.trim()) return;
    await run(api.post(`/admin/users/${user.id}/notes`, { content: noteContent }), {
      invalidate,
      success: 'メモを追加しました',
    });
    setNoteContent('');
    await refetch();
  }

  async function toggleTrophy(trophyId: number, has: boolean): Promise<void> {
    await run(
      has
        ? api.delete(`/admin/users/${user.id}/trophies/${trophyId}`)
        : api.post(`/admin/users/${user.id}/trophies/${trophyId}`),
      { invalidate },
    );
    await refetch();
  }

  return (
    <div>
      <PageTitle
        title={`${user.nickName} (ID ${user.id})`}
        subtitle={`${user.userType} / ${user.accessLevel}`}
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => setEditOpen(true)}>
              編集
            </button>
            <button type="button" className="btn-secondary" onClick={() => setCreditsOpen(true)}>
              ポイント付与・減算
            </button>
            {/* 退会 sets ceased (undone by 復元); 凍結 only sets discarded_at (undone by 凍結解除) */}
            {user.accessLevel === 'ceased' ? (
              <button type="button" className="btn-secondary" onClick={() => void restore()}>
                復元
              </button>
            ) : user.discardedAt ? (
              <button type="button" className="btn-secondary" onClick={() => void unfreeze()}>
                凍結解除
              </button>
            ) : (
              <>
                <button type="button" className="btn-secondary" onClick={() => void freeze()}>
                  凍結
                </button>
                <button type="button" className="btn-danger" onClick={() => void withdraw()}>
                  退会
                </button>
              </>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-4">
          <div className="flex items-center gap-3">
            <img
              src={user.profilePicUrl?.trim() ? user.profilePicUrl : '/system/noimage.png'}
              alt=""
              onError={(event) => {
                const image = event.currentTarget;
                if (!image.src.endsWith('/system/noimage.png')) image.src = '/system/noimage.png';
              }}
              className="h-16 w-16 rounded-full border border-slate-200 object-cover"
            />
            <div className="min-w-0">
              <p className="font-semibold">{user.nickName}</p>
              <p className="text-[11px] text-slate-500">{user.realName ?? '本名未登録'}</p>
              {user.accessLevel === 'ceased' ? (
                <Badge tone="bad">退会済み</Badge>
              ) : user.discardedAt ? (
                <Badge tone="bad">凍結中</Badge>
              ) : null}
            </div>
          </div>

          <dl className="mt-4 space-y-1.5 text-[12px]">
            <Row label="メール" value={user.email ?? '—'} />
            <Row label="電話" value={user.phone ?? '—'} />
            <Row label="LINE" value={user.snsId ? '連携済み' : '未連携'} />
            <Row label="保有ポイント" value={numberToCredits(user.creditBalance)} />
            <Row label="予約中" value={numberToCredits(user.frozenCredits)} />
            <Row label="バック率" value={user.serviceFeePermille === null ? '—' : `${user.serviceFeePermille / 10}%`} />
            <Row label="個TOLA料金" value={user.orderFeePerTime === null ? '—' : numberToCredits(user.orderFeePerTime)} />
            <Row label="初個TOLAバック" value={`${user.firstExperienceRewardPermille / 10}%`} />
            <Row label="ランキング加点" value={`合流 ${user.meetingRankingCheat} / ギフト ${user.stickerRankingCheat}`} />
            <Row label="マッチング加点" value={String(user.additionalScore)} />
            <Row label="個TOLAリピート" value={`${user.individualRepeatCount} 回`} />
            <Row label="称号" value={user.guestTitle ?? '—'} />
            <Row
              label="紹介者"
              value={user.inviter ? `${user.inviter.nickName} (ID ${user.inviter.id})` : '—'}
            />
            <Row
              label="師匠"
              value={
                user.firstPrivatelyMetUserId
                  ? `ID ${user.firstPrivatelyMetUserId}${user.firstPrivatelyMetAt ? `（${l(user.firstPrivatelyMetAt)}）` : '（解除済み）'}`
                  : '—'
              }
            />
            <Row label="流入元" value={user.adSource ?? '—'} />
          </dl>
        </section>

        <section className="card p-4">
          <h2 className="mb-2 text-[13px] font-bold">本登録・支払い</h2>
          <dl className="space-y-1.5 text-[12px]">
            <Row label="登録状況" value={user.accessLevel} />
            <Row
              label="身分証"
              value={
                data.accessRequest?.uploadedPicture ? (
                  <a href={`/api/admin/access_requests/${user.id}/picture`} target="_blank" rel="noopener noreferrer">
                    画像を見る
                  </a>
                ) : (
                  '未提出'
                )
              }
            />
            <Row label="面接希望" value={data.accessRequest?.interview ? 'あり' : 'なし'} />
            <Row
              label="カード"
              value={
                data.creditCard
                  ? `${String(data.creditCard.maskedCardNumber ?? '')} (${String(data.creditCard.status)})`
                  : '未登録'
              }
            />
            <Row
              label="振込先"
              value={
                data.bankAccount
                  ? `${data.bankAccount.bankName} ${data.bankAccount.branchName} ${data.bankAccount.accountNumber}`
                  : '未登録'
              }
            />
          </dl>

          <h3 className="mb-2 mt-4 text-[13px] font-bold">トロフィー</h3>
          <div className="flex flex-wrap gap-1.5">
            {options?.trophies.map((trophy) => {
              const has = data.trophies.some((candidate) => candidate.id === trophy.id);
              return (
                <button
                  key={trophy.id}
                  type="button"
                  onClick={() => void toggleTrophy(trophy.id, has)}
                  className={`badge ${has ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'}`}
                >
                  {trophy.name}
                </button>
              );
            })}
          </div>
        </section>

        <section className="card p-4">
          <h2 className="mb-2 text-[13px] font-bold">運営メモ</h2>
          <div className="space-y-2">
            <textarea
              className="input min-h-20"
              placeholder="メモを入力"
              value={noteContent}
              onChange={(event) => setNoteContent(event.target.value)}
            />
            <button type="button" className="btn-primary w-full" onClick={() => void addNote()}>
              メモを追加
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {data.notes.map((note) => (
              <li key={note.id} className="rounded border border-slate-200 p-2 text-[12px]">
                <p className="whitespace-pre-wrap">{note.content}</p>
                <p className="mt-1 text-[10px] text-slate-400">
                  {note.adminName ?? '不明'} ・ {l(note.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card mt-4">
        <h2 className="border-b border-slate-200 px-4 py-2.5 text-[13px] font-bold">プロフィール項目</h2>
        <AttributesEditor userId={user.id} attributes={data.attributes} onSaved={() => void refetch()} />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="border-b border-slate-200 px-4 py-2.5 text-[13px] font-bold">直近のオーダー</h2>
          <DataTable
            rows={data.meetings}
            rowKey={(row) => row.id}
            empty="オーダーはありません"
            columns={[
              { header: 'ID', cell: (row) => <Link href={`/meetings/${row.id}`}>{row.id}</Link> },
              { header: '状態', cell: (row) => ADMIN_MEETING_STATUS_LABELS[row.status] },
              { header: 'エリア', cell: (row) => row.areaName },
              { header: '開始', cell: (row) => l(row.plannedStartTime) },
              {
                header: '金額',
                className: 'text-right',
                cell: (row) => (row.finalCosts === null ? '—' : numberToCredits(row.finalCosts)),
              },
            ]}
          />
        </section>

        <section className="card">
          <h2 className="border-b border-slate-200 px-4 py-2.5 text-[13px] font-bold">直近のポイント取引</h2>
          <DataTable
            rows={data.transactions}
            rowKey={(row) => row.id}
            empty="取引はありません"
            columns={[
              { header: '種別', cell: (row) => row.category },
              {
                header: '増減',
                className: 'text-right',
                cell: (row) => (
                  <span className={row.creditedAmount ? 'text-emerald-600' : 'text-rose-600'}>
                    {row.creditedAmount
                      ? `+${numberToCredits(row.creditedAmount)}`
                      : `−${numberToCredits(row.chargedAmount ?? 0)}`}
                  </span>
                ),
              },
              { header: '理由', cell: (row) => <span className="text-[11px]">{row.reason ?? ''}</span> },
              { header: '日時', cell: (row) => <span className="text-[11px]">{l(row.createdAt)}</span> },
            ]}
          />
        </section>
      </div>

      <section className="card mt-4">
        <h2 className="border-b border-slate-200 px-4 py-2.5 text-[13px] font-bold">受け取ったレビュー</h2>
        <DataTable
          rows={data.reviews}
          rowKey={(row) => row.id}
          empty="レビューはありません"
          columns={[
            { header: '評価', cell: (row) => '★'.repeat(row.stars ?? 0) },
            { header: 'レビュアー', cell: (row) => (row.reviewer ? <Link href={`/users/${row.reviewer.id}`}>{row.reviewer.nickName}</Link> : '—') },
            { header: 'コメント', cell: (row) => <span className="whitespace-pre-wrap text-[11px]">{row.comment ?? ''}</span> },
          ]}
        />
      </section>

      <EditUserModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        user={user}
        options={options}
        onSaved={() => {
          setEditOpen(false);
          void refetch();
        }}
      />

      <GrantCreditsModal
        open={creditsOpen}
        onClose={() => setCreditsOpen(false)}
        userId={user.id}
        onSaved={() => {
          setCreditsOpen(false);
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

function AttributesEditor({
  userId,
  attributes,
  onSaved,
}: {
  userId: number;
  attributes: UserDetail['attributes'];
  onSaved: () => void;
}): ReactNode {
  const { run } = useAdminAction();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(attributes.map((attribute) => [attribute.name, attribute.value ?? ''])),
  );
  const [saving, setSaving] = useState(false);

  async function save(): Promise<void> {
    setSaving(true);
    await run(api.patch(`/admin/users/${userId}/attributes`, { entries: values }), {
      success: 'プロフィール項目を更新しました',
    });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="p-4">
      <div className="grid gap-3 md:grid-cols-3">
        {attributes.map((attribute) => (
          <Field key={attribute.id} label={`${attribute.category} / ${attribute.name}`}>
            {attribute.valueType === 'Text' ? (
              <textarea
                className="input min-h-20"
                value={values[attribute.name] ?? ''}
                onChange={(event) => setValues({ ...values, [attribute.name]: event.target.value })}
              />
            ) : (
              <input
                className="input"
                value={values[attribute.name] ?? ''}
                onChange={(event) => setValues({ ...values, [attribute.name]: event.target.value })}
              />
            )}
          </Field>
        ))}
      </div>
      <button type="button" className="btn-primary mt-3" onClick={() => void save()} disabled={saving}>
        {saving ? <Spinner /> : null}
        プロフィール項目を保存
      </button>
    </div>
  );
}

function EditUserModal({
  open,
  onClose,
  user,
  options,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  user: UserDetail['user'];
  options: Options | undefined;
  onSaved: () => void;
}): ReactNode {
  const { run } = useAdminAction();
  const [form, setForm] = useState({
    nickName: user.nickName,
    realName: user.realName ?? '',
    email: user.email ?? '',
    phone: user.phone ?? '',
    userType: user.userType,
    accessLevel: user.accessLevel,
    businessAreaId: user.businessAreaId === null ? '' : String(user.businessAreaId),
    castLevelId: user.castLevelId === null ? '' : String(user.castLevelId),
    customerLevelId: user.customerLevelId === null ? '' : String(user.customerLevelId),
    serviceFeePermille: user.serviceFeePermille === null ? '' : String(user.serviceFeePermille),
    orderFeePerTime: user.orderFeePerTime === null ? '' : String(user.orderFeePerTime),
    firstExperienceRewardPermille: String(user.firstExperienceRewardPermille),
    meetingRankingCheat: String(user.meetingRankingCheat),
    stickerRankingCheat: String(user.stickerRankingCheat),
    additionalScore: String(user.additionalScore),
    guestTitle: user.guestTitle ?? '',
    publicProfile: user.publicProfile,
    motto: user.motto ?? '',
    password: '',
  });
  const [saving, setSaving] = useState(false);

  async function save(): Promise<void> {
    setSaving(true);
    await run(
      api.patch(`/admin/users/${user.id}`, {
        nickName: form.nickName,
        realName: form.realName || null,
        email: form.email || null,
        phone: form.phone || null,
        userType: form.userType,
        accessLevel: form.accessLevel,
        businessAreaId: form.businessAreaId ? Number(form.businessAreaId) : null,
        castLevelId: form.castLevelId ? Number(form.castLevelId) : null,
        customerLevelId: form.customerLevelId ? Number(form.customerLevelId) : null,
        serviceFeePermille: form.serviceFeePermille === '' ? null : Number(form.serviceFeePermille),
        orderFeePerTime: form.orderFeePerTime === '' ? null : Number(form.orderFeePerTime),
        firstExperienceRewardPermille: Number(form.firstExperienceRewardPermille),
        meetingRankingCheat: Number(form.meetingRankingCheat),
        stickerRankingCheat: Number(form.stickerRankingCheat),
        additionalScore: Number(form.additionalScore),
        guestTitle: form.guestTitle || null,
        publicProfile: form.publicProfile,
        motto: form.motto || null,
        ...(form.password ? { password: form.password } : {}),
      }),
      { success: '更新しました' },
    );
    setSaving(false);
    onSaved();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`ユーザー編集 (ID ${user.id})`}
      wide
      footer={
        <button type="button" className="btn-primary w-full" onClick={() => void save()} disabled={saving}>
          {saving ? <Spinner /> : null}
          保存する
        </button>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="ニックネーム">
          <input className="input" value={form.nickName} onChange={(event) => setForm({ ...form, nickName: event.target.value })} />
        </Field>
        <Field label="本名">
          <input className="input" value={form.realName} onChange={(event) => setForm({ ...form, realName: event.target.value })} />
        </Field>
        <Field label="メール">
          <input className="input" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        </Field>
        <Field label="電話">
          <input className="input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        </Field>
        <Field label="種別">
          <select className="input" value={form.userType} onChange={(event) => setForm({ ...form, userType: event.target.value })}>
            {options?.userTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </Field>
        <Field label="登録状況">
          <select
            className="input"
            value={form.accessLevel}
            onChange={(event) => setForm({ ...form, accessLevel: event.target.value })}
          >
            {options?.accessLevels.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </Field>
        <Field label="支店">
          <select
            className="input"
            value={form.businessAreaId}
            onChange={(event) => setForm({ ...form, businessAreaId: event.target.value })}
          >
            <option value="">未設定</option>
            {options?.businessAreas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="キャストレベル">
          <select
            className="input"
            value={form.castLevelId}
            onChange={(event) => setForm({ ...form, castLevelId: event.target.value })}
          >
            <option value="">未設定</option>
            {options?.castLevels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="お客様レベル">
          <select
            className="input"
            value={form.customerLevelId}
            onChange={(event) => setForm({ ...form, customerLevelId: event.target.value })}
          >
            <option value="">未設定</option>
            {options?.customerLevels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="バック率（パーミル）" hint="700 で 70%">
          <input
            type="number"
            className="input"
            value={form.serviceFeePermille}
            onChange={(event) => setForm({ ...form, serviceFeePermille: event.target.value })}
          />
        </Field>
        <Field label="個TOLA料金（30分）">
          <input
            type="number"
            className="input"
            value={form.orderFeePerTime}
            onChange={(event) => setForm({ ...form, orderFeePerTime: event.target.value })}
          />
        </Field>
        <Field label="初個TOLAバック（パーミル）">
          <input
            type="number"
            className="input"
            value={form.firstExperienceRewardPermille}
            onChange={(event) => setForm({ ...form, firstExperienceRewardPermille: event.target.value })}
          />
        </Field>
        <Field label="ランキング加点（合流）">
          <input
            type="number"
            className="input"
            value={form.meetingRankingCheat}
            onChange={(event) => setForm({ ...form, meetingRankingCheat: event.target.value })}
          />
        </Field>
        <Field label="ランキング加点（ギフト）">
          <input
            type="number"
            className="input"
            value={form.stickerRankingCheat}
            onChange={(event) => setForm({ ...form, stickerRankingCheat: event.target.value })}
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
        <Field label="称号">
          <input className="input" value={form.guestTitle} onChange={(event) => setForm({ ...form, guestTitle: event.target.value })} />
        </Field>
        <Field label="新しいパスワード" hint="空欄なら変更しません">
          <input
            type="text"
            className="input"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
        </Field>
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={form.publicProfile}
            onChange={(event) => setForm({ ...form, publicProfile: event.target.checked })}
          />
          プロフィールを公開する
        </label>
        <div className="md:col-span-2">
          <Field label="ひとこと">
            <textarea
              className="input min-h-20"
              value={form.motto}
              onChange={(event) => setForm({ ...form, motto: event.target.value })}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function GrantCreditsModal({
  open,
  onClose,
  userId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  userId: number;
  onSaved: () => void;
}): ReactNode {
  const { run } = useAdminAction();
  const [form, setForm] = useState({ amount: '', reason: '', cash: '', reflect: '0' });
  const [saving, setSaving] = useState(false);

  async function save(): Promise<void> {
    setSaving(true);
    await run(
      api.post(`/admin/users/${userId}/credits`, {
        amount: Number(form.amount),
        reason: form.reason || undefined,
        cash: form.cash ? Number(form.cash) : 0,
        reflect: Number(form.reflect),
      }),
      { success: 'ポイントを処理しました' },
    );
    setSaving(false);
    onSaved();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ポイント付与・減算"
      footer={
        <button type="button" className="btn-primary w-full" onClick={() => void save()} disabled={saving || !form.amount}>
          {saving ? <Spinner /> : null}
          実行する
        </button>
      }
    >
      <div className="space-y-3">
        <Field label="ポイント数" hint="マイナスを入力すると減算します">
          <input
            type="number"
            className="input"
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
          />
        </Field>
        <Field label="理由" hint="履歴に表示されます">
          <input className="input" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
        </Field>
        <Field label="受領金額（円）" hint="現金でお預かりした場合に入力します">
          <input
            type="number"
            className="input"
            value={form.cash}
            onChange={(event) => setForm({ ...form, cash: event.target.value })}
          />
        </Field>
        <Field label="ランキングへの反映">
          <select className="input" value={form.reflect} onChange={(event) => setForm({ ...form, reflect: event.target.value })}>
            <option value="0">反映しない（manual）</option>
            <option value="1">反映する（manual_reflect）</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}
