CREATE TABLE `cook_log_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`cook_log_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`order` integer NOT NULL,
	FOREIGN KEY (`cook_log_id`) REFERENCES `cook_logs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cook_log_photos_cook_log_id_order_idx` ON `cook_log_photos` (`cook_log_id`,`order`);--> statement-breakpoint
CREATE TABLE `cook_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`cooked_at` text NOT NULL,
	`memo` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cook_logs_recipe_id_cooked_at_idx` ON `cook_logs` (`recipe_id`,`cooked_at`);--> statement-breakpoint
CREATE TABLE `ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`name` text NOT NULL,
	`amount` text,
	`order` integer NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ingredients_recipe_id_order_idx` ON `ingredients` (`recipe_id`,`order`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`order` integer NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `photos_recipe_id_order_idx` ON `photos` (`recipe_id`,`order`);--> statement-breakpoint
CREATE TABLE `recipe_tags` (
	`recipe_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`recipe_id`, `tag_id`),
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recipe_tags_tag_id_idx` ON `recipe_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`memo` text,
	`url` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recipes_user_id_updated_at_idx` ON `recipes` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `shopping_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`checked` integer DEFAULT false NOT NULL,
	`recipe_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `shopping_items_user_id_created_at_idx` ON `shopping_items` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `steps` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`body` text NOT NULL,
	`order` integer NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `steps_recipe_id_order_idx` ON `steps` (`recipe_id`,`order`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_user_id_name_unique` ON `tags` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_id` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_provider_provider_id_unique` ON `users` (`provider`,`provider_id`);