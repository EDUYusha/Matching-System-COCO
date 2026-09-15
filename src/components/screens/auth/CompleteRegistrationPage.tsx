'use client';

import Link from 'next/link';
import { useSearchParams } from '@/client/navigation';
import type { ReactNode } from 'react';
import { AN } from '@/lib';
import { useCurrentUser } from '@/client/store';

/**
 * UsersController#complete_registration — the thank-you page. What it offers next
 * depends on the account type: a cast still has onboarding to do, a guest is
 * ready to order.
 */
export function CompleteRegistrationPage(): ReactNode {
  const [searchParams] = useSearchParams();
  const user = useCurrentUser();
  const userType = searchParams.get('user_type') ?? user?.userType ?? 'customer';

  return (
    <div className="px-6 py-12 text-center">
      <p className="text-5xl">🎉</p>
      <h1 className="mt-4 text-lg font-bold">{AN.Full}にようこそ</h1>

      {userType === 'cast' ? (
        <>
          <p className="mt-3 text-xs leading-relaxed text-ink-700">
            現在は仮登録の状態です。
            <br />
            顔写真付きの身分証明書をアップロードすると本登録となります。
          </p>
          <Link href="/cast/identity_check" className="btn-primary mt-6 w-full no-underline">
            身分証明書をアップロード
          </Link>
          <Link href="/conversations" className="btn-secondary mt-3 w-full no-underline">
            あとで行う
          </Link>
        </>
      ) : (
        <>
          <p className="mt-3 text-xs leading-relaxed text-ink-700">
            ご登録ありがとうございます。
            <br />
            お好みのキャストを探して、メッセージを送ってみましょう。
          </p>
          <Link href="/users/cast_recommendations" className="btn-primary mt-6 w-full no-underline">
            好みのキャストを選ぶ
          </Link>
          <Link href="/home" className="btn-secondary mt-3 w-full no-underline">
            ホームへ
          </Link>
        </>
      )}
    </div>
  );
}
