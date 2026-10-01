CREATE TABLE `garage` (
	`id` text PRIMARY KEY NOT NULL,
	`brand` text NOT NULL,
	`model` text,
	`year` integer,
	`reg_no` text,
	`odometer_km` real
);
--> statement-breakpoint
CREATE TABLE `hazard_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`note` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `holidays` (
	`date` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`name_si` text,
	`name_ta` text,
	`kind` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kv` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `learner_progress` (
	`module_id` text PRIMARY KEY NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`quiz_score` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `packs` (
	`name` text PRIMARY KEY NOT NULL,
	`region` text NOT NULL,
	`size_bytes` integer,
	`downloaded_at` integer
);
--> statement-breakpoint
CREATE TABLE `pending_rides` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`distance_km` real DEFAULT 0 NOT NULL,
	`gpx` text,
	`samples` text,
	`started_at` integer,
	`ended_at` integer,
	`duration_s` integer,
	`moving_s` integer,
	`max_speed_kmh` real,
	`avg_speed_kmh` real,
	`max_lean` real,
	`elevation_gain_m` real,
	`elevation_loss_m` real,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `poi_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name_en` text NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`due_at` integer,
	`due_km` real,
	`note` text,
	`done` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `saved_routes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`coords` text NOT NULL,
	`km` real DEFAULT 0 NOT NULL,
	`min` real DEFAULT 0 NOT NULL,
	`engine` text DEFAULT 'gps' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sos_contacts_local` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`relation` text,
	`lang` text DEFAULT 'en' NOT NULL,
	`email` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
