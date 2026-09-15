'use client';

import { useParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { Paginated } from '@/lib';
import { l } from '@/lib';
import { api, query } from '@/client/admin-api';
import { useAdminAction, useAdminQuery } from '@/client/admin-hooks';
import { Badge, DataTable, Field, Loading, Modal, PageTitle, Pagination, Spinner } from '@/components/admin/ui';

/**
 * One screen for every settings table.
 *
 * The PHP admin had a controller and a set of templates per table; the shapes are
 * identical enough that a field descriptor per resource covers them all. Each
 * descriptor names the columns to list and the fields to edit, so adding a table
 * is a few lines rather than a new page.
 */

type FieldType = 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'datetime' | 'color' | 'stringList' | 'password';

interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  hint?: string;
  /** a fixed option list, or the name of an /admin/options collection */
  options?: Array<{ value: string; label: string }>;
  optionsFrom?: 'businessAreas' | 'areas' | 'castLevels' | 'customerLevels' | 'stickerTemplates' | 'roulettes';
  required?: boolean;
  /** hidden on edit (attr_readonly in the model) */
  readOnlyOnEdit?: boolean;
  listWidth?: string;
  hideInList?: boolean;
}

interface ResourceSpec {
  title: string;
  note?: string;
  fields: FieldSpec[];
  /** extra join editor rendered under the table */
  links?: {
    label: string;
    path: (id: number) => string;
    body: (ids: number[]) => unknown;
    optionsFrom: 'castLevels' | 'customerLevels' | 'meetingPlaceTags';
    currentFrom: (row: Record<string, unknown>) => number[];
  };
  deletable?: boolean;
  creatable?: boolean;
}

const BOOLEAN_OPTIONS = [
  { value: 'true', label: 'はい' },
  { value: 'false', label: 'いいえ' },
];

const RESOURCES: Record<string, ResourceSpec> = {
  business_areas: {
    title: '支店管理',
    fields: [
      { key: 'name', label: '支店名', type: 'text', required: true },
      { key: 'active', label: '有効', type: 'boolean' },
      { key: 'sortIndex', label: '並び順', type: 'number' },
      { key: 'color', label: '色', type: 'color' },
    ],
  },
  areas: {
    title: 'エリア管理',
    fields: [
      { key: 'businessAreaId', label: '支店', type: 'select', optionsFrom: 'businessAreas', required: true },
      { key: 'name', label: 'エリア名', type: 'text', required: true },
      { key: 'sortIndex', label: '並び順', type: 'number' },
      { key: 'custom', label: '自由入力枠', type: 'boolean', hint: 'ゲストが場所を自由に入力できる枠です' },
    ],
  },
  cast_levels: {
    title: 'キャストレベル設定',
    note: 'レベルごとに個TOLA料金の上下限を設けられます。料金メニューとの対応は料金メニュー側で設定します。',
    fields: [
      { key: 'name', label: 'レベル名', type: 'text', required: true },
      { key: 'sortIndex', label: '並び順', type: 'number' },
      { key: 'color', label: '色', type: 'color' },
      { key: 'minOrderFeePerTime', label: '個TOLA料金の下限', type: 'number' },
      { key: 'maxOrderFeePerTime', label: '個TOLA料金の上限', type: 'number' },
    ],
  },
  cast_ranks: {
    title: '料金メニュー管理',
    note: '「提案価格」はゲストが金額を提示できる枠、「固定価格」は時間に比例しない枠です。',
    fields: [
      { key: 'businessAreaId', label: '支店', type: 'select', optionsFrom: 'businessAreas', required: true },
      { key: 'name', label: 'メニュー名', type: 'text', required: true },
      { key: 'baseCostPerTime', label: '基本料金（30分）', type: 'number', required: true },
      { key: 'prolongCostPerTime', label: '延長料金（30分）', type: 'number', required: true },
      { key: 'proposedPrice', label: '提案価格', type: 'boolean' },
      { key: 'fixedPrice', label: '固定価格', type: 'boolean' },
    ],
    links: {
      label: '対象キャストレベル',
      path: (id) => `/admin/cast_ranks/${id}/cast_levels`,
      body: (ids) => ({ castLevelIds: ids }),
      optionsFrom: 'castLevels',
      currentFrom: (row) =>
        ((row.castLevels as Array<{ castLevelId: number }> | undefined) ?? []).map((link) => link.castLevelId),
    },
  },
  customer_levels: {
    title: 'お客様レベル設定',
    fields: [
      { key: 'name', label: 'レベル名', type: 'text', required: true },
      { key: 'color', label: '色', type: 'color' },
      { key: 'sortIndex', label: '並び順', type: 'number' },
      { key: 'entrySpending', label: '昇格に必要な利用額', type: 'number' },
      { key: 'holdSpending', label: '維持に必要な利用額', type: 'number' },
      { key: 'nextLevelId', label: '次のレベル', type: 'select', optionsFrom: 'customerLevels' },
      { key: 'prevLevelId', label: '前のレベル', type: 'select', optionsFrom: 'customerLevels' },
      { key: 'notes', label: '備考', type: 'textarea', hideInList: true },
    ],
  },
  sticker_templates: {
    title: 'ギフトアイテム管理',
    note: 'キャストの取り分は「絶対値」か「パーミル」のどちらかを設定してください。価格0は無料ギフト（キャスト配布用）です。',
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'pictureUrl', label: '画像URL', type: 'text', required: true },
      { key: 'businessAreaId', label: '支店', type: 'select', optionsFrom: 'businessAreas', required: true },
      { key: 'price', label: '価格（ポイント）', type: 'number', required: true },
      { key: 'transactionPriceAbs', label: 'キャスト取り分（絶対値）', type: 'number' },
      { key: 'transactionPricePermille', label: 'キャスト取り分（パーミル）', type: 'number' },
      { key: 'active', label: '有効', type: 'boolean' },
    ],
  },
  event_campaigns: {
    title: 'イベントキャンペーン',
    note: 'キャストが無料ギフトを配布し、配布ごとに報酬を得る期間限定企画です。マイルストーンに到達すると一括ボーナス、以降は報酬が2倍になります。',
    fields: [
      { key: 'name', label: 'キャンペーン名', type: 'text', required: true },
      { key: 'stickerTemplateId', label: '対象ギフト', type: 'select', optionsFrom: 'stickerTemplates', required: true },
      { key: 'castRewardAmount', label: 'キャスト報酬（1個あたり）', type: 'number' },
      { key: 'castDailyLimit', label: '1日の配布上限', type: 'number' },
      { key: 'startAt', label: '開始日時', type: 'datetime', required: true },
      { key: 'endAt', label: '終了日時', type: 'datetime', required: true },
      {
        key: 'milestoneGiftThreshold',
        label: 'マイルストーン個数',
        type: 'number',
        hint: '0で無効。70にすると70個到達時にボーナス',
      },
      {
        key: 'limitedStickerTemplateIds',
        label: '期間限定ランキング対象ID',
        type: 'text',
        hint: 'カンマ区切り',
      },
    ],
  },
  trophies: {
    title: 'トロフィー管理',
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'imageUrl', label: '画像URL', type: 'text', required: true },
      { key: 'description', label: '説明', type: 'text' },
      { key: 'active', label: '有効', type: 'boolean' },
    ],
  },
  banners: {
    title: 'バナー管理',
    note: '同じ表示枠に設定できるバナーは1つだけです。新しく設定すると以前のものは枠から外れます。',
    fields: [
      { key: 'name', label: '名称', type: 'text' },
      { key: 'bannerPictureUrl', label: 'バナー画像URL', type: 'text', required: true },
      { key: 'mainPictureUrl', label: 'メイン画像URL', type: 'text' },
      { key: 'position', label: '表示枠', type: 'text', hint: '空欄で非表示' },
    ],
  },
  service_messages: {
    title: 'お知らせ',
    fields: [
      { key: 'title', label: 'タイトル', type: 'text' },
      { key: 'content', label: '本文', type: 'textarea', hideInList: true },
      { key: 'businessAreaId', label: '支店', type: 'select', optionsFrom: 'businessAreas', hint: '空欄で全支店' },
      { key: 'forCast', label: 'キャストに表示', type: 'boolean' },
      { key: 'forCustomers', label: 'ゲストに表示', type: 'boolean' },
      { key: 'forInviters', label: '紹介者に表示', type: 'boolean' },
      { key: 'active', label: '有効', type: 'boolean' },
    ],
  },
  rewarding_rules: {
    title: '紹介バック管理',
    note: 'fixed_steps は「N回ごとに定額」、fixed_turnover は「売上Nごとに定額」、relative_turnover は「売上のパーミル」です。limit は回数上限（空欄で無制限、0で無効）。',
    fields: [
      {
        key: 'category',
        label: '分類',
        type: 'select',
        required: true,
        options: [
          { value: 'invitation', label: '紹介' },
          { value: 'being_reviewed', label: 'レビューされた' },
          { value: 'reviewing', label: 'レビューした' },
          { value: 'usage', label: '利用' },
          { value: 'attendance', label: '参加' },
        ],
      },
      {
        key: 'policy',
        label: '方式',
        type: 'select',
        required: true,
        options: [
          { value: 'fixed_steps', label: 'fixed_steps' },
          { value: 'fixed_turnover', label: 'fixed_turnover' },
          { value: 'relative_turnover', label: 'relative_turnover' },
        ],
      },
      {
        key: 'userType',
        label: '対象ユーザー種別',
        type: 'select',
        hint: '空欄で全員',
        options: [
          { value: 'cast', label: 'cast' },
          { value: 'customer', label: 'customer' },
          { value: 'inviter', label: 'inviter' },
        ],
      },
      { key: 'userId', label: '個別ユーザーID', type: 'number', hint: '特定ユーザー専用ルール' },
      { key: 'overrideId', label: '上書き対象ルールID', type: 'number' },
      {
        key: 'inviteeUserType',
        label: '紹介者の種別条件',
        type: 'select',
        hint: 'カラム名は歴史的に invitee ですが紹介者側の条件です',
        options: [
          { value: 'cast', label: 'cast' },
          { value: 'customer', label: 'customer' },
          { value: 'inviter', label: 'inviter' },
          { value: 'mandatory', label: 'mandatory（紹介者必須）' },
        ],
      },
      { key: 'payout', label: '定額報酬（ポイント）', type: 'number' },
      { key: 'payoutPermille', label: '売上シェア（パーミル）', type: 'number' },
      { key: 'each', label: 'ステップ（回数・金額）', type: 'number' },
      { key: 'limit', label: '回数上限', type: 'number' },
      { key: 'minStars', label: '必要な星の数', type: 'number' },
      { key: 'serviceFeeReset', label: 'バック率の引き上げ先（パーミル）', type: 'number' },
      { key: 'serviceFeeIncrease', label: 'バック率の加算（パーミル）', type: 'number' },
    ],
  },
  highlightings: {
    title: '特集枠',
    note: '「探す」画面に表示される特集カテゴリです。掲載メンバーはユーザー側の設定で紐付けます。',
    fields: [
      { key: 'categoryName', label: 'カテゴリ名', type: 'text', required: true },
      {
        key: 'userType',
        label: '対象',
        type: 'select',
        options: [
          { value: 'all', label: 'すべて' },
          { value: 'cast', label: 'キャスト' },
          { value: 'customer', label: 'ゲスト' },
          { value: 'inviter', label: '紹介者' },
        ],
      },
      { key: 'note', label: '説明', type: 'textarea', hideInList: true },
      { key: 'active', label: '有効', type: 'boolean' },
      { key: 'sortIndex', label: '並び順', type: 'number' },
    ],
  },
  meeting_places: {
    title: '協力店',
    fields: [
      { key: 'areaId', label: 'エリア', type: 'select', optionsFrom: 'areas', required: true },
      { key: 'name', label: '店名', type: 'text', required: true },
      { key: 'url', label: 'URL', type: 'text' },
      { key: 'phone', label: '電話', type: 'text' },
      { key: 'address', label: '住所', type: 'text' },
      { key: 'description', label: '説明', type: 'textarea', hideInList: true },
      { key: 'imageUrls', label: '画像URL', type: 'stringList', hint: '1行に1つ', hideInList: true },
      { key: 'active', label: '有効', type: 'boolean' },
      { key: 'sortIndex', label: '並び順', type: 'number' },
    ],
    links: {
      label: 'タグ',
      path: (id) => `/admin/meeting_places/${id}/tags`,
      body: (ids) => ({ tagIds: ids }),
      optionsFrom: 'meetingPlaceTags',
      currentFrom: (row) =>
        ((row.tags as Array<{ meetingPlaceTagId: number }> | undefined) ?? []).map((link) => link.meetingPlaceTagId),
    },
  },
  meeting_place_tags: {
    title: '協力店タグ',
    fields: [
      { key: 'name', label: 'タグ名', type: 'text', required: true },
      { key: 'active', label: '有効', type: 'boolean' },
    ],
  },
  roulettes: {
    title: 'ルーレット',
    note: '対象のお客様レベルを設定すると、そのレベルのゲストだけがルーレットを回せます。',
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'fee', label: '1回の料金（ポイント）', type: 'number', required: true },
      { key: 'sortIndex', label: '並び順', type: 'number', required: true },
      { key: 'active', label: '有効', type: 'boolean' },
    ],
    links: {
      label: '対象のお客様レベル',
      path: (id) => `/admin/roulettes/${id}/customer_levels`,
      body: (ids) => ({ customerLevelIds: ids }),
      optionsFrom: 'customerLevels',
      currentFrom: (row) =>
        ((row.customerLevels as Array<{ customerLevelId: number }> | undefined) ?? []).map(
          (link) => link.customerLevelId,
        ),
    },
  },
  roulette_entries: {
    title: 'ルーレット内容',
    note: '1つのルーレットの当選確率（パーミル）の合計が1000になるように設定してください。「高額枠」はリールに必ず1つ表示されます。',
    fields: [
      { key: 'rouletteId', label: 'ルーレット', type: 'select', optionsFrom: 'roulettes', required: true },
      { key: 'stickerTemplateId', label: 'ギフト', type: 'select', optionsFrom: 'stickerTemplates', required: true },
      { key: 'chancePermille', label: '当選確率（パーミル）', type: 'number', required: true },
      { key: 'displayChance', label: '表示用の確率', type: 'text', hint: '例: 30%' },
      { key: 'highValue', label: '高額枠', type: 'boolean' },
    ],
  },
  attributes_schema: {
    title: 'プロフィール入力項目',
    note: '既存データに影響するため、作成後の削除はできません。',
    deletable: false,
    fields: [
      { key: 'name', label: '項目名', type: 'text', required: true, readOnlyOnEdit: true },
      { key: 'category', label: 'カテゴリ', type: 'text', required: true, readOnlyOnEdit: true },
      {
        key: 'validity',
        label: '対象',
        type: 'select',
        options: [
          { value: 'all', label: 'すべて' },
          { value: 'cast', label: 'キャスト' },
          { value: 'customer', label: 'ゲスト' },
        ],
      },
      {
        key: 'attributeType',
        label: '入力形式',
        type: 'select',
        options: [
          { value: 'String', label: 'String' },
          { value: 'Integer', label: 'Integer' },
          { value: 'Text', label: 'Text（リッチテキスト）' },
          { value: 'Date', label: 'Date' },
        ],
      },
      { key: 'valueList', label: '選択肢', type: 'stringList', hint: '1行に1つ。空なら自由入力', hideInList: true },
      { key: 'comment', label: '補足', type: 'text' },
      { key: 'sortIndex', label: '並び順', type: 'number' },
    ],
  },
  meeting_preferences_schema: {
    title: 'マッチング項目設定',
    note: '項目名・カテゴリ・サブカテゴリは作成後に変更できません（既存の選択に影響するため）。スコアはマッチングの重み付けです。',
    fields: [
      { key: 'name', label: '項目名', type: 'text', readOnlyOnEdit: true },
      { key: 'category', label: 'カテゴリ', type: 'text', readOnlyOnEdit: true },
      { key: 'subcategory', label: 'サブカテゴリ', type: 'text', readOnlyOnEdit: true },
      { key: 'score', label: 'スコア', type: 'number' },
      { key: 'sortIndex', label: '並び順', type: 'number' },
      { key: 'active', label: '有効', type: 'boolean' },
      { key: 'castPreference', label: 'キャストが選択できる', type: 'boolean' },
      { key: 'customerPreference', label: 'ゲストが選択できる', type: 'boolean' },
      { key: 'mutuallyExclusive', label: '同一サブカテゴリで排他', type: 'boolean' },
    ],
  },
  company_informations: {
    title: '領収書表示項目設定',
    creatable: false,
    deletable: false,
    fields: [
      { key: 'name', label: '会社名', type: 'text' },
      { key: 'zipCode', label: '郵便番号', type: 'text' },
      { key: 'address', label: '住所', type: 'text' },
      { key: 'building', label: '建物名', type: 'text' },
      { key: 'phone', label: '電話', type: 'text' },
      { key: 'personInCharge', label: '責任者', type: 'text' },
    ],
  },
  admins: {
    title: '管理者',
    note: '支店を設定すると、その支店のデータのみ閲覧・操作できます。',
    fields: [
      { key: 'loginName', label: 'ログイン名', type: 'text', required: true },
      { key: 'businessAreaId', label: '支店', type: 'select', optionsFrom: 'businessAreas', hint: '空欄で全支店' },
      { key: 'password', label: 'パスワード', type: 'password', hint: '編集時は空欄で変更しません', hideInList: true },
    ],
  },
};

interface OptionsResponse {
  businessAreas: Array<{ id: number; name: string }>;
  areas: Array<{ id: number; name: string }>;
  castLevels: Array<{ id: number; name: string }>;
  customerLevels: Array<{ id: number; name: string }>;
  stickerTemplates: Array<{ id: number; name: string }>;
  roulettes: Array<{ id: number; name: string }>;
}

export function CrudPage({ resourceOverride }: { resourceOverride?: string } = {}): ReactNode {
  const params = useParams<{ resource: string }>();
  const resource = resourceOverride ?? params.resource ?? '';
  const spec = RESOURCES[resource];

  const { run } = useAdminAction();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading, refetch } = useAdminQuery<Paginated<Record<string, unknown>>>(
    ['admin', resource, page],
    `/admin/${resource}${query({ page })}`,
    { enabled: !!spec },
  );
  const { data: options } = useAdminQuery<OptionsResponse>(['admin', 'options'], '/admin/options');
  const { data: tags } = useAdminQuery<Paginated<{ id: number; name: string }>>(
    ['admin', 'meeting_place_tags', 'all'],
    '/admin/meeting_place_tags?perPage=500',
    { enabled: resource === 'meeting_places' },
  );

  if (!spec) {
    return (
      <div>
        <PageTitle title="不明な設定画面" />
        <p className="text-[13px] text-slate-500">この設定画面は定義されていません。</p>
      </div>
    );
  }

  const optionList = (field: FieldSpec): Array<{ value: string; label: string }> => {
    if (field.options) return field.options;
    if (!field.optionsFrom || !options) return [];
    return (options[field.optionsFrom] ?? []).map((entry) => ({ value: String(entry.id), label: entry.name }));
  };

  async function destroy(row: Record<string, unknown>): Promise<void> {
    if (!window.confirm('この項目を削除しますか？')) return;
    await run(api.delete(`/admin/${resource}/${String(row.id)}`), {
      invalidate: [['admin', resource]],
      success: '削除しました',
    });
    await refetch();
  }

  const listFields = spec.fields.filter((field) => !field.hideInList);

  return (
    <div>
      <PageTitle
        title={spec.title}
        subtitle={spec.note}
        actions={
          spec.creatable === false ? null : (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              新規作成
            </button>
          )
        }
      />

      <div className="card">
        {isLoading ? (
          <Loading />
        ) : (
          <>
            <DataTable
              rows={data?.items ?? []}
              rowKey={(row) => String(row.id)}
              empty="登録がありません"
              columns={[
                { header: 'ID', cell: (row) => String(row.id) },
                ...listFields.map((field) => ({
                  header: field.label,
                  className: field.listWidth,
                  cell: (row: Record<string, unknown>) => renderCell(row[field.key], field, optionList(field)),
                })),
                {
                  header: '',
                  cell: (row: Record<string, unknown>) => (
                    <div className="flex gap-1">
                      <button type="button" className="btn-secondary px-2 py-1" onClick={() => setEditing(row)}>
                        編集
                      </button>
                      {spec.deletable === false ? null : (
                        <button type="button" className="btn-danger px-2 py-1" onClick={() => void destroy(row)}>
                          削除
                        </button>
                      )}
                    </div>
                  ),
                },
              ]}
            />
            <Pagination page={page} totalPages={data?.totalPages ?? 1} totalCount={data?.totalCount} onChange={setPage} />
          </>
        )}
      </div>

      {creating || editing ? (
        <RecordModal
          resource={resource}
          spec={spec}
          row={editing}
          optionList={optionList}
          linkOptions={
            spec.links
              ? spec.links.optionsFrom === 'meetingPlaceTags'
                ? (tags?.items ?? [])
                : ((options?.[spec.links.optionsFrom] ?? []) as Array<{ id: number; name: string }>)
              : []
          }
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            void refetch();
          }}
        />
      ) : null}
    </div>
  );
}

function renderCell(
  value: unknown,
  field: FieldSpec,
  options: Array<{ value: string; label: string }>,
): ReactNode {
  if (value === null || value === undefined || value === '') return <span className="text-slate-300">—</span>;

  if (field.type === 'boolean') {
    return value ? <Badge tone="ok">はい</Badge> : <Badge>いいえ</Badge>;
  }
  if (field.type === 'color') {
    const color = String(value).startsWith('#') ? String(value) : `#${String(value)}`;
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3.5 w-3.5 rounded border border-slate-300" style={{ backgroundColor: color }} />
        <span className="text-[11px]">{String(value)}</span>
      </span>
    );
  }
  if (field.type === 'datetime') return <span className="text-[11px]">{l(String(value))}</span>;
  if (field.type === 'select') {
    const match = options.find((option) => option.value === String(value));
    return match?.label ?? String(value);
  }
  if (field.type === 'stringList') {
    const list = Array.isArray(value) ? value : [];
    return <span className="text-[11px]">{list.join(' / ')}</span>;
  }
  if (field.type === 'password') return <span className="text-slate-300">—</span>;

  const text = String(value);
  return <span className="text-[12px]">{text.length > 60 ? `${text.slice(0, 60)}…` : text}</span>;
}

function RecordModal({
  resource,
  spec,
  row,
  optionList,
  linkOptions,
  onClose,
  onSaved,
}: {
  resource: string;
  spec: ResourceSpec;
  row: Record<string, unknown> | null;
  optionList: (field: FieldSpec) => Array<{ value: string; label: string }>;
  linkOptions: Array<{ id: number; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}): ReactNode {
  const { run } = useAdminAction();
  const isEdit = !!row;

  const [form, setForm] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of spec.fields) {
      const value = row?.[field.key];
      if (field.type === 'stringList') {
        initial[field.key] = Array.isArray(value) ? (value as string[]).join('\n') : '';
      } else if (field.type === 'datetime') {
        initial[field.key] = value ? String(value).slice(0, 16) : '';
      } else if (field.type === 'boolean') {
        initial[field.key] = value === undefined || value === null ? 'true' : String(Boolean(value));
      } else if (field.type === 'password') {
        initial[field.key] = '';
      } else {
        initial[field.key] = value === null || value === undefined ? '' : String(value);
      }
    }
    return initial;
  });

  const [linkedIds, setLinkedIds] = useState<number[]>(
    spec.links && row ? spec.links.currentFrom(row) : [],
  );
  const [saving, setSaving] = useState(false);

  async function save(): Promise<void> {
    setSaving(true);

    const payload: Record<string, unknown> = {};
    for (const field of spec.fields) {
      if (isEdit && field.readOnlyOnEdit) continue;
      const raw = form[field.key];

      if (field.type === 'password') {
        if (raw) payload[field.key] = raw;
        continue;
      }
      if (field.type === 'boolean') {
        payload[field.key] = raw === 'true';
        continue;
      }
      if (field.type === 'number') {
        payload[field.key] = raw === '' ? null : Number(raw);
        continue;
      }
      if (field.type === 'stringList') {
        const list = raw
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
        payload[field.key] = list.length ? list : null;
        continue;
      }
      if (field.type === 'select') {
        // a numeric-looking option value is a foreign key
        payload[field.key] = raw === '' ? null : /^\d+$/.test(raw) ? Number(raw) : raw;
        continue;
      }
      if (field.type === 'datetime') {
        payload[field.key] = raw ? new Date(raw).toISOString() : null;
        continue;
      }
      payload[field.key] = raw === '' ? null : raw;
    }

    const result = await run(
      isEdit
        ? api.patch<{ item: { id: number } }>(`/admin/${resource}/${String(row?.id)}`, payload)
        : api.post<{ item: { id: number } }>(`/admin/${resource}`, payload),
      { success: isEdit ? '更新しました' : '作成しました' },
    );

    if (result && spec.links) {
      const id = result.item.id;
      await run(api.put(spec.links.path(id), spec.links.body(linkedIds)));
    }

    setSaving(false);
    if (result) onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={`${spec.title}${isEdit ? ` の編集 (ID ${String(row?.id)})` : ' を新規作成'}`}
      footer={
        <button type="button" className="btn-primary w-full" onClick={() => void save()} disabled={saving}>
          {saving ? <Spinner /> : null}
          {isEdit ? '更新する' : '作成する'}
        </button>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        {spec.fields.map((field) => {
          const disabled = isEdit && field.readOnlyOnEdit;
          const value = form[field.key] ?? '';

          return (
            <div key={field.key} className={field.type === 'textarea' || field.type === 'stringList' ? 'md:col-span-2' : ''}>
              <Field label={field.label} hint={disabled ? '作成後は変更できません' : field.hint}>
                {field.type === 'textarea' || field.type === 'stringList' ? (
                  <textarea
                    className="input min-h-24"
                    value={value}
                    disabled={disabled}
                    onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                  />
                ) : field.type === 'boolean' ? (
                  <select
                    className="input"
                    value={value}
                    disabled={disabled}
                    onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                  >
                    {BOOLEAN_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'select' ? (
                  <select
                    className="input"
                    value={value}
                    disabled={disabled}
                    onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                  >
                    <option value="">未設定</option>
                    {optionList(field).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={
                      field.type === 'number'
                        ? 'number'
                        : field.type === 'datetime'
                          ? 'datetime-local'
                          : field.type === 'password'
                            ? 'text'
                            : 'text'
                    }
                    className="input"
                    value={value}
                    disabled={disabled}
                    required={field.required}
                    onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                  />
                )}
              </Field>
            </div>
          );
        })}
      </div>

      {spec.links ? (
        <div className="mt-4 border-t border-slate-200 pt-3">
          <p className="label">{spec.links.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {linkOptions.map((option) => {
              const active = linkedIds.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() =>
                    setLinkedIds(active ? linkedIds.filter((id) => id !== option.id) : [...linkedIds, option.id])
                  }
                  className={`badge px-2.5 py-1 ${active ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  {option.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
