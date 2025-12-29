-- DropForeignKey
ALTER TABLE "training_menus" DROP CONSTRAINT "training_menus_author_id_fkey";

-- AlterTable
ALTER TABLE "training_menus" ADD COLUMN     "client_id" INTEGER;

-- AddForeignKey
ALTER TABLE "training_menus" ADD CONSTRAINT "training_menus_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "training_menus" ADD CONSTRAINT "training_menus_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
