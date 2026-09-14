import nodemailer, { type Transporter } from 'nodemailer';
import { AN, l, lDate, numberToCredits } from '@/lib';
import { env, simulateExternalCalls } from '@/server/config/env';
import { logger } from '@/server/lib/logger';
import { prisma } from '@/server/lib/prisma';

/**
 * Replacement for the four ActionMailer classes (UsersMailer, AdminMailer,
 * AgreementMailer, ApplicationMailer).
 *
 * Templates are inline here rather than in separate view files: there are only a
 * handful, and keeping the subject next to the body makes the set easy to audit.
 */

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      ...(env.smtp.user ? { auth: { user: env.smtp.user, pass: env.smtp.password } } : {}),
    });
  }
  return transporter;
}

export interface MailAttachment {
  filename: string;
  path?: string;
  content?: Buffer;
}

async function deliver(options: {
  to: string | string[];
  subject: string;
  text: string;
  attachments?: MailAttachment[];
}): Promise<void> {
  const recipients = Array.isArray(options.to) ? options.to : [options.to];
  if (!recipients.filter(Boolean).length) {
    logger.warn({ subject: options.subject }, 'mailer: no recipients, dropping mail');
    return;
  }

  if (simulateExternalCalls && !env.smtp.host) {
    logger.info({ to: recipients, subject: options.subject }, 'mailer: simulated');
    return;
  }

  await getTransporter().sendMail({
    from: env.smtp.from,
    to: recipients.join(', '),
    subject: options.subject,
    text: options.text,
    attachments: options.attachments,
  });
}

const operatorAddresses = () => env.adminEmailAddresses;

/** UsersMailer#password_restoration */
export async function sendPasswordRestoration(userId: number, restorationToken: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.email) return;

  const url = `${env.hostPrefix}/password_reset/${restorationToken}`;
  await deliver({
    to: user.email,
    subject: `【${AN.Short}】パスワード再設定のご案内`,
    text: `${user.nickName} さん

${AN.Full}をご利用いただきありがとうございます。

下記のリンクからパスワードの再設定をお願いいたします。
${url}

※このリンクの有効期限は2時間です。
※このメールに心当たりがない場合は破棄してください。

${AN.Company}
お問い合わせ: ${AN.ContactMail}
`,
  });
}

/** AdminMailer#pre_charge_failed_meeting */
export async function sendPreChargeFailedMeeting(meetingId: number): Promise<void> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { owner: { select: { id: true, nickName: true, email: true } }, area: true },
  });
  if (!meeting) return;

  await deliver({
    to: operatorAddresses(),
    subject: `【${AN.Short}】事前決済の失敗（オーダー ${meeting.id}）`,
    text: `オーダー ${meeting.id} の事前決済が失敗しました。

ゲスト: ${meeting.owner.nickName} (ID: ${meeting.owner.id})
場所: ${meeting.areaName || meeting.area.name}
開始: ${l(meeting.plannedStartTime)}
募集人数: ${meeting.neededPersonCount}

管理画面よりご確認ください。
`,
  });
}

/** AdminMailer#credit_card_registration_success */
export async function sendCardRegistrationSuccess(userId: number): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  await deliver({
    to: operatorAddresses(),
    subject: `【${AN.Short}】カード登録成功 (ユーザー ${user.id})`,
    text: `カード登録が完了しました。

ユーザー: ${user.nickName} (ID: ${user.id})
メール: ${user.email ?? '(なし)'}
電話: ${user.phone ?? '(なし)'}
日時: ${l(new Date())}
`,
  });
}

/** AdminMailer#credit_card_registration_failure */
export async function sendCardRegistrationFailure(params: {
  userId: number | null;
  errorMessage: string;
  errorCode: string | null;
}): Promise<void> {
  const user = params.userId ? await prisma.user.findUnique({ where: { id: params.userId } }) : null;

  await deliver({
    to: operatorAddresses(),
    subject: `【${AN.Short}】カード登録失敗${user ? ` (ユーザー ${user.id})` : ''}`,
    text: `カード登録に失敗しました。

ユーザー: ${user ? `${user.nickName} (ID: ${user.id})` : '(特定できませんでした)'}
エラー: ${params.errorMessage}
コード: ${params.errorCode ?? '(なし)'}
日時: ${l(new Date())}
`,
  });
}

/** AdminMailer#interview_request */
export async function sendInterviewRequest(userId: number): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { businessArea: true },
  });
  if (!user) return;

  await deliver({
    to: operatorAddresses(),
    subject: `【${AN.Short}】面接希望 (キャスト ${user.id})`,
    text: `キャストから面接の希望が届きました。

キャスト: ${user.nickName} (ID: ${user.id})
支店: ${user.businessArea?.name ?? '(未設定)'}
電話: ${user.phone ?? '(なし)'}
登録日: ${lDate(user.joinDate)}
`,
  });
}

/** AdminMailer#new_meeting_notification */
export async function sendNewMeetingNotification(meetingId: number): Promise<void> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { owner: { select: { id: true, nickName: true } }, area: true, castRank: true },
  });
  if (!meeting) return;

  await deliver({
    to: operatorAddresses(),
    subject: `【${AN.Short}】新しいオーダー (${meeting.id})`,
    text: `新しいオーダーが登録されました。

ゲスト: ${meeting.owner.nickName} (ID: ${meeting.owner.id})
料金メニュー: ${meeting.castRank?.name ?? '(なし)'}
場所: ${meeting.areaName || meeting.area.name}
開始: ${l(meeting.plannedStartTime)}
終了: ${l(meeting.plannedEndTime)}
募集人数: ${meeting.neededPersonCount}
`,
  });
}

/** AdminMailer#inquiry_notification */
export async function sendInquiryNotification(messageId: number): Promise<void> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      sender: { select: { id: true, nickName: true, userType: true } },
      conversation: { select: { id: true, name: true, category: true } },
    },
  });
  if (!message) return;

  await deliver({
    to: operatorAddresses(),
    subject: `【${AN.Short}】お問い合わせ (${message.sender.nickName})`,
    text: `お問い合わせが届きました。

送信者: ${message.sender.nickName} (ID: ${message.sender.id}, ${message.sender.userType})
チャットルーム: ${message.conversation.name} (ID: ${message.conversation.id})
日時: ${l(message.sentAt ?? message.createdAt)}

--------
${message.content}
--------

管理画面よりご返信ください。
`,
  });
}

/** AgreementMailer#agreement_mail_send — the signed contract images. */
export async function sendAgreementMail(
  userId: number,
  files: Array<{ name: string; path: string }>,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { businessArea: true },
  });
  if (!user) return;

  // the original zipped the images; one attachment per file is equivalent and
  // easier for the operators to open
  await deliver({
    to: operatorAddresses().length ? operatorAddresses() : AN.SendMailTo,
    subject: `【${AN.Short}】同意書の提出 (キャスト ${user.id})`,
    text: `キャストから同意書が提出されました。

キャスト: ${user.nickName} (ID: ${user.id})
支店: ${user.businessArea?.name ?? '(未設定)'}
電話: ${user.phone ?? '(なし)'}
提出日時: ${l(new Date())}

添付ファイルをご確認のうえ、管理画面でアクセス権限を更新してください。
`,
    attachments: files.map((file) => ({ filename: file.name, path: file.path })),
  });
}

/** Dispatch table for the queued `ActionMailer` jobs. */
export async function deliverQueuedMail(mailer: string, args: Record<string, unknown>): Promise<void> {
  switch (mailer) {
    case 'UsersMailer.password_restoration':
      await sendPasswordRestoration(args.userId as number, args.restorationToken as string);
      return;
    case 'AdminMailer.pre_charge_failed_meeting':
      await sendPreChargeFailedMeeting(args.meetingId as number);
      return;
    case 'AdminMailer.credit_card_registration_success':
      await sendCardRegistrationSuccess(args.userId as number);
      return;
    case 'AdminMailer.credit_card_registration_failure':
      await sendCardRegistrationFailure({
        userId: (args.userId as number | null) ?? null,
        errorMessage: (args.errorMessage as string) ?? '',
        errorCode: (args.errorCode as string | null) ?? null,
      });
      return;
    case 'AdminMailer.interview_request':
      await sendInterviewRequest(args.userId as number);
      return;
    case 'AdminMailer.new_meeting_notification':
      await sendNewMeetingNotification(args.meetingId as number);
      return;
    case 'AdminMailer.inquiry_notification':
      await sendInquiryNotification(args.messageId as number);
      return;
    case 'AgreementMailer.agreement_mail_send':
      await sendAgreementMail(
        args.userId as number,
        (args.files as Array<{ name: string; path: string }>) ?? [],
      );
      return;
    default:
      logger.warn({ mailer }, 'deliverQueuedMail: unknown mailer');
  }
}

export { numberToCredits };
