-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('cast', 'customer', 'inviter', 'operator', 'admin', 'system');

-- CreateEnum
CREATE TYPE "AccessLevel" AS ENUM ('rejected', 'ceased', 'unauthorized', 'picture_uploaded', 'interview_date_pending', 'interview_pending', 'contract_pending', 'contract_accepted', 'full');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('requested', 'cast_selectable', 'cast_requested', 'scheduled', 'in_progress', 'finished', 'completed', 'general_fail', 'not_enough_cast_fail', 'score_too_low_fail', 'request_denied_fail', 'request_canceled_fail', 'pre_charge_fail', 'post_charge_fail', 'chargeback_fail', 'admin_cancel_fail');

-- CreateEnum
CREATE TYPE "MeetingCategory" AS ENUM ('general', 'individual');

-- CreateEnum
CREATE TYPE "CastAttendanceRole" AS ENUM ('attending', 'unconfirmed', 'requested', 'out');

-- CreateEnum
CREATE TYPE "DecisionBy" AS ENUM ('customer', 'operator', 'system', 'cast');

-- CreateEnum
CREATE TYPE "ConversationCategory" AS ENUM ('meeting', 'private', 'system', 'operator', 'admin');

-- CreateEnum
CREATE TYPE "MessageCategory" AS ENUM ('text', 'picture', 'sticker', 'service', 'internal');

-- CreateEnum
CREATE TYPE "PostCategory" AS ENUM ('public', 'cast_only');

-- CreateEnum
CREATE TYPE "CreditCardStatus" AS ENUM ('invalid', 'valid');

-- CreateEnum
CREATE TYPE "FlowDirection" AS ENUM ('in', 're_in', 'out', 'fast_out');

-- CreateEnum
CREATE TYPE "CreditTransactionCategory" AS ENUM ('meeting', 'sticker', 'charge', 'auto_charge', 'chargeback', 'payout', 'manual', 'manual_reflect', 'inviter', 'inviter_cast', 'patron_reward', 'cast_reward', 'reward', 'penalty', 'likes_reward', 'inviter_profit_share', 'inviter_cast_profit_share', 'event_gift_reward');

-- CreateEnum
CREATE TYPE "RewardingCategory" AS ENUM ('invitation', 'being_reviewed', 'reviewing', 'usage', 'attendance');

-- CreateEnum
CREATE TYPE "RewardingPolicy" AS ENUM ('fixed_steps', 'fixed_turnover', 'relative_turnover');

-- CreateEnum
CREATE TYPE "AttributeValidity" AS ENUM ('cast', 'customer', 'all');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT,
    "user_type" "UserType" NOT NULL,
    "nick_name" TEXT NOT NULL,
    "auth_token" TEXT,
    "sns_id" TEXT,
    "join_date" DATE NOT NULL,
    "last_login" TIMESTAMP(3),
    "last_activity" TIMESTAMP(3),
    "logged_out" BOOLEAN NOT NULL DEFAULT true,
    "password_digest" TEXT,
    "remember_token" TEXT,
    "restoration_token" TEXT,
    "public_profile" BOOLEAN NOT NULL DEFAULT true,
    "motto" TEXT,
    "creditcard_token" TEXT,
    "service_fee_permille" INTEGER,
    "birthday" DATE,
    "birthday_published" INTEGER,
    "profile_pic_url" TEXT,
    "business_area_id" INTEGER,
    "cast_level_id" INTEGER,
    "customer_level_id" INTEGER,
    "credit_balance" INTEGER NOT NULL DEFAULT 0,
    "frozen_credits" INTEGER NOT NULL DEFAULT 0,
    "available_until" TIMESTAMP(3),
    "order_fee_per_time" INTEGER,
    "device_ids" JSONB,
    "inviter_id" INTEGER,
    "real_name" TEXT,
    "discarded_at" TIMESTAMP(3),
    "phone" TEXT,
    "access_level" "AccessLevel" NOT NULL DEFAULT 'full',
    "last_post_read_at" TIMESTAMP(3),
    "meeting_ranking_cheat" INTEGER NOT NULL DEFAULT 0,
    "sticker_ranking_cheat" INTEGER NOT NULL DEFAULT 0,
    "first_privately_met_user_id" INTEGER,
    "first_privately_met_at" TIMESTAMP(3),
    "first_experience_reward_permille" INTEGER NOT NULL DEFAULT 0,
    "customers_selected" BOOLEAN NOT NULL DEFAULT false,
    "last_service_message_read_at" TIMESTAMP(3),
    "additional_score" INTEGER NOT NULL DEFAULT 0,
    "individual_repeat_count" INTEGER NOT NULL DEFAULT 0,
    "days_elapsed" INTEGER,
    "ad_source" TEXT,
    "guest_title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "message_notification" BOOLEAN DEFAULT true,
    "footprint_notification" BOOLEAN DEFAULT true,
    "no_ranking" BOOLEAN NOT NULL DEFAULT false,
    "no_fame" BOOLEAN NOT NULL DEFAULT true,
    "no_ranking_set_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_ranking_visibility_history" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "visible" BOOLEAN NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_ranking_visibility_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_requests" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "uploaded_picture" TEXT,
    "interview" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attributes" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "value" VARCHAR(2047),
    "value_type" TEXT,
    "category" TEXT NOT NULL,

    CONSTRAINT "attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attributes_schema" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "validity" "AttributeValidity",
    "attribute_type" TEXT,
    "comment" TEXT,
    "category" TEXT NOT NULL,
    "value_list" JSONB,
    "sort_index" INTEGER,

    CONSTRAINT "attributes_schema_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_assessments" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_memos" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "target_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_memos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intro_messages" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "template" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intro_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pictures" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "public" BOOLEAN NOT NULL DEFAULT false,
    "profile_pic" BOOLEAN NOT NULL DEFAULT false,
    "file_data" JSONB NOT NULL,

    CONSTRAINT "pictures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "target_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "footprints" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "profile_user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unread" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "footprints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blockings" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "target_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blockings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friendships" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "friend_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'default',
    "mutual" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "friendships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "highlightings" (
    "id" SERIAL NOT NULL,
    "category_name" TEXT NOT NULL,
    "user_type" TEXT NOT NULL DEFAULT 'all',
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_index" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "highlightings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_highlightings" (
    "id" SERIAL NOT NULL,
    "highlighting_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_highlightings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_areas" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_index" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#e6b324',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "areas" (
    "id" SERIAL NOT NULL,
    "business_area_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sort_index" INTEGER NOT NULL DEFAULT 0,
    "custom" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" SERIAL NOT NULL,
    "business_area_id" INTEGER,
    "login_name" TEXT NOT NULL,
    "password_digest" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cast_levels" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sort_index" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#e6b324',
    "min_order_fee_per_time" INTEGER,
    "max_order_fee_per_time" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cast_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cast_ranks" (
    "id" SERIAL NOT NULL,
    "business_area_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "base_cost_per_time" INTEGER NOT NULL,
    "prolong_cost_per_time" INTEGER NOT NULL,
    "proposed_price" BOOLEAN NOT NULL DEFAULT false,
    "fixed_price" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cast_ranks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cast_levels_ranks" (
    "cast_level_id" INTEGER NOT NULL,
    "cast_rank_id" INTEGER NOT NULL,

    CONSTRAINT "cast_levels_ranks_pkey" PRIMARY KEY ("cast_level_id","cast_rank_id")
);

-- CreateTable
CREATE TABLE "customer_levels" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#e6b324',
    "sort_index" INTEGER NOT NULL DEFAULT 0,
    "entry_spending" INTEGER,
    "hold_spending" INTEGER,
    "next_level_id" INTEGER,
    "prev_level_id" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_informations" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "zip_code" TEXT,
    "address" TEXT,
    "building" TEXT,
    "phone" TEXT,
    "person_in_charge" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_informations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" SERIAL NOT NULL,
    "item_type" TEXT,
    "item_id" INTEGER,
    "content" TEXT,
    "admin_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banners" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "banner_picture_url" TEXT NOT NULL,
    "main_picture_url" TEXT,
    "position" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_messages" (
    "id" SERIAL NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "business_area_id" INTEGER,
    "for_customers" BOOLEAN NOT NULL DEFAULT true,
    "for_cast" BOOLEAN NOT NULL DEFAULT true,
    "for_inviters" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trophies" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trophies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_trophies" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "trophy_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_trophies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_places" (
    "id" SERIAL NOT NULL,
    "area_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "description" TEXT,
    "image_urls" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_place_tags" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_place_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_place_tag_entries" (
    "meeting_place_id" INTEGER NOT NULL,
    "meeting_place_tag_id" INTEGER NOT NULL,

    CONSTRAINT "meeting_place_tag_entries_pkey" PRIMARY KEY ("meeting_place_id","meeting_place_tag_id")
);

-- CreateTable
CREATE TABLE "meeting_preferences_schema" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "category" TEXT,
    "subcategory" TEXT,
    "sort_index" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "score" INTEGER NOT NULL DEFAULT 5,
    "cast_preference" BOOLEAN NOT NULL DEFAULT true,
    "customer_preference" BOOLEAN NOT NULL DEFAULT true,
    "mutually_exclusive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "meeting_preferences_schema_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_preferences" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "parent_id" INTEGER,

    CONSTRAINT "meeting_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" SERIAL NOT NULL,
    "status" "MeetingStatus" NOT NULL,
    "category" "MeetingCategory" NOT NULL DEFAULT 'general',
    "owner_id" INTEGER NOT NULL,
    "request_start_time" TIMESTAMP(3),
    "request_end_time" TIMESTAMP(3),
    "planned_start_time" TIMESTAMP(3) NOT NULL,
    "planned_end_time" TIMESTAMP(3) NOT NULL,
    "real_end_time" TIMESTAMP(3),
    "area_id" INTEGER NOT NULL,
    "area_name" TEXT,
    "base_cost_per_time" INTEGER,
    "prolong_cost_per_time" INTEGER,
    "final_costs" INTEGER,
    "needed_person_count" INTEGER NOT NULL,
    "minimum_person_count" INTEGER,
    "cast_rank_id" INTEGER,
    "description" TEXT,
    "preferences" JSONB,
    "conversation_id" INTEGER,
    "operator_message" TEXT,
    "pre_conversion_id" INTEGER,
    "post_conversion_id" INTEGER,
    "calculation_settings" JSONB,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "frozen_credits" INTEGER NOT NULL DEFAULT 0,
    "final_discount" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cast_attendances" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "meeting_id" INTEGER NOT NULL,
    "role" "CastAttendanceRole" NOT NULL,
    "credit_transaction_id" INTEGER,
    "start_time" TIMESTAMP(3),
    "end_time" TIMESTAMP(3),
    "decision_by" "DecisionBy",
    "service_fee_permille" INTEGER,
    "leader_id" INTEGER,
    "additional_score" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cast_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_proposals" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "description" TEXT,
    "area_id" INTEGER,
    "start_time" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER,
    "cast_count" INTEGER,
    "cast_rank_id" INTEGER,
    "picture_data" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" SERIAL NOT NULL,
    "reviewer_id" INTEGER,
    "reviewee_id" INTEGER,
    "meeting_id" INTEGER,
    "stars" INTEGER,
    "comment" TEXT,
    "sticker_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Private Chat',
    "category" "ConversationCategory" NOT NULL DEFAULT 'private',
    "picture_url" TEXT,
    "last_content" TEXT,
    "last_sender_name" TEXT,
    "last_sender_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "speakers" (
    "id" SERIAL NOT NULL,
    "conversation_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'participant',
    "conversation_name" TEXT,
    "picture_url" TEXT,
    "ignoring" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "speakers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" SERIAL NOT NULL,
    "sender_id" INTEGER NOT NULL,
    "conversation_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "category" "MessageCategory" NOT NULL DEFAULT 'text',

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unread_messages" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "message_id" INTEGER,
    "conversation_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ignored" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "unread_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "post_likes_count" INTEGER NOT NULL DEFAULT 0,
    "category" "PostCategory" NOT NULL DEFAULT 'public',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_likes" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "post_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_pictures" (
    "id" SERIAL NOT NULL,
    "post_id" INTEGER NOT NULL,
    "file_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_pictures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sticker_templates" (
    "id" SERIAL NOT NULL,
    "picture_url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "business_area_id" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "transaction_price_permille" INTEGER,
    "transaction_price_abs" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sticker_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stickers" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "buyer_id" INTEGER NOT NULL,
    "sticker_template_id" INTEGER NOT NULL,
    "message_id" INTEGER,
    "credit_transaction_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stickers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roulettes" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "fee" INTEGER NOT NULL,
    "sort_index" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roulettes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roulette_entries" (
    "id" SERIAL NOT NULL,
    "roulette_id" INTEGER NOT NULL,
    "sticker_template_id" INTEGER NOT NULL,
    "chance_permille" INTEGER NOT NULL,
    "display_chance" TEXT,
    "high_value" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roulette_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roulette_rolls" (
    "id" SERIAL NOT NULL,
    "roulette_id" INTEGER NOT NULL,
    "payer_id" INTEGER NOT NULL,
    "grantee_id" INTEGER NOT NULL,
    "outcome" JSONB NOT NULL,
    "winning_entry_id" INTEGER NOT NULL,
    "pending" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roulette_rolls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_levels_roulettes" (
    "customer_level_id" INTEGER NOT NULL,
    "roulette_id" INTEGER NOT NULL,

    CONSTRAINT "customer_levels_roulettes_pkey" PRIMARY KEY ("customer_level_id","roulette_id")
);

-- CreateTable
CREATE TABLE "event_campaigns" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sticker_template_id" INTEGER NOT NULL,
    "cast_reward_amount" INTEGER NOT NULL DEFAULT 0,
    "cast_daily_limit" INTEGER NOT NULL DEFAULT 5,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "limited_sticker_template_ids" TEXT,
    "milestone_gift_threshold" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" SERIAL NOT NULL,
    "charged_user_id" INTEGER,
    "credited_user_id" INTEGER,
    "charged_amount" INTEGER,
    "credited_amount" INTEGER,
    "reason" TEXT,
    "category" "CreditTransactionCategory" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_conversions" (
    "id" SERIAL NOT NULL,
    "credit_transaction_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'jpy',
    "credits" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "flow_direction" "FlowDirection" NOT NULL,
    "code" TEXT,
    "inverse_conversion_id" INTEGER,

    CONSTRAINT "credit_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_balances" (
    "id" SERIAL NOT NULL,
    "balance" INTEGER,
    "credit_conversion_id" INTEGER,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_cards" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" "CreditCardStatus" NOT NULL DEFAULT 'invalid',
    "name_on_card" TEXT,
    "masked_card_number" TEXT,
    "expiry_year" INTEGER,
    "expiry_month" INTEGER,
    "masked_card_cvv" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cast_bank_accounts" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "bank_name" TEXT NOT NULL,
    "bank_number" TEXT NOT NULL,
    "branch_name" TEXT NOT NULL,
    "branch_number" TEXT NOT NULL,
    "account_type" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "holder_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cast_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_requests" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "credit_amount" INTEGER NOT NULL,
    "fee" INTEGER NOT NULL DEFAULT 220,
    "net_amount" INTEGER NOT NULL,
    "fast_payout" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "handling_type" VARCHAR(32),
    "scheduled_payout_on" DATE NOT NULL,
    "processed_at" TIMESTAMP(3),
    "credit_conversion_id" INTEGER,
    "credit_transaction_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewarding_rules" (
    "id" SERIAL NOT NULL,
    "category" "RewardingCategory" NOT NULL,
    "user_type" TEXT,
    "user_id" INTEGER,
    "override_id" INTEGER,
    "policy" "RewardingPolicy" NOT NULL,
    "payout" INTEGER NOT NULL DEFAULT 0,
    "payout_permille" INTEGER NOT NULL DEFAULT 0,
    "each" INTEGER NOT NULL DEFAULT 0,
    "limit" INTEGER,
    "invitee_user_type" TEXT,
    "service_fee_reset" INTEGER NOT NULL DEFAULT 0,
    "service_fee_increase" INTEGER NOT NULL DEFAULT 0,
    "min_stars" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rewarding_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_business_area_id_idx" ON "users"("business_area_id");

-- CreateIndex
CREATE INDEX "users_cast_level_id_idx" ON "users"("cast_level_id");

-- CreateIndex
CREATE INDEX "users_customer_level_id_idx" ON "users"("customer_level_id");

-- CreateIndex
CREATE INDEX "users_discarded_at_idx" ON "users"("discarded_at");

-- CreateIndex
CREATE INDEX "users_first_privately_met_user_id_idx" ON "users"("first_privately_met_user_id");

-- CreateIndex
CREATE INDEX "users_inviter_id_idx" ON "users"("inviter_id");

-- CreateIndex
CREATE INDEX "users_last_login_idx" ON "users"("last_login");

-- CreateIndex
CREATE INDEX "users_sns_id_idx" ON "users"("sns_id");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_user_id_key" ON "user_settings"("user_id");

-- CreateIndex
CREATE INDEX "user_settings_no_ranking_set_at_idx" ON "user_settings"("no_ranking_set_at");

-- CreateIndex
CREATE INDEX "user_ranking_visibility_history_user_id_changed_at_idx" ON "user_ranking_visibility_history"("user_id", "changed_at");

-- CreateIndex
CREATE UNIQUE INDEX "access_requests_user_id_key" ON "access_requests"("user_id");

-- CreateIndex
CREATE INDEX "attributes_name_idx" ON "attributes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "attributes_user_id_name_key" ON "attributes"("user_id", "name");

-- CreateIndex
CREATE INDEX "attributes_schema_name_idx" ON "attributes_schema"("name");

-- CreateIndex
CREATE UNIQUE INDEX "user_assessments_user_id_name_key" ON "user_assessments"("user_id", "name");

-- CreateIndex
CREATE INDEX "user_memos_user_id_idx" ON "user_memos"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_memos_target_id_user_id_key" ON "user_memos"("target_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "intro_messages_user_id_key" ON "intro_messages"("user_id");

-- CreateIndex
CREATE INDEX "pictures_user_id_idx" ON "pictures"("user_id");

-- CreateIndex
CREATE INDEX "favorites_target_id_idx" ON "favorites"("target_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_user_id_target_id_key" ON "favorites"("user_id", "target_id");

-- CreateIndex
CREATE INDEX "footprints_profile_user_id_idx" ON "footprints"("profile_user_id");

-- CreateIndex
CREATE INDEX "footprints_unread_idx" ON "footprints"("unread");

-- CreateIndex
CREATE INDEX "footprints_user_id_idx" ON "footprints"("user_id");

-- CreateIndex
CREATE INDEX "blockings_user_id_idx" ON "blockings"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "blockings_target_id_user_id_key" ON "blockings"("target_id", "user_id");

-- CreateIndex
CREATE INDEX "friendships_friend_id_idx" ON "friendships"("friend_id");

-- CreateIndex
CREATE UNIQUE INDEX "friendships_user_id_friend_id_key" ON "friendships"("user_id", "friend_id");

-- CreateIndex
CREATE INDEX "user_highlightings_highlighting_id_idx" ON "user_highlightings"("highlighting_id");

-- CreateIndex
CREATE INDEX "user_highlightings_user_id_idx" ON "user_highlightings"("user_id");

-- CreateIndex
CREATE INDEX "areas_business_area_id_idx" ON "areas"("business_area_id");

-- CreateIndex
CREATE UNIQUE INDEX "admins_login_name_key" ON "admins"("login_name");

-- CreateIndex
CREATE INDEX "admins_business_area_id_idx" ON "admins"("business_area_id");

-- CreateIndex
CREATE INDEX "cast_ranks_business_area_id_idx" ON "cast_ranks"("business_area_id");

-- CreateIndex
CREATE INDEX "cast_levels_ranks_cast_rank_id_cast_level_id_idx" ON "cast_levels_ranks"("cast_rank_id", "cast_level_id");

-- CreateIndex
CREATE INDEX "customer_levels_next_level_id_idx" ON "customer_levels"("next_level_id");

-- CreateIndex
CREATE INDEX "customer_levels_prev_level_id_idx" ON "customer_levels"("prev_level_id");

-- CreateIndex
CREATE INDEX "notes_admin_id_idx" ON "notes"("admin_id");

-- CreateIndex
CREATE INDEX "notes_item_type_item_id_idx" ON "notes"("item_type", "item_id");

-- CreateIndex
CREATE INDEX "service_messages_business_area_id_idx" ON "service_messages"("business_area_id");

-- CreateIndex
CREATE INDEX "service_messages_created_at_idx" ON "service_messages"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_trophies_user_id_trophy_id_key" ON "user_trophies"("user_id", "trophy_id");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_places_name_key" ON "meeting_places"("name");

-- CreateIndex
CREATE INDEX "meeting_places_area_id_idx" ON "meeting_places"("area_id");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_place_tags_name_key" ON "meeting_place_tags"("name");

-- CreateIndex
CREATE INDEX "meeting_place_tag_entries_meeting_place_tag_id_idx" ON "meeting_place_tag_entries"("meeting_place_tag_id");

-- CreateIndex
CREATE INDEX "meeting_preferences_parent_id_idx" ON "meeting_preferences"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_preferences_user_id_parent_id_key" ON "meeting_preferences"("user_id", "parent_id");

-- CreateIndex
CREATE INDEX "meetings_area_id_idx" ON "meetings"("area_id");

-- CreateIndex
CREATE INDEX "meetings_cast_rank_id_idx" ON "meetings"("cast_rank_id");

-- CreateIndex
CREATE INDEX "meetings_conversation_id_idx" ON "meetings"("conversation_id");

-- CreateIndex
CREATE INDEX "meetings_owner_id_idx" ON "meetings"("owner_id");

-- CreateIndex
CREATE INDEX "meetings_post_conversion_id_idx" ON "meetings"("post_conversion_id");

-- CreateIndex
CREATE INDEX "meetings_pre_conversion_id_idx" ON "meetings"("pre_conversion_id");

-- CreateIndex
CREATE INDEX "meetings_status_idx" ON "meetings"("status");

-- CreateIndex
CREATE INDEX "meetings_planned_start_time_idx" ON "meetings"("planned_start_time");

-- CreateIndex
CREATE INDEX "cast_attendances_credit_transaction_id_idx" ON "cast_attendances"("credit_transaction_id");

-- CreateIndex
CREATE INDEX "cast_attendances_leader_id_idx" ON "cast_attendances"("leader_id");

-- CreateIndex
CREATE INDEX "cast_attendances_user_id_idx" ON "cast_attendances"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "cast_attendances_meeting_id_user_id_key" ON "cast_attendances"("meeting_id", "user_id");

-- CreateIndex
CREATE INDEX "meeting_proposals_area_id_idx" ON "meeting_proposals"("area_id");

-- CreateIndex
CREATE INDEX "meeting_proposals_cast_rank_id_idx" ON "meeting_proposals"("cast_rank_id");

-- CreateIndex
CREATE INDEX "meeting_proposals_start_time_idx" ON "meeting_proposals"("start_time");

-- CreateIndex
CREATE INDEX "meeting_proposals_user_id_idx" ON "meeting_proposals"("user_id");

-- CreateIndex
CREATE INDEX "reviews_meeting_id_idx" ON "reviews"("meeting_id");

-- CreateIndex
CREATE INDEX "reviews_reviewee_id_idx" ON "reviews"("reviewee_id");

-- CreateIndex
CREATE INDEX "reviews_reviewer_id_idx" ON "reviews"("reviewer_id");

-- CreateIndex
CREATE INDEX "reviews_sticker_id_idx" ON "reviews"("sticker_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_reviewer_id_reviewee_id_meeting_id_key" ON "reviews"("reviewer_id", "reviewee_id", "meeting_id");

-- CreateIndex
CREATE INDEX "conversations_updated_at_idx" ON "conversations"("updated_at");

-- CreateIndex
CREATE INDEX "speakers_conversation_id_idx" ON "speakers"("conversation_id");

-- CreateIndex
CREATE INDEX "speakers_user_id_idx" ON "speakers"("user_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_idx" ON "messages"("conversation_id");

-- CreateIndex
CREATE INDEX "messages_sender_id_idx" ON "messages"("sender_id");

-- CreateIndex
CREATE INDEX "messages_sent_at_idx" ON "messages"("sent_at");

-- CreateIndex
CREATE INDEX "unread_messages_conversation_id_idx" ON "unread_messages"("conversation_id");

-- CreateIndex
CREATE INDEX "unread_messages_message_id_idx" ON "unread_messages"("message_id");

-- CreateIndex
CREATE INDEX "unread_messages_user_id_idx" ON "unread_messages"("user_id");

-- CreateIndex
CREATE INDEX "posts_created_at_idx" ON "posts"("created_at");

-- CreateIndex
CREATE INDEX "posts_user_id_idx" ON "posts"("user_id");

-- CreateIndex
CREATE INDEX "post_likes_user_id_idx" ON "post_likes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "post_likes_post_id_user_id_key" ON "post_likes"("post_id", "user_id");

-- CreateIndex
CREATE INDEX "post_pictures_post_id_idx" ON "post_pictures"("post_id");

-- CreateIndex
CREATE INDEX "sticker_templates_business_area_id_idx" ON "sticker_templates"("business_area_id");

-- CreateIndex
CREATE INDEX "stickers_buyer_id_idx" ON "stickers"("buyer_id");

-- CreateIndex
CREATE INDEX "stickers_credit_transaction_id_idx" ON "stickers"("credit_transaction_id");

-- CreateIndex
CREATE INDEX "stickers_message_id_idx" ON "stickers"("message_id");

-- CreateIndex
CREATE INDEX "stickers_sticker_template_id_idx" ON "stickers"("sticker_template_id");

-- CreateIndex
CREATE INDEX "stickers_user_id_idx" ON "stickers"("user_id");

-- CreateIndex
CREATE INDEX "stickers_created_at_idx" ON "stickers"("created_at");

-- CreateIndex
CREATE INDEX "roulette_entries_roulette_id_idx" ON "roulette_entries"("roulette_id");

-- CreateIndex
CREATE INDEX "roulette_entries_sticker_template_id_idx" ON "roulette_entries"("sticker_template_id");

-- CreateIndex
CREATE INDEX "roulette_rolls_grantee_id_idx" ON "roulette_rolls"("grantee_id");

-- CreateIndex
CREATE INDEX "roulette_rolls_payer_id_idx" ON "roulette_rolls"("payer_id");

-- CreateIndex
CREATE INDEX "roulette_rolls_roulette_id_idx" ON "roulette_rolls"("roulette_id");

-- CreateIndex
CREATE INDEX "roulette_rolls_winning_entry_id_idx" ON "roulette_rolls"("winning_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "roulette_customer_level_index" ON "customer_levels_roulettes"("roulette_id", "customer_level_id");

-- CreateIndex
CREATE INDEX "event_campaigns_start_at_end_at_idx" ON "event_campaigns"("start_at", "end_at");

-- CreateIndex
CREATE INDEX "credit_transactions_category_idx" ON "credit_transactions"("category");

-- CreateIndex
CREATE INDEX "credit_transactions_charged_user_id_idx" ON "credit_transactions"("charged_user_id");

-- CreateIndex
CREATE INDEX "credit_transactions_created_at_idx" ON "credit_transactions"("created_at");

-- CreateIndex
CREATE INDEX "credit_transactions_credited_user_id_idx" ON "credit_transactions"("credited_user_id");

-- CreateIndex
CREATE INDEX "credit_conversions_credit_transaction_id_idx" ON "credit_conversions"("credit_transaction_id");

-- CreateIndex
CREATE INDEX "credit_conversions_inverse_conversion_id_idx" ON "credit_conversions"("inverse_conversion_id");

-- CreateIndex
CREATE INDEX "credit_conversions_user_id_idx" ON "credit_conversions"("user_id");

-- CreateIndex
CREATE INDEX "company_balances_credit_conversion_id_idx" ON "company_balances"("credit_conversion_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_cards_user_id_key" ON "credit_cards"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "cast_bank_accounts_user_id_key" ON "cast_bank_accounts"("user_id");

-- CreateIndex
CREATE INDEX "payout_requests_user_id_idx" ON "payout_requests"("user_id");

-- CreateIndex
CREATE INDEX "payout_requests_status_idx" ON "payout_requests"("status");

-- CreateIndex
CREATE INDEX "payout_requests_scheduled_payout_on_idx" ON "payout_requests"("scheduled_payout_on");

-- CreateIndex
CREATE INDEX "payout_requests_handling_type_idx" ON "payout_requests"("handling_type");

-- CreateIndex
CREATE INDEX "payout_requests_credit_transaction_id_idx" ON "payout_requests"("credit_transaction_id");

-- CreateIndex
CREATE INDEX "rewarding_rules_override_id_idx" ON "rewarding_rules"("override_id");

-- CreateIndex
CREATE INDEX "rewarding_rules_user_id_idx" ON "rewarding_rules"("user_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_business_area_id_fkey" FOREIGN KEY ("business_area_id") REFERENCES "business_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_cast_level_id_fkey" FOREIGN KEY ("cast_level_id") REFERENCES "cast_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_customer_level_id_fkey" FOREIGN KEY ("customer_level_id") REFERENCES "customer_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_first_privately_met_user_id_fkey" FOREIGN KEY ("first_privately_met_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_ranking_visibility_history" ADD CONSTRAINT "user_ranking_visibility_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attributes" ADD CONSTRAINT "attributes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_assessments" ADD CONSTRAINT "user_assessments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_memos" ADD CONSTRAINT "user_memos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_memos" ADD CONSTRAINT "user_memos_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intro_messages" ADD CONSTRAINT "intro_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pictures" ADD CONSTRAINT "pictures_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "footprints" ADD CONSTRAINT "footprints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "footprints" ADD CONSTRAINT "footprints_profile_user_id_fkey" FOREIGN KEY ("profile_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blockings" ADD CONSTRAINT "blockings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blockings" ADD CONSTRAINT "blockings_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_friend_id_fkey" FOREIGN KEY ("friend_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_highlightings" ADD CONSTRAINT "user_highlightings_highlighting_id_fkey" FOREIGN KEY ("highlighting_id") REFERENCES "highlightings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_highlightings" ADD CONSTRAINT "user_highlightings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "areas" ADD CONSTRAINT "areas_business_area_id_fkey" FOREIGN KEY ("business_area_id") REFERENCES "business_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admins" ADD CONSTRAINT "admins_business_area_id_fkey" FOREIGN KEY ("business_area_id") REFERENCES "business_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cast_ranks" ADD CONSTRAINT "cast_ranks_business_area_id_fkey" FOREIGN KEY ("business_area_id") REFERENCES "business_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cast_levels_ranks" ADD CONSTRAINT "cast_levels_ranks_cast_level_id_fkey" FOREIGN KEY ("cast_level_id") REFERENCES "cast_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cast_levels_ranks" ADD CONSTRAINT "cast_levels_ranks_cast_rank_id_fkey" FOREIGN KEY ("cast_rank_id") REFERENCES "cast_ranks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_levels" ADD CONSTRAINT "customer_levels_next_level_id_fkey" FOREIGN KEY ("next_level_id") REFERENCES "customer_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_levels" ADD CONSTRAINT "customer_levels_prev_level_id_fkey" FOREIGN KEY ("prev_level_id") REFERENCES "customer_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_messages" ADD CONSTRAINT "service_messages_business_area_id_fkey" FOREIGN KEY ("business_area_id") REFERENCES "business_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_trophies" ADD CONSTRAINT "user_trophies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_trophies" ADD CONSTRAINT "user_trophies_trophy_id_fkey" FOREIGN KEY ("trophy_id") REFERENCES "trophies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_places" ADD CONSTRAINT "meeting_places_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_place_tag_entries" ADD CONSTRAINT "meeting_place_tag_entries_meeting_place_id_fkey" FOREIGN KEY ("meeting_place_id") REFERENCES "meeting_places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_place_tag_entries" ADD CONSTRAINT "meeting_place_tag_entries_meeting_place_tag_id_fkey" FOREIGN KEY ("meeting_place_tag_id") REFERENCES "meeting_place_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_preferences" ADD CONSTRAINT "meeting_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_preferences" ADD CONSTRAINT "meeting_preferences_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "meeting_preferences_schema"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_cast_rank_id_fkey" FOREIGN KEY ("cast_rank_id") REFERENCES "cast_ranks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_pre_conversion_id_fkey" FOREIGN KEY ("pre_conversion_id") REFERENCES "credit_conversions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_post_conversion_id_fkey" FOREIGN KEY ("post_conversion_id") REFERENCES "credit_conversions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cast_attendances" ADD CONSTRAINT "cast_attendances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cast_attendances" ADD CONSTRAINT "cast_attendances_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cast_attendances" ADD CONSTRAINT "cast_attendances_credit_transaction_id_fkey" FOREIGN KEY ("credit_transaction_id") REFERENCES "credit_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cast_attendances" ADD CONSTRAINT "cast_attendances_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "cast_attendances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_proposals" ADD CONSTRAINT "meeting_proposals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_proposals" ADD CONSTRAINT "meeting_proposals_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_proposals" ADD CONSTRAINT "meeting_proposals_cast_rank_id_fkey" FOREIGN KEY ("cast_rank_id") REFERENCES "cast_ranks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewee_id_fkey" FOREIGN KEY ("reviewee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_sticker_id_fkey" FOREIGN KEY ("sticker_id") REFERENCES "stickers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speakers" ADD CONSTRAINT "speakers_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speakers" ADD CONSTRAINT "speakers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unread_messages" ADD CONSTRAINT "unread_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unread_messages" ADD CONSTRAINT "unread_messages_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unread_messages" ADD CONSTRAINT "unread_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_pictures" ADD CONSTRAINT "post_pictures_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sticker_templates" ADD CONSTRAINT "sticker_templates_business_area_id_fkey" FOREIGN KEY ("business_area_id") REFERENCES "business_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stickers" ADD CONSTRAINT "stickers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stickers" ADD CONSTRAINT "stickers_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stickers" ADD CONSTRAINT "stickers_sticker_template_id_fkey" FOREIGN KEY ("sticker_template_id") REFERENCES "sticker_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stickers" ADD CONSTRAINT "stickers_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stickers" ADD CONSTRAINT "stickers_credit_transaction_id_fkey" FOREIGN KEY ("credit_transaction_id") REFERENCES "credit_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roulette_entries" ADD CONSTRAINT "roulette_entries_roulette_id_fkey" FOREIGN KEY ("roulette_id") REFERENCES "roulettes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roulette_entries" ADD CONSTRAINT "roulette_entries_sticker_template_id_fkey" FOREIGN KEY ("sticker_template_id") REFERENCES "sticker_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roulette_rolls" ADD CONSTRAINT "roulette_rolls_roulette_id_fkey" FOREIGN KEY ("roulette_id") REFERENCES "roulettes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roulette_rolls" ADD CONSTRAINT "roulette_rolls_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roulette_rolls" ADD CONSTRAINT "roulette_rolls_grantee_id_fkey" FOREIGN KEY ("grantee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roulette_rolls" ADD CONSTRAINT "roulette_rolls_winning_entry_id_fkey" FOREIGN KEY ("winning_entry_id") REFERENCES "roulette_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_levels_roulettes" ADD CONSTRAINT "customer_levels_roulettes_customer_level_id_fkey" FOREIGN KEY ("customer_level_id") REFERENCES "customer_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_levels_roulettes" ADD CONSTRAINT "customer_levels_roulettes_roulette_id_fkey" FOREIGN KEY ("roulette_id") REFERENCES "roulettes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_campaigns" ADD CONSTRAINT "event_campaigns_sticker_template_id_fkey" FOREIGN KEY ("sticker_template_id") REFERENCES "sticker_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_charged_user_id_fkey" FOREIGN KEY ("charged_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_credited_user_id_fkey" FOREIGN KEY ("credited_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_conversions" ADD CONSTRAINT "credit_conversions_credit_transaction_id_fkey" FOREIGN KEY ("credit_transaction_id") REFERENCES "credit_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_conversions" ADD CONSTRAINT "credit_conversions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_conversions" ADD CONSTRAINT "credit_conversions_inverse_conversion_id_fkey" FOREIGN KEY ("inverse_conversion_id") REFERENCES "credit_conversions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_balances" ADD CONSTRAINT "company_balances_credit_conversion_id_fkey" FOREIGN KEY ("credit_conversion_id") REFERENCES "credit_conversions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cast_bank_accounts" ADD CONSTRAINT "cast_bank_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_credit_conversion_id_fkey" FOREIGN KEY ("credit_conversion_id") REFERENCES "credit_conversions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_credit_transaction_id_fkey" FOREIGN KEY ("credit_transaction_id") REFERENCES "credit_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewarding_rules" ADD CONSTRAINT "rewarding_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewarding_rules" ADD CONSTRAINT "rewarding_rules_override_id_fkey" FOREIGN KEY ("override_id") REFERENCES "rewarding_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

