import { config, l, lSlashDate, numberToCurrencyP, PATRON_SHARE_PERMILLE } from '@/lib';
import { prisma, type Tx } from '@/server/lib/prisma';
import { systemMessageToAdmin, systemMessageToUser } from '@/server/services/messages';
import { targetRewardingRule } from '@/server/services/rewarding-rules';

/**
 * Port of AutoSendMessage (app/interactors/auto_send_message.rb).
 *
 * Pure copy-and-routing: every string is reproduced verbatim, including the
 * emoji, the double spaces and the "TOLA運営局の方へ" blocks that exist so an
 * operator can copy the text into the official LINE account by hand.
 *
 * One Ruby quirk worth naming: the original wrote
 * `user.user_type.in?(%[customer inviter])`, and `%[...]` is a *string* literal,
 * so that was a substring test against "customer inviter" rather than an array
 * membership test. For the six real user_type values the two agree, so this uses
 * a proper membership check.
 */

type MessageUser = {
  id: number;
  nickName: string;
  userType: string;
  inviterId: number | null;
};

const PATRON_SHARE_PERCENT = (PATRON_SHARE_PERMILLE / 10).toFixed(1);

function isGuest(userType: string): boolean {
  return userType === 'customer' || userType === 'inviter';
}

async function loadInviter(user: MessageUser, tx?: Tx): Promise<MessageUser | null> {
  if (!user.inviterId) return null;
  const client = tx ?? prisma;
  return client.user.findUnique({
    where: { id: user.inviterId },
    select: { id: true, nickName: true, userType: true, inviterId: true },
  });
}

/** AutoSendMessage.registration_message */
export async function registrationMessage(user: MessageUser, tx?: Tx): Promise<void> {
  if (isGuest(user.userType)) {
    await systemMessageToUser(
      user.id,
      {
        withUnread: true,
        content: `${user.nickName} さん

はじめまして、TOLA運営局です！
【TOLA】は飲み会に呼べるキャストさんを探せるエンタメマッチングサービスです。

登録しているキャストさんは、
夢や目標のある頑張り屋さんや、普通のアルバイトができないモデルやタレントさん等、厳正な審査を通った素敵な方ばかり！

今すぐキャストさんを探す場合は、左下の「呼ぶ」から「グループTOLA」ボタンからチェック！
自分好みのキャストさんを探したい場合は、「探す」から「♥いいね（チャットルーム作成）」からメッセージでお話ししてみてください。

自己紹介の設定をしていただくと、キャストさんが安心して気軽にメッセージも送りやすくなり、色々お話し出来る機会が増えるかと思います♪
設定は、マイページ＞プロフィール編集＞プロフィール詳細編集から登録ができます！

メッセージで親交を深めたり、直接オーダーでランダムに都合がつくキャストさんを呼ぶことが出来ますので宜しくお願い致しますm(__)m

お問い合わせはチャットルーム「TOLA 運営局　お問合せ用」、またはTOLAゲスト専用LINEにて受付ておりますのでお気軽にご連絡下さい♪
ゲスト受付LINE<a href="https://lin.ee/n3AU1Ip target="_blank>「ゲスト専用LINE」</a>へ
`,
      },
      tx,
    );
  } else if (user.userType === 'cast') {
    await systemMessageToUser(
      user.id,
      {
        withUnread: true,
        content: `【TOLA】にご登録いただきありがとうございます❣

現在、仮登録状況となり、本登録には身分証明書を提出するとアカウント開設になります。💖

作業時間は5分程度で完了致します💖

まずは下記より「顔写真付きの身分証明書」をアップロードしてください。
<a href="/cast/identity_check" class="form_link">顔写真付きの身分証明書のアップロードはこちら</a>

身分証明書をアップロード完了した連絡や、
何か不明点などありましたら
「TOLA 運営局　お問合せ用」からご連絡ください🙇‍♀️🙇‍♂️

週2回で200万円稼げる、TOLA活動のスタートはもう少しで設定完了ですよ😄
`,
      },
      tx,
    );
  }

  if (!config.auto_message_send_custome) return;

  const inviter = await loadInviter(user, tx);
  if (!inviter || user.userType !== 'customer') return;

  const trialPoints = config.customer_start_credits_invited;
  const expiry = lSlashDate(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000));

  const inviteeIntro = `${user.nickName} さん

${inviter.nickName} さんからご紹介いただきましたので、特別特典のお試しポイント${trialPoints}Pを付与させていただきました。
ポイントは「マイページ」の「ポイント履歴・領収書」よりご確認いただけますのでお手隙の際にご確認下さい。

こちらはグループTOLAまたは個TOLAの利用ポイント${trialPoints}P分としてご利用いただけますので、ぜひお楽しみください！
お試しポイントの使用期限は14日間となり、${expiry}に無効となりますのでご注意ください。
※お試しポイントでのギフトのご利用（ステッカーのプレゼント）はお控えください。

また、実際にご利用いただく際にはクレジットカードの登録が必要となりますこと予めご了承ください。
`;

  const rule = await targetRewardingRule(inviter, 'customer', 'fixed_steps', tx);

  if (inviter.userType === 'customer') {
    await systemMessageToUser(user.id, { withUnread: true, content: inviteeIntro }, tx);
    if (rule?.payout) {
      await systemMessageToUser(
        inviter.id,
        {
          withUnread: true,
          content: `${inviter.nickName} さん

${user.nickName} さんを【TOLA】にご紹介いただきありがとうございました！
${user.nickName} さんに紹介ゲスト特典のお試しポイント${trialPoints}Pを付与させていただきました。

 ${user.nickName}さんが3回ご利用いただいたタイミングで、${inviter.nickName} さんに${rule.payout}Pの紹介ポイントを付与させていただきます。
※その際にはまた改めてご連絡させていただきます。

何かご不明点などございましたらお気軽にご連絡下さい。
`,
        },
        tx,
      );
    }
  } else if (inviter.userType === 'inviter') {
    await systemMessageToUser(user.id, { withUnread: true, content: inviteeIntro }, tx);
    await systemMessageToUser(
      inviter.id,
      {
        withUnread: true,
        content: `${inviter.nickName} さん

${user.nickName} さんを【TOLA】にご紹介いただきありがとうございました！
${user.nickName} さんに紹介ゲスト特典のお試しポイント${trialPoints}Pを付与させていただきました。

${user.nickName} さんが初めて3回ご利用されたタイミングで、${inviter.nickName} さんに${rule?.payout}の紹介ポイントを付与させていただきますのでその際にはまた改めてご連絡させていただきます。

また、今後${user.nickName} さんがご利用になられたポイントの2%をポイントバックさせていただきます。
※キャンペーン中は2%以上のポイントバックになる場合もございます。

何かご不明点などございましたらお気軽にご連絡下さい。
`,
      },
      tx,
    );
  } else if (inviter.userType === 'cast') {
    await systemMessageToUser(user.id, { withUnread: true, content: inviteeIntro }, tx);
    await systemMessageToUser(
      inviter.id,
      {
        withUnread: true,
        content: `${inviter.nickName} さん

${user.nickName} さんを【TOLA】にご紹介いただきありがとうございました！
${user.nickName} さんに紹介ゲスト特典のお試しポイント${trialPoints}Pを付与させていただきました。

${user.nickName} さんが3回ご利用されたタイミングで、${inviter.nickName} さんに${rule?.payout}Pの紹介ポイントを付与させていただきますのでその際にはまた改めてご連絡させていただきます。

また、今後${user.nickName} さんがご利用になられたポイントの3%をポイントバックさせていただきます。
※キャンペーン中は3%以上のポイントバックになる場合もございます。

何かご不明点などございましたらお気軽にご連絡下さい。
`,
      },
      tx,
    );
    await systemMessageToAdmin(
      {
        withUnread: true,
        content: `TOLA運営局の方へ
以下のメッセージを${inviter.id} : ${inviter.nickName} さんにキャスト専用公式LINEアカウントから送ってください。
----------------------------------------
${inviter.nickName} さん

${user.nickName} さんを【TOLA】にご紹介いただきありがとうございました✨
${user.nickName} さんに紹介ゲスト特典のお試しポイント${trialPoints}Pを付与させていただきました。

${user.nickName} さんが3回【TOLA】をご利用いただいたら、${inviter.nickName} さんに${rule?.payout}Pの紹介ポイントを付与させていただきますのでその際にはまた改めてご連絡します(^^)

また、今後${user.nickName} さんがご利用になられたポイントの3%をポイントバックさせていただきます♪
※キャンペーン中は3%以上のポイントバックになる場合もございます！

`,
      },
      tx,
    );
  }
}

/** AutoSendMessage.invite_meeting_message */
export async function inviteMeetingMessage(
  user: MessageUser,
  point: number,
  count: number,
  tx?: Tx,
): Promise<void> {
  const inviter = await loadInviter(user, tx);
  if (!inviter) return;
  const countText = count === 1 ? '初めて' : `${count}回`;

  if (isGuest(user.userType)) {
    const guestBody = (pointsLocation: string) => `     ${inviter.nickName} さん

    ご紹介いただいた${user.nickName} さんが${countText}【TOLA】をご利用になられましたので、${point}Pの紹介ポイントを付与させていただきました。
    ご紹介いただき誠にありがとうございます。
    ポイントは${pointsLocation}よりご確認いただけますのでお手隙の際にご確認下さい。
    但し、紹介された方の不正なご利用が発覚した、決済時のカード不備の場合に付与させていただいた紹介ポイントを取り消しさせていただきますので、予めご了承ください。

    今後とも何卒よろしくお願いいたします。
`;

    if (inviter.userType === 'customer' || inviter.userType === 'inviter') {
      await systemMessageToUser(
        inviter.id,
        { withUnread: true, content: guestBody('「マイページ」の「ポイント履歴・領収書」') },
        tx,
      );
    } else if (inviter.userType === 'cast') {
      await systemMessageToUser(
        inviter.id,
        { withUnread: true, content: guestBody('「マイページ」ー「売上履歴一覧」') },
        tx,
      );
      await systemMessageToAdmin(
        {
          withUnread: true,
          content: `TOLA運営局の方へ
以下のメッセージを${inviter.id} : ${inviter.nickName} さんにキャスト専用公式LINEアカウントから送ってください。
----------------------------------------
ご紹介いただいた${user.nickName} さんが${countText}【TOLA】をご利用になられましたので、${point}Pの紹介ポイントを付与させていただきました。
ご紹介いただき誠にありがとうございます。
ポイントは「マイページ」ー「売上履歴一覧」よりご確認いただけますのでお手隙の際にご確認下さい。
但し、紹介された方の不正なご利用が発覚した際には、付与させていただいた紹介ポイントを取り消しさせていただきますので、予めご了承ください。

今後とも何卒よろしくお願いいたします。
`,
        },
        tx,
      );
    }
  }

  if (user.userType === 'cast') {
    if (inviter.userType === 'customer') {
      await systemMessageToUser(
        inviter.id,
        {
          withUnread: true,
          content: `    ${inviter.nickName} さん

    ${user.nickName} さんが${countText}【TOLA】に参加されましたので、ご紹介者の${inviter.nickName} さん含め、双方に${point}Pの紹介ポイントを付与させていただきました。
    ご紹介いただき誠にありがとうございます。
    ポイントは「マイページ」の「ポイント履歴・領収書」よりご確認いただけますのでお手隙の際にご確認下さい。
    但し、紹介された方の不正なご利用が発覚した際には、付与させていただいた紹介ポイントを取り消しさせていただきますので、予めご了承ください。

    今後とも何卒よろしくお願いいたします。
`,
        },
        tx,
      );
    } else if (inviter.userType === 'inviter') {
      await systemMessageToUser(
        inviter.id,
        {
          withUnread: true,
          content: `    ${inviter.nickName} さん

    ご紹介いただいた${user.nickName} さんが${countText}【TOLA】に参加されましたので、${point}Pの紹介ポイントを付与させていただきました。
    ご紹介いただき誠にありがとうございます。
    ポイントは「マイページ」の「ポイント履歴・領収書」よりご確認いただけますのでお手隙の際にご確認下さい。
    但し、紹介された方の不正なご利用が発覚した際には、付与させていただいた紹介ポイントを取り消しさせていただきますので、予めご了承ください。

    今後とも何卒よろしくお願いいたします。
`,
        },
        tx,
      );
    } else if (inviter.userType === 'cast') {
      const castBody = `	 ${user.nickName} さんが${countText}【TOLA】に参加されましたので、ご紹介者の${inviter.nickName} さん含め、双方に${point}Pの紹介ポイントを付与させていただきました。

    【TOLA】では、ご紹介でもポイントを獲得できますので、
    ご推薦できるゲスト・キャストの方をご存じでしたらマイページの「友達を紹介する」より是非ご紹介下さい。
    ※ゲストさん紹介の場合には、紹介ポイント＋ゲストさんがご利用になられたポイントの3%をポイントバックさせていただきます。

    ご質問やご不明点などございましたらお気軽にご連絡下さい。
`;
      await systemMessageToUser(inviter.id, { withUnread: true, content: castBody }, tx);
      await systemMessageToAdmin(
        {
          withUnread: true,
          content: `    TOLA運営局の方へ
    以下のメッセージを${inviter.id} : ${inviter.nickName} さんにキャスト専用公式LINEアカウントから送ってください。
    ----------------------------------------
    ${user.nickName} さんが${countText}【TOLA】に参加されましたので、ご紹介者の${inviter.nickName} さん含め、双方に${point}Pの紹介ポイントを付与させていただきました。

    【TOLA】では、ご紹介でもポイントを獲得できますので、 今後もご推薦できるゲスト・キャストの方がいましたら是非ご紹介下さい✨
    ※ゲストさん紹介の場合には、紹介ポイント＋ゲストさんがご利用になられたポイントの3%をポイントバックさせていただきます！
    今後もTOLAをよろしくお願いしますm(__)m

`,
        },
        tx,
      );
      await systemMessageToUser(
        user.id,
        {
          withUnread: true,
          content: `    ${user.nickName} さんが${countText}【TOLA】に参加されましたので、ご紹介者の${inviter.nickName} さん含め、双方に${point}Pの紹介ポイントを付与させていただきました。

    【TOLA】では、ご紹介でもポイントを獲得できますので、
    ご推薦できるゲスト・キャストの方をご存じでしたらマイページの「友達を紹介する」より是非ご紹介下さい。
    ※ゲストさん紹介の場合には、紹介ポイント＋ゲストさんがご利用になられたポイントの3%をポイントバックさせていただきます。

    ご質問やご不明点などございましたらお気軽にご連絡下さい。
`,
        },
        tx,
      );
      await systemMessageToAdmin(
        {
          withUnread: true,
          content: `    TOLA運営局の方へ
    以下のメッセージを${user.id} : ${user.nickName}さんにキャスト専用公式LINEアカウントから送ってください。
    ----------------------------------------
    ${user.nickName} さんが${countText}【TOLA】に参加されましたので、ご紹介者の${inviter.nickName} さん含め、双方に${point}Pの紹介ポイントを付与させていただきました。

    【TOLA】では、ご紹介でもポイントを獲得できますので、
    ご推薦できるゲスト・キャストの方をご存じでしたらマイページの「友達を紹介する」より是非ご紹介下さい。
    ※ゲストさん紹介の場合には、紹介ポイント＋ゲストさんがご利用になられたポイントの3%をポイントバックさせていただきます！

    ご質問やご不明点などございましたらお気軽にご連絡下さい。
`,
        },
        tx,
      );
    }
  }
}

/** AutoSendMessage.receive_review */
export async function receiveReviewMessage(
  review: {
    stars: number;
    comment: string | null;
    reviewee: MessageUser;
    reviewer: MessageUser;
  },
  tx?: Tx,
): Promise<void> {
  const { reviewee: user, reviewer, stars } = review;

  if (isGuest(user.userType)) {
    if (stars === 5) {
      await systemMessageToUser(
        user.id,
        {
          withUnread: true,
          content: `${user.nickName} さん
この度はご利用いただき誠にありがとうございました。
キャストの${reviewer.nickName} さんより、TOLA運営局に今回の合流に関して御礼の連絡を頂きました。

キャストさんに対して御配慮頂いて誠にありがとうございます。
今後とも何卒よろしくお願いいたします。
`,
        },
        tx,
      );
    }

    // replies to cast for their review, indexed by star rating
    const reviewReplies = [
      `${user.nickName} さんへのゲストレビューを報告頂き、星1を確認致しました。
大変だったようですが、頑張っていただきありがとうございます🙇
レビューですが評価基準があり、
星${stars}ですと「凍結してほしいぐらい印象が悪い」という評価になります。
こちらデータベースに入れておきます。
`,
      `${user.nickName} さんへのゲストレビューを報告頂き、星2を確認致しました。
大変だったようですが、頑張っていただきありがとうございます🙇
レビューですが評価基準がありまして、星${stars}ですと「印象があまり良くなくて今後も参加したくない」という評価になります。
こちらデータベースに入れておきます。
`,
      `${user.nickName} さんへのゲストレビューを報告頂き、星3を確認致しました。
良いゲストさんでよかったです。

こちらデータベースに入れておきます。
`,
      `${user.nickName} さんへのゲストレビューを報告頂き、星4を確認致しました。
良いゲストさんでよかったです！
ぜひまた参加して下さい。

こちらデータベースに入れておきます。
`,
      `${user.nickName} さんへのゲストレビューを報告頂き、星5を確認致しました。
良いゲストさんと素晴らしい時間を過ごして頂けて良かったです。
ぜひまた参加して下さい。

こちらデータベースに入れておきます。
`,
    ];

    await systemMessageToUser(reviewer.id, { withUnread: true, content: reviewReplies[stars - 1] }, tx);
    await systemMessageToAdmin(
      {
        withUnread: true,
        content: `TOLA運営局の方へ
${user.id} : ${user.nickName}さんの以下のレビューが、キャストの${reviewer.id} : ${reviewer.nickName}さんから届いたのでゲストレビューをチェックしましょう。
----------------------------------------
ゲストの${user.nickName} さんへの星${stars}の評価レビューが届きました🥰
${stars <= 3 ? 'レビューがない場合には必ず確認しましょう。' : 'リピートではない場合にはどんな方だったのか必ず確認しましょう。'}
----------------------------------------
${reviewReplies[stars - 1]}

こちら下記の内容データベースに入れて、運営の参考にさせて頂きます🙇‍♀️🙇‍♂️
レビュー内容：
${review.comment?.length ? review.comment : '[空]'}
`,
      },
      tx,
    );
  } else if (user.userType === 'cast') {
    const badReviewText = `【キャストには連絡不要】
こちら非常にレビューが悪いのでキャストには連絡しないで、キャストのオーダーへのレビューを確認しましょう。

【ゲストにレビュー内容がない場合に確認】
${reviewer.nickName} さん
非常にレビューが悪かったので、参加したキャストさんに不備がありましたか、心配してご連絡させて致しました。いかがされましたでしょうか？
`;
    const normalReviewText = `【キャストには連絡不要】
キャストさんに連絡するほどのレビューじゃないのでレビュー内容に注意しましょう。
`;
    const goodReviewText = `${user.nickName} さん
今回はオーダーに参加頂き、ありがとうございます。

  ゲストの${reviewer.nickName} さんから高評価レビューが届きました🥰

  充実したお時間を【TOLA】でお過ごしいただけて嬉しいです♪💖

  これからもよろしくお願いします(^^)
`;
    const byStars =
      stars === 1 || stars === 2 ? badReviewText : stars === 3 || stars === 4 ? normalReviewText : goodReviewText;

    await systemMessageToAdmin(
      {
        withUnread: true,
        content: `TOLA運営局の方へ
以下のメッセージを${user.id} : ${user.nickName} さんにキャスト専用公式LINEアカウントから送ってください。（ゲストID： ${reviewer.id}  ${reviewer.nickName} さんより）
----------------------------------------
ゲストの${reviewer.nickName} さんから星${stars}の高評価レビューが届きました🥰
----------------------------------------
${byStars}
ゲストからのレビュー内容：
${review.comment?.length ? review.comment : '[空]'}
`,
      },
      tx,
    );
  }
}

/** AutoSendMessage.meeting_complete_attendance_for_cast */
export async function meetingCompleteAttendanceForCast(
  user: MessageUser,
  point: number,
  meeting: { plannedStartTime: Date },
  tx?: Tx,
): Promise<void> {
  const body = `        ${l(meeting.plannedStartTime)}のオーダーにご参加いただき、ありがとうございました(^^)

        ご参加いただいたオーダーの獲得ポイントを24時間ゲストに確認されて処理を決済致し、${point}Pを獲得されました！
        詳細は「マイページ」ー「売上履歴」からご確認出来ますのでお手隙の再にご確認下さい。

        なお、決済後に分かるのですが、ゲストのクレジットカードに不備等ありましたらポイントを一旦戻して頂くことがございます。
        何かご不明点等ありましたらお気軽にご連絡下さい。
`;
  await systemMessageToUser(user.id, { withUnread: true, content: body }, tx);
  await systemMessageToAdmin(
    {
      withUnread: true,
      content: `        TOLA運営局の方へ
        以下のメッセージを${user.id}:${user.nickName} さんにキャスト専用公式LINEアカウントから送ってください。
        ----------------------------------------
${body}`,
    },
    tx,
  );
}

/** AutoSendMessage.review_service_fee_reset_message */
export async function reviewServiceFeeResetMessage(
  user: MessageUser,
  reviewer: MessageUser,
  stars: number,
  fromBack: number,
  toBack: number,
  tx?: Tx,
): Promise<void> {
  // the original divides permille by 10 with Integer#/ → integer percent
  const fromPercent = Math.floor(fromBack / 10);
  const toPercent = Math.floor(toBack / 10);

  await systemMessageToUser(
    user.id,
    {
      withUnread: true,
      content: `        今回はオーダーにエントリーいただきありがとうございました！

        ゲストの${reviewer.nickName} さんから星${stars}の高評価レビューが届きました。

        こちらのレビューによりポイントバック率UPの条件を達成されましたので、ポイントバック率を現在の${fromPercent}%から${toPercent}%にUPさせていただきます。
        おめでとうございます！

        これからも素敵なお時間をお楽しみいただけるよう、TOLA運営局一同尽力させていただきますので今後ともよろしくお願い致します。
`,
    },
    tx,
  );
  await systemMessageToAdmin(
    {
      withUnread: true,
      content: `        TOLA運営局の方へ
        以下のメッセージを${user.id} : ${user.nickName} さんにキャスト専用公式LINEアカウントから送ってください。
        ----------------------------------------
        今回はオーダーにエントリーいただきありがとうございました！

        ゲストの${reviewer.nickName} さんから星${stars}の高評価レビューいただいたのでポイントバック率が${fromPercent}%から${toPercent}%にUPしました✨
        おめでとうございます！

        これからもよろしくお願いします(^^♪
`,
    },
    tx,
  );
}

/** AutoSendMessage.first_meeting_send_message */
export async function firstMeetingSendMessage(user: MessageUser, tx?: Tx): Promise<void> {
  await systemMessageToUser(
    user.id,
    {
      withUnread: true,
      content: `        初【TOLA】確定おめでとうございます！＾＾

        初回は不安なこともあると思いますが、
        高倍率から合格された【TOLA】のキャストさんとして自信を持って参加してくださいっ♪
        TOLA運営局に何かありましたらすぐにご連絡ください。

        気遣いのある対応で、
        ゲストさんを盛り上げ楽しい飲み会に出来れば解散後のレビュー評価が良いこと間違いなしです！
        最初にしっかり挨拶して第一印象を良くすることで、その後もいい流れになるはず！
        是非細かい気遣いをプラスしてあなたの魅力を存分に発揮してください。

        ☆重要ポイント☆
        ・合流のタイミングでの「合流開始しますね」
        ・終わった時の「解散しますね」
        上記2つは必ずゲストさんの前で口頭確認をしてボタンを押すようにしてください。

        明朗会計でゲストの方にも納得いただき、参加から解散までお互い気持ちよく過ごしていただきたいので、会計後に席を立つときは終了かどうかの確認を必ず徹底してください。
        ※こちらは【TOLA】で徹底したい大切なポイントですので、定期的にゲストの方に出来ていたかどうかを確認させていただいております。

        また、サービス利用時の同意書にもございますが、金銭の直接の授受・次回は直接現金で会う等々の禁止事項は大きな問題になりますので避けて下さい。
`,
    },
    tx,
  );
  await systemMessageToAdmin(
    {
      withUnread: true,
      content: `        TOLA運営局の方へ
        以下のメッセージを${user.id} : ${user.nickName} さんにキャスト専用公式LINEアカウントから送ってください。
        ----------------------------------------
        初【TOLA】確定おめでとうございます！＾＾

        初回は不安なんこともあると思いますが、
        高倍率から合格された【TOLA】のキャストさんとして自信を持って参加してくださいっ♪
        TOLA運営局に何かありましたらすぐにご連絡ください。

        気遣いのある対応で、
        ゲストさんを盛り上げ楽しい飲み会に出来れば解散後のレビュー評価が良いこと間違いなしです！
        最初にしっかり挨拶して第一印象を良くすることで、その後もいい流れになるはず！
        是非細かい気遣いをプラスしてあなたの魅力を存分に発揮してください。

        ☆重要ポイント☆
        ・合流のタイミングでの「合流開始しますね」
        ・終わった時の「解散しますね」
        上記2つは必ずゲストさんの前で口頭確認をしてボタンを押すようにしてください。

        明朗会計でゲストの方にも納得いただき、参加から解散までお互い気持ちよく過ごしていただきたいので、会計後に席を立つときは終了かどうかの確認を必ず徹底してください。
        ※こちらは【TOLA】で徹底したい大切なポイントですので、定期的にゲストの方に出来ていたかどうかを確認させていただいております。

        また、サービス利用時の同意書にもございますが、金銭の直接の授受・次回は直接現金で会う等々の禁止事項は大きな問題になりますので避けて下さい。
`,
    },
    tx,
  );
}

/** AutoSendMessage.first_meeting_end_send_message */
export async function firstMeetingEndSendMessage(user: MessageUser, tx?: Tx): Promise<void> {
  const body = `        初【TOLA】お疲れさまでした！
        初めての参加はいかがでしたでしょうか？
        安心感やセキュリティNo1の【TOLA】が最も重視していることはキャストさんが安全に実施できることです。
        ゲストさんのデータベースを更新致しますので、ゲストのレビューをお願い致します。

        初回で慣れないこともあったかと思いますので、率直な感想をお聞かせください。
        嬉しかった事や疑問に思った事・不安に感じた事など何でも構いません！

        細かなことでもサポートさせていただきますので、何かございましたらお気軽にご連絡下さい。
`;
  await systemMessageToUser(user.id, { withUnread: true, content: body }, tx);
  await systemMessageToAdmin(
    {
      withUnread: true,
      content: `        TOLA運営局の方へ
        以下のメッセージを${user.id} : ${user.nickName} さんにキャスト専用公式LINEアカウントから送ってください。
        ----------------------------------------
${body}`,
    },
    tx,
  );
}

/** AutoSendMessage.inviter_turnover */
export async function inviterTurnoverMessage(inviterId: number, points: number, tx?: Tx): Promise<void> {
  await systemMessageToUser(
    inviterId,
    {
      withUnread: true,
      withBroadcast: true,
      content: `紹介して頂いたゲストさん・キャストさんがTOLAをご利用致しましたので、合流の紹介ポイント ${numberToCurrencyP(points)}を獲得致しました。
ゲストさんはマイページの『ポイント履歴・領収書』、
キャストさんはマイページの『売上履歴一覧』をご確認くださいませ。
`,
    },
    tx,
  );
}

/** AutoSendMessage.inform_participant_of_invitation_share_bonus */
export async function informParticipantOfInvitationShareBonus(
  inviteeId: number,
  inviterNickName: string,
  credits: number,
  tx?: Tx,
): Promise<void> {
  await systemMessageToUser(
    inviteeId,
    {
      withUnread: false,
      withBroadcast: false,
      content: `＊＊＊＊＊＊
TOLAを御利用頂きましたので、TOLAを紹介して頂いた${inviterNickName} さんに合流の紹介ポイント ${numberToCurrencyP(credits)}を名前を伏せてプレゼント致しました🎁

TOLAでは紹介ポイント、永久バック💖
『友達紹介』はマイページから❤️
＊＊＊＊＊＊
`,
    },
    tx,
  );
}

/** AutoSendMessage.inform_participant_of_missing_invitation_share_bonus */
export async function informParticipantOfMissingInvitationShareBonus(inviteeId: number, tx?: Tx): Promise<void> {
  await systemMessageToUser(
    inviteeId,
    {
      withUnread: false,
      withBroadcast: false,
      content: `＊＊＊＊＊＊
TOLAを御利用頂きましたので、紹介者がいる場合には紹介ポイントを名前を伏せてプレゼント致します🎁

TOLAでは紹介ポイント、永久バック💖
『友達紹介』はマイページから❤️
＊＊＊＊＊＊
`,
    },
    tx,
  );
}

/**
 * The master/apprentice ("師弟") announcement, shared by RewardPatron and the two
 * meeting-open paths. The original inlined it three times with small wording
 * differences; the two live variants are kept distinct below.
 */
export function patronEstablishedMessage(castNickName: string, ownerNickName: string): string {
  return `決済完了致しましたので、
師弟システム確定㊗️

未経験の ${castNickName}さん が初利用ですので

師匠として、${ownerNickName}さん、
弟子として、${castNickName}さん、

が設定されました🎉

次回以降、弟子キャストさんがオーダー実施すると、
別途ポイント${PATRON_SHARE_PERCENT}％ が ${ownerNickName}さんに入ります。

ゲストさんは今後メッセージ等で優しくサポートしてあげて下さいませ🙇‍♂️🙇

キャストさんは師匠ゲストさんに初回教わったオーダー参加を今後に活かしましょう‼️

※キャストさんの獲得とは別途、ゲストさんへcocoよりプレゼントとなりますので、キャストさんのポイント自体が減ることはございません。

※師弟関係は ${ownerNickName}さんが他のキャスト含めて2ヶ月cocoオーダーをご利用しないと解除されてしまうのでご注意下さい⚠️
`;
}

export function patronRewardMessage(castNickName: string, patronNickName: string, amount: number): string {
  return `弟子キャスト${castNickName}さんがcocoをご利用致しましたので、
師匠の${patronNickName}さんが師匠ポイント ${numberToCurrencyP(amount)}を獲得致しました🎁

ゲストさんはマイページの『ポイント履歴・領収書』をご確認くださいませ。
※師弟関係は${patronNickName}さんが2ヶ月他のキャスト含めてcocoをご利用しないと解除されてしまうのでご注意下さい！
`;
}
