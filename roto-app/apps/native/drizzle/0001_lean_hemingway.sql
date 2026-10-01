CREATE TABLE `photo_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`ride_id` text NOT NULL,
	`local_uri` text NOT NULL,
	`url` text,
	`lat` real,
	`lon` real,
	`taken_at` integer NOT NULL,
	`caption` text,
	`uploaded_at` integer,
	`created_at` integer NOT NULL
);
