-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR NOT NULL,
    "role" VARCHAR NOT NULL,
    "coach_id" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" SERIAL NOT NULL,
    "timestamp" TIMESTAMP(6),
    "status" VARCHAR,
    "confidence" VARCHAR,
    "details" JSONB,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_menus" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR,
    "exercises" JSONB,
    "created_at" TIMESTAMP(6),
    "author_id" INTEGER,

    CONSTRAINT "training_menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_recaps" (
    "id" SERIAL NOT NULL,
    "menu_id" INTEGER,
    "user_id" INTEGER,
    "summary" JSONB,
    "completed_at" TIMESTAMP(6),

    CONSTRAINT "user_recaps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_users_id" ON "users"("id");

-- CreateIndex
CREATE INDEX "ix_users_coach_id" ON "users"("coach_id");

-- CreateIndex
CREATE INDEX "ix_activity_logs_id" ON "activity_logs"("id");

-- CreateIndex
CREATE INDEX "ix_training_menus_id" ON "training_menus"("id");

-- CreateIndex
CREATE INDEX "ix_training_menus_name" ON "training_menus"("name");

-- CreateIndex
CREATE INDEX "ix_training_menus_author_id" ON "training_menus"("author_id");

-- CreateIndex
CREATE INDEX "ix_user_recaps_id" ON "user_recaps"("id");

-- CreateIndex
CREATE INDEX "ix_user_recaps_user_id" ON "user_recaps"("user_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_menus" ADD CONSTRAINT "training_menus_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_recaps" ADD CONSTRAINT "user_recaps_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "training_menus"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_recaps" ADD CONSTRAINT "user_recaps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
