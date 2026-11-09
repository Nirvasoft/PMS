-- Contact channels (phone, mobile, email, Viber, Telegram, WhatsApp, ...) as a JSON list.
ALTER TABLE "property_contacts" ADD COLUMN "channels" JSONB;
