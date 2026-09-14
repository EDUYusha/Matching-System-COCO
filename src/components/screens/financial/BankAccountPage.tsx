'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { BankAccountDto } from '@/lib';
import { api } from '@/client/api';
import { useAction, useApiQuery } from '@/client/hooks';
import { Field, PageHeader, PageLoading, Spinner } from '@/components/ui';

/** FinancialController#bank_account / #register_bank_account. */
export function BankAccountPage(): ReactNode {
  const { run } = useAction();
  const { data, isLoading } = useApiQuery<{ bankAccount: BankAccountDto | null }>(
    ['financial', 'bank_account'],
    '/financial/bank_account',
  );

  const [form, setForm] = useState<BankAccountDto>({
    bankName: '',
    bankNumber: '',
    branchName: '',
    branchNumber: '',
    accountType: '普通',
    accountNumber: '',
    holderName: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (data?.bankAccount) setForm(data.bankAccount);
  }, [data]);

  if (isLoading) return <PageLoading />;

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    await run(api.post<{ redirect: string; flash: { type: string; message: string } }>('/financial/bank_account', form), {
      invalidate: [['financial', 'payout'], ['financial', 'bank_account']],
    });
    setSubmitting(false);
  }

  const fields: Array<[keyof BankAccountDto, string, string?]> = [
    ['bankName', '銀行名'],
    ['bankNumber', '銀行コード', '4桁'],
    ['branchName', '支店名'],
    ['branchNumber', '支店コード', '3桁'],
    ['accountNumber', '口座番号', '7桁'],
    ['holderName', '口座名義', 'カタカナ'],
  ];

  return (
    <div>
      <PageHeader title="振込先口座" back="/financial/payout" />
      <form onSubmit={submit} className="space-y-4 px-4 py-4">
        {fields.map(([key, label, hint]) => (
          <Field key={key} label={label} hint={hint}>
            <input
              className="input"
              value={form[key]}
              onChange={(event) => setForm({ ...form, [key]: event.target.value })}
              required
            />
          </Field>
        ))}

        <Field label="口座種別">
          <select
            className="input"
            value={form.accountType}
            onChange={(event) => setForm({ ...form, accountType: event.target.value })}
          >
            <option value="普通">普通</option>
            <option value="当座">当座</option>
            <option value="貯蓄">貯蓄</option>
          </select>
        </Field>

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? <Spinner /> : null}
          登録する
        </button>
      </form>
    </div>
  );
}
