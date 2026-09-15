import { idiv, numberToCurrencyP, PATRON_SHARE_PERMILLE, type MeetingCosts } from '@/lib';
import type { RewardingRule } from '@prisma/client';
import { prisma, type Tx } from '@/server/lib/prisma';
import { InteractorFailure } from '@/server/lib/errors';
import { logger } from '@/server/lib/logger';
import { createCreditTransaction } from '@/server/services/credits';
import { systemMessageToAdmin, systemMessageToUser } from '@/server/services/messages';
import { normalisedRulesForUser } from '@/server/services/rewarding-rules';
import {
  informParticipantOfInvitationShareBonus,
  informParticipantOfMissingInvitationShareBonus,
  inviteMeetingMessage,
  inviterTurnoverMessage,
  patronEstablishedMessage,
  patronRewardMessage,
  reviewServiceFeeResetMessage,
} from '@/server/services/auto-send-message';
import { attendanceEarnings, calculateMeetingCosts } from '@/server/services/meetings/costs';

/**
 * Ports the six reward interactors plus UpdateCastRepeatCounts.
 *
 * All of them follow the same shape: look up the RewardingRules that apply to a
 * user, then for each rule apply one of three policies.
 *
 *   fixed_steps     — a flat payout every `each` completed orders, at most `limit` times
 *   fixed_turnover  — a flat payout per `each` credits of turnover, catching up if behind
 *   relative_turnover — a permille share of this order's cost
 *
 * The `reason` strings are load-bearing: fixed_turnover and relative_turnover
 * count how often they have already paid out by matching on them with LIKE, so
 * the prefixes ([fs], [ft], [rt]) and wording must stay exactly as they are.
 */

async function makeTransaction(
  recipientId: number,
  amount: number,
  reason: string,
  category: 'reward' | 'inviter' | 'inviter_cast' | 'inviter_profit_share' | 'inviter_cast_profit_share' | 'patron_reward' | 'cast_reward',
  tx?: Tx,
): Promise<void> {
  await createCreditTransaction(
    { creditedUserId: recipientId, creditedAmount: amount, category, reason, withBalanceUpdates: true },
    tx,
  );
}

function ruleIsDisabled(rule: RewardingRule): boolean {
  return rule.limit === 0;
}

function withinLimit(rule: RewardingRule, nth: number): boolean {
  return rule.limit === null || nth <= rule.limit;
}

// --- RewardUsage -----------------------------------------------------------

/** RewardUsage — rewards the guest for using the service. */
export async function rewardUsage(meetingId: number, tx?: Tx): Promise<void> {
  const client = tx ?? prisma;
  const meeting = await client.meeting.findUnique({
    where: { id: meetingId },
    include: { owner: { include: { inviter: true } } },
  });
  if (!meeting) throw new InteractorFailure('No meeting given');
  if (meeting.status !== 'completed') throw new InteractorFailure('Meeting must be completed');

  const owner = meeting.owner;
  const rules = await normalisedRulesForUser(owner, 'usage', tx);
  if (!rules.length) return;

  for (const rule of rules) {
    // invitee_user_type is really the *inviter's* type (historical column name)
    if (rule.inviteeUserType && !owner.inviter) continue;
    if (rule.inviteeUserType && rule.inviteeUserType !== 'mandatory' && owner.inviter?.userType !== rule.inviteeUserType) {
      continue;
    }

    if (rule.policy === 'fixed_steps') {
      if (rule.payout > 0 && !ruleIsDisabled(rule)) {
        const completedMeetingsCount = await client.meeting.count({
          where: { ownerId: owner.id, status: 'completed' },
        });
        if (rule.each > 0 && completedMeetingsCount % rule.each === 0) {
          const nthPayout = idiv(completedMeetingsCount, rule.each);
          if (withinLimit(rule, nthPayout)) {
            await makeTransaction(
              owner.id,
              rule.payout,
              `[fs] Payment for ${completedMeetingsCount}th meeting of user ${owner.id}.`,
              'reward',
              tx,
            );
          }
        }
      }
    } else if (rule.policy === 'fixed_turnover') {
      if (rule.payout > 0 && !ruleIsDisabled(rule)) {
        const turnover = await client.creditTransaction.aggregate({
          where: { category: 'meeting', chargedUserId: owner.id },
          _sum: { chargedAmount: true },
        });
        const summedTurnover = turnover._sum.chargedAmount ?? 0;
        let currentPayoutCount = await client.creditTransaction.count({
          where: {
            category: 'reward',
            creditedUserId: owner.id,
            reason: { startsWith: `[ft] Reward for customer ${owner.id} ` },
          },
        });
        const entitledPayoutCount = rule.each > 0 ? idiv(summedTurnover, rule.each) : 0;
        while (currentPayoutCount < entitledPayoutCount) {
          if (rule.limit !== null && currentPayoutCount >= rule.limit) break;
          currentPayoutCount += 1;
          await makeTransaction(
            owner.id,
            rule.payout,
            `[ft] Reward for customer ${owner.id} for spending ${rule.each}P the ${currentPayoutCount}th time.`,
            'reward',
            tx,
          );
        }
      }
    } else if (rule.policy === 'relative_turnover') {
      // the original logs and skips: a share of the guest's own spend makes no sense
      logger.error(`Skipping rule ${rule.id}, relative_turnover not implemented.`);
    }
  }
}

// --- RewardAttendance ------------------------------------------------------

/** RewardAttendance — rewards each cast for attending. */
export async function rewardAttendance(meetingId: number, tx?: Tx): Promise<void> {
  const client = tx ?? prisma;
  const meeting = await client.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting) throw new InteractorFailure('No meeting given');
  if (meeting.status !== 'completed') throw new InteractorFailure('Meeting must be completed');

  const attendances = await client.castAttendance.findMany({
    where: { meetingId, role: { not: 'out' } },
    include: { user: { include: { inviter: true } } },
  });

  for (const attendance of attendances) {
    const cast = attendance.user;
    const rules = await normalisedRulesForUser(cast, 'attendance', tx);
    if (!rules.length) continue;

    for (const rule of rules) {
      if (rule.inviteeUserType && !cast.inviter) continue;
      if (rule.inviteeUserType && rule.inviteeUserType !== 'mandatory' && cast.inviter?.userType !== rule.inviteeUserType) {
        continue;
      }

      if (rule.policy === 'fixed_steps') {
        if (rule.payout > 0 && !ruleIsDisabled(rule)) {
          const completedMeetingsCount = await client.castAttendance.count({
            where: { userId: cast.id, role: { not: 'out' }, meeting: { status: 'completed' } },
          });
          if (rule.each > 0 && completedMeetingsCount % rule.each === 0) {
            const nthPayout = idiv(completedMeetingsCount, rule.each);
            if (withinLimit(rule, nthPayout)) {
              await makeTransaction(
                cast.id,
                rule.payout,
                `[fs] Payment for ${completedMeetingsCount}th meeting of user ${cast.id}.`,
                'reward',
                tx,
              );
            }
          }
        }
      } else if (rule.policy === 'fixed_turnover') {
        if (rule.payout > 0 && !ruleIsDisabled(rule)) {
          const turnover = await client.creditTransaction.aggregate({
            where: { category: 'meeting', creditedUserId: cast.id },
            _sum: { chargedAmount: true },
          });
          const summedTurnover = turnover._sum.chargedAmount ?? 0;
          let currentPayoutCount = await client.creditTransaction.count({
            where: {
              category: 'reward',
              creditedUserId: cast.id,
              reason: { startsWith: `[ft] Reward for cast ${cast.id} ` },
            },
          });
          const entitledPayoutCount = rule.each > 0 ? idiv(summedTurnover, rule.each) : 0;
          while (currentPayoutCount < entitledPayoutCount) {
            if (rule.limit !== null && currentPayoutCount >= rule.limit) break;
            currentPayoutCount += 1;
            await makeTransaction(
              cast.id,
              rule.payout,
              `[ft] Reward for cast ${cast.id} for spending ${rule.each}P the ${currentPayoutCount}th time.`,
              'reward',
              tx,
            );
          }
        }
      } else if (rule.policy === 'relative_turnover') {
        logger.error(`Skipping rule ${rule.id}, relative_turnover not implemented.`);
      }
    }
  }
}

// --- RewardInviters --------------------------------------------------------

/**
 * RewardInviters — pays whoever invited the participants. Participants with no
 * inviter get a nudge message instead, advertising the referral scheme.
 */
export async function rewardInviters(meetingId: number, costs?: MeetingCosts, tx?: Tx): Promise<void> {
  const client = tx ?? prisma;
  const meeting = await client.meeting.findUnique({
    where: { id: meetingId },
    include: { owner: { include: { inviter: true } } },
  });
  if (!meeting) throw new InteractorFailure('No meeting given');
  if (meeting.status !== 'completed') throw new InteractorFailure('Meeting must be completed');

  const invitedCustomer = meeting.owner;
  const attendances = await client.castAttendance.findMany({
    where: { meetingId, role: { not: 'out' } },
    include: { user: { include: { inviter: true } } },
  });

  if (invitedCustomer.inviter) {
    await computeInviterReward(meetingId, invitedCustomer.inviter, invitedCustomer, costs, tx);
  } else {
    await informParticipantOfMissingInvitationShareBonus(invitedCustomer.id, tx);
  }

  for (const attendance of attendances) {
    const cast = attendance.user;
    if (cast.inviter) {
      await computeInviterReward(meetingId, cast.inviter, cast, costs, tx);
    } else {
      await informParticipantOfMissingInvitationShareBonus(cast.id, tx);
    }
  }
}

async function computeInviterReward(
  meetingId: number,
  inviter: { id: number; nickName: string; userType: string },
  invitee: { id: number; nickName: string; userType: string; inviterId: number | null },
  costs: MeetingCosts | undefined,
  tx?: Tx,
): Promise<void> {
  const client = tx ?? prisma;
  const rules = await normalisedRulesForUser(inviter, 'invitation', tx);
  if (!rules.length) return;

  const inviteeIsGuest = invitee.userType === 'customer' || invitee.userType === 'inviter';
  const categoryExtension = inviter.userType === 'cast' ? '_cast' : '';

  for (const rule of rules) {
    if (rule.inviteeUserType && rule.inviteeUserType !== invitee.userType) continue;

    if (rule.policy === 'fixed_steps') {
      if (rule.payout > 0 && !ruleIsDisabled(rule)) {
        const completedMeetingsCount = inviteeIsGuest
          ? await client.meeting.count({ where: { ownerId: invitee.id, status: 'completed' } })
          : await client.castAttendance.count({
              where: { userId: invitee.id, role: { not: 'out' }, meeting: { status: 'completed' } },
            });
        if (rule.each > 0 && completedMeetingsCount % rule.each === 0) {
          const nthPayout = idiv(completedMeetingsCount, rule.each);
          if (withinLimit(rule, nthPayout)) {
            await makeTransaction(
              inviter.id,
              rule.payout,
              `[fs] Payment for ${completedMeetingsCount}th meeting of user ${invitee.id}.`,
              `inviter${categoryExtension}` as 'inviter' | 'inviter_cast',
              tx,
            );
            await inviteMeetingMessage(
              { id: invitee.id, nickName: invitee.nickName, userType: invitee.userType, inviterId: invitee.inviterId },
              rule.payout,
              completedMeetingsCount,
              tx,
            );
          }
        }
      }
    } else if (rule.policy === 'fixed_turnover') {
      if (rule.payout > 0 && !ruleIsDisabled(rule)) {
        const turnover = await client.creditTransaction.aggregate({
          where: inviteeIsGuest
            ? { category: 'meeting', chargedUserId: invitee.id }
            : { category: 'meeting', creditedUserId: invitee.id },
          _sum: { chargedAmount: true },
        });
        const summedTurnover = turnover._sum.chargedAmount ?? 0;
        let currentPayoutCount = await client.creditTransaction.count({
          where: {
            category: { in: ['inviter', 'inviter_cast'] },
            creditedUserId: inviter.id,
            reason: { startsWith: `[ft] Payment for user ${invitee.id} ` },
          },
        });
        const entitledPayoutCount = rule.each > 0 ? idiv(summedTurnover, rule.each) : 0;
        while (currentPayoutCount < entitledPayoutCount) {
          if (rule.limit !== null && currentPayoutCount >= rule.limit) break;
          currentPayoutCount += 1;
          await makeTransaction(
            inviter.id,
            rule.payout,
            `[ft] Payment for user ${invitee.id} ${invitee.userType === 'cast' ? 'earning' : 'spending'} ${rule.each}P the ${currentPayoutCount}th time.`,
            `inviter${categoryExtension}` as 'inviter' | 'inviter_cast',
            tx,
          );
        }
      }
    } else if (rule.policy === 'relative_turnover') {
      if (rule.payoutPermille > 0 && !ruleIsDisabled(rule)) {
        const currentCosts = costs ?? (await calculateMeetingCosts(meetingId, {}, tx));
        let relevantCosts: number;
        if (inviteeIsGuest) {
          relevantCosts = currentCosts.total;
        } else {
          const attendance = await client.castAttendance.findFirst({
            where: { meetingId, userId: invitee.id, role: { not: 'out' } },
            select: { id: true },
          });
          relevantCosts = attendance ? currentCosts.get(attendance.id).total : 0;
        }
        const share = idiv(relevantCosts * rule.payoutPermille, 1000);

        let underLimit = true;
        if (rule.limit !== null) {
          const count = await client.creditTransaction.count({
            where: {
              category: { in: ['inviter_profit_share', 'inviter_cast_profit_share'] },
              creditedUserId: inviter.id,
              reason: { startsWith: `[rt] Payment for user ${invitee.id} ` },
            },
          });
          underLimit = count < rule.limit;
        }

        if (underLimit) {
          await makeTransaction(
            inviter.id,
            share,
            `[rt] Payment for user ${invitee.id} ${invitee.userType === 'cast' ? 'earning' : 'spending'} on meeting ${meetingId}.`,
            `inviter${categoryExtension}_profit_share` as 'inviter_profit_share' | 'inviter_cast_profit_share',
            tx,
          );
          await inviterTurnoverMessage(inviter.id, share, tx);
          await informParticipantOfInvitationShareBonus(invitee.id, inviter.nickName, share, tx);
        }
      }
    }
  }
}

// --- RewardPatron ----------------------------------------------------------

/**
 * RewardPatron — the 師弟 (master/apprentice) scheme.
 *
 * The first guest a cast ever works with becomes that cast's patron, and from
 * then on earns a share of the cast's base+prolong pay. Establishing the
 * relationship happens instead of paying out: the original `return`s from the
 * loop the moment it sets one up, so a single order never both creates a
 * relationship and rewards the others.
 */
export async function rewardPatron(meetingId: number, costs?: MeetingCosts, tx?: Tx): Promise<void> {
  const client = tx ?? prisma;
  const meeting = await client.meeting.findUnique({
    where: { id: meetingId },
    include: { owner: { select: { id: true, nickName: true } } },
  });
  if (!meeting) throw new InteractorFailure('No meeting given');
  if (meeting.status !== 'completed') throw new InteractorFailure('Meeting must be completed');

  const owner = meeting.owner;
  const attendances = await client.castAttendance.findMany({
    where: { meetingId, role: { not: 'out' } },
    include: {
      user: {
        select: {
          id: true,
          nickName: true,
          firstPrivatelyMetUserId: true,
          firstPrivatelyMetAt: true,
          serviceFeePermille: true,
        },
      },
    },
  });

  const toReward: typeof attendances = [];

  for (const attendance of attendances) {
    const cast = attendance.user;
    if (cast.firstPrivatelyMetUserId === null) {
      await client.user.update({
        where: { id: cast.id },
        data: { firstPrivatelyMetUserId: owner.id, firstPrivatelyMetAt: attendance.startTime },
      });

      const message = patronEstablishedMessage(cast.nickName, owner.nickName);
      await systemMessageToUser(cast.id, { content: message, withBroadcast: true, withUnread: true }, tx);
      await systemMessageToUser(owner.id, { content: message, withBroadcast: true, withUnread: true }, tx);
      await systemMessageToAdmin(
        {
          withUnread: true,
          content: `下記未経験キャストさんがオーダー確定致しましたので、リマインドです。
＊＊＊＊＊＊＊＊＊＊
${message}
`,
        },
        tx,
      );

      return; // no reward on the first meeting
    }
    toReward.push(attendance);
  }

  if (!toReward.length) return;

  const currentCosts = costs ?? (await calculateMeetingCosts(meetingId, {}, tx));
  const meetingForEarnings = await client.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    select: { calculationSettings: true },
  });

  for (const attendance of toReward) {
    const cast = attendance.user;
    if (cast.firstPrivatelyMetUserId === null || cast.firstPrivatelyMetAt === null) continue;

    const patron = await client.user.findUnique({
      where: { id: cast.firstPrivatelyMetUserId },
      select: { id: true, nickName: true },
    });
    if (!patron) continue;

    // surcharges are excluded from the patron's share
    const castPay = attendanceEarnings(meetingForEarnings, { ...attendance, user: cast }, currentCosts.get(attendance.id), {
      only: ['base', 'prolong'],
    });
    const amount = idiv(castPay * PATRON_SHARE_PERMILLE, 1000);

    await makeTransaction(
      patron.id,
      amount,
      `Payment for patron of ${cast.id} for meeting ${meetingId}.`,
      'patron_reward',
      tx,
    );

    const content = patronRewardMessage(cast.nickName, patron.nickName, amount);
    await systemMessageToUser(patron.id, { content, withBroadcast: true, withUnread: true }, tx);
    await systemMessageToUser(cast.id, { content, withBroadcast: true, withUnread: true }, tx);
    await systemMessageToAdmin(
      {
        withUnread: true,
        content: `下記未経験キャストさんがオーダー確定致しましたので、リマインドです。
＊＊＊＊＊＊＊＊＊＊
${content}
`,
      },
      tx,
    );
  }
}

// --- RewardCast ------------------------------------------------------------

/**
 * RewardCast — the mirror of RewardPatron: the first cast a guest privately met
 * earns a permille of everything that guest ever spends.
 */
export async function rewardCast(meetingId: number, tx?: Tx): Promise<void> {
  const client = tx ?? prisma;
  const meeting = await client.meeting.findUnique({
    where: { id: meetingId },
    include: { owner: true },
  });
  if (!meeting) throw new InteractorFailure('No meeting given');
  if (meeting.status !== 'completed') throw new InteractorFailure('Meeting must be completed');

  const owner = meeting.owner;
  let castToRewardId: number;

  if (owner.firstPrivatelyMetUserId === null) {
    if (meeting.category !== 'individual') return;
    const attendance = await client.castAttendance.findFirst({
      where: { meetingId, role: { not: 'out' } },
      orderBy: { id: 'asc' },
    });
    if (!attendance) return;
    castToRewardId = attendance.userId;
    await client.user.update({
      where: { id: owner.id },
      data: { firstPrivatelyMetUserId: castToRewardId, firstPrivatelyMetAt: attendance.startTime },
    });
  } else {
    castToRewardId = owner.firstPrivatelyMetUserId;
  }

  const castToReward = await client.user.findUnique({
    where: { id: castToRewardId },
    select: { id: true, nickName: true, firstExperienceRewardPermille: true },
  });
  if (!castToReward || castToReward.firstExperienceRewardPermille <= 0) return;

  const amount = idiv((meeting.finalCosts ?? 0) * castToReward.firstExperienceRewardPermille, 1000);

  await makeTransaction(
    castToReward.id,
    amount,
    `Payment to first privately met cast ${castToReward.id} for meeting ${meetingId}.`,
    'cast_reward',
    tx,
  );

  await systemMessageToUser(
    castToReward.id,
    {
      withBroadcast: true,
      withUnread: true,
      content: `初個cocoを獲得したゲストさんがcocoをご利用致しましたので、初個cocoのポイント ${numberToCurrencyP(amount)}を獲得致しました。
マイページの『売上履歴一覧』をご確認くださいませ。
`,
    },
    tx,
  );
}

// --- RewardForReviews ------------------------------------------------------

/**
 * RewardForReviews — rewards the person being reviewed, and is the only path that
 * raises a cast's service_fee_permille (their payout rate) as a perk.
 */
export async function rewardForReviews(
  review: { id: number; stars: number; reviewerId: number | null; revieweeId: number | null },
  tx?: Tx,
): Promise<void> {
  const client = tx ?? prisma;
  if (!review.revieweeId) return;

  const reviewee = await client.user.findUnique({ where: { id: review.revieweeId } });
  if (!reviewee) return;

  const rules = await normalisedRulesForUser(reviewee, 'being_reviewed', tx);
  if (!rules.length) return;

  for (const rule of rules) {
    if (rule.userType && rule.userType !== reviewee.userType) continue;
    if (review.stars < rule.minStars) continue;
    if (rule.policy !== 'fixed_steps') continue;

    const affectsSomething = rule.payout > 0 || rule.serviceFeeReset > 0 || rule.serviceFeeIncrease !== 0;
    if (!affectsSomething || ruleIsDisabled(rule)) continue;

    const applicableReviewCount = await client.review.count({
      where: { revieweeId: reviewee.id, stars: { gte: rule.minStars } },
    });
    if (applicableReviewCount === 0 || rule.each === 0 || applicableReviewCount % rule.each !== 0) continue;

    const nthReward = idiv(applicableReviewCount, rule.each);
    if (!withinLimit(rule, nthReward)) continue;

    if (rule.payout > 0) {
      await makeTransaction(
        reviewee.id,
        rule.payout,
        `[fs] Payment for ${applicableReviewCount}th applicable review of user ${reviewee.id}.`,
        'reward',
        tx,
      );
    }

    if (rule.serviceFeeIncrease !== 0) {
      await client.user.update({
        where: { id: reviewee.id },
        data: { serviceFeePermille: { increment: rule.serviceFeeIncrease } },
      });
    } else if (rule.serviceFeeReset > 0 && (reviewee.serviceFeePermille ?? 0) <= rule.serviceFeeReset) {
      const defaultPermille = reviewee.serviceFeePermille ?? 0;
      await client.user.update({
        where: { id: reviewee.id },
        data: { serviceFeePermille: rule.serviceFeeReset },
      });
      const reviewer = review.reviewerId
        ? await client.user.findUnique({
            where: { id: review.reviewerId },
            select: { id: true, nickName: true, userType: true, inviterId: true },
          })
        : null;
      if (reviewer) {
        await reviewServiceFeeResetMessage(
          { id: reviewee.id, nickName: reviewee.nickName, userType: reviewee.userType, inviterId: reviewee.inviterId },
          reviewer,
          review.stars,
          defaultPermille,
          rule.serviceFeeReset,
          tx,
        );
      }
    }
  }
}

// --- UpdateCastRepeatCounts ------------------------------------------------

/**
 * UpdateCastRepeatCounts — counts how often a cast has been re-booked privately
 * by the same guest. Only increments when an earlier completed individual order
 * between the two already exists, so the first booking is not a "repeat".
 */
export async function updateCastRepeatCounts(meetingId: number, tx?: Tx): Promise<void> {
  const client = tx ?? prisma;
  const meeting = await client.meeting.findUniqueOrThrow({ where: { id: meetingId } });
  if (meeting.category !== 'individual') return;

  const attendance = await client.castAttendance.findFirst({
    where: { meetingId, role: { not: 'out' } },
    orderBy: { id: 'asc' },
  });
  if (!attendance) return;

  const previous = await client.meeting.findFirst({
    where: {
      id: { not: meetingId },
      category: 'individual',
      ownerId: meeting.ownerId,
      status: 'completed',
      castAttendances: { some: { userId: attendance.userId, role: { not: 'out' } } },
    },
    select: { id: true },
  });
  if (!previous) return;

  await client.user.update({
    where: { id: attendance.userId },
    data: { individualRepeatCount: { increment: 1 } },
  });
}
