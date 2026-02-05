-- Run this in your Supabase SQL Editor to unblock the migration
-- 1. Create Warehouses Table
CREATE TABLE IF NOT EXISTS "public"."warehouses" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);
-- Create Unique Index for Warehouse Name
CREATE UNIQUE INDEX IF NOT EXISTS "warehouses_name_key" ON "public"."warehouses"("name");
-- 2. Create Regions Table
CREATE TABLE IF NOT EXISTS "public"."regions" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);
-- Create Unique Index for Region Name
CREATE UNIQUE INDEX IF NOT EXISTS "regions_name_key" ON "public"."regions"("name");
-- 3. Ensure Projects Table exists (just in case)
CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "projects_name_key" ON "public"."projects"("name");